const router = require('express').Router();
const { z } = require('zod');
const { pool, withTransaction } = require('../config/db');
const { AppError, asyncHandler } = require('../utils/http');
const validate = require('../middleware/validate');
const { authenticate, staffOnly } = require('../middleware/auth');

router.use(authenticate);

// Live fine for unreturned overdue books; stored fine once returned.
const FINE_SQL = `CASE WHEN i.return_date IS NULL AND i.due_date < CURDATE()
                       THEN DATEDIFF(CURDATE(), i.due_date) * lp.fine_per_day
                       ELSE i.fine_amount END`;

const BASE = `
  SELECT i.issue_id, i.issue_date, i.due_date, i.return_date, i.renew_count, i.fine_paid, i.notes,
         ${FINE_SQL} AS fine,
         (i.return_date IS NULL AND i.due_date < CURDATE()) AS is_overdue,
         b.book_id, b.title, b.author, c.serial_no,
         u.user_id, u.name AS member_name, u.member_code, u.role AS member_role
  FROM issues i
  JOIN book_copies c ON c.copy_id = i.copy_id
  JOIN books b ON b.book_id = c.book_id
  JOIN users u ON u.user_id = i.user_id
  JOIN loan_policies lp ON lp.role = u.role`;

const listQuery = z.object({
  status: z.enum(['active', 'overdue', 'returned', 'unpaid_fine']).optional(),
  member_code: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

async function list(baseWhere, baseParams, q, res) {
  const where = [...baseWhere];
  const params = [...baseParams];
  if (q.status === 'active') where.push('i.return_date IS NULL');
  if (q.status === 'overdue') where.push('i.return_date IS NULL AND i.due_date < CURDATE()');
  if (q.status === 'returned') where.push('i.return_date IS NOT NULL');
  if (q.status === 'unpaid_fine') where.push('i.return_date IS NOT NULL AND i.fine_amount > 0 AND i.fine_paid = 0');
  if (q.member_code) { where.push('u.member_code = ?'); params.push(q.member_code); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM issues i JOIN users u ON u.user_id = i.user_id ${w}`, params);
  const [rows] = await pool.query(`${BASE} ${w} ORDER BY i.issue_date DESC, i.issue_id DESC LIMIT ? OFFSET ?`, [
    ...params, q.limit, (q.page - 1) * q.limit,
  ]);
  res.json({ page: q.page, limit: q.limit, total, results: rows });
}

// A member sees ONLY their own history (user id comes from the token, never from the request)
router.get('/my', validate(listQuery, 'query'), asyncHandler((req, res) =>
  list(['i.user_id = ?'], [req.user.id], req.valid.query, res)));

// Librarian/admin: all records, filterable
router.get('/', staffOnly, validate(listQuery, 'query'), asyncHandler((req, res) =>
  list([], [], req.valid.query, res)));

const idParam = z.object({ id: z.coerce.number().int().positive() });

router.get('/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`${BASE} WHERE i.issue_id = ?`, [req.valid.params.id]);
  if (!rows.length) throw new AppError(404, 'Issue record not found');
  if (rows[0].user_id !== req.user.id && !['admin', 'librarian'].includes(req.user.role)) {
    throw new AppError(404, 'Issue record not found'); // do not reveal that it exists
  }
  res.json(rows[0]);
}));

// ---------- ISSUE ----------
const issueSchema = z.object({ member_code: z.string().trim().min(1), serial_no: z.string().trim().min(1) });

router.post('/', staffOnly, validate(issueSchema), asyncHandler(async (req, res) => {
  const { member_code, serial_no } = req.valid.body;
  const maxUnpaid = Number(process.env.MAX_UNPAID_FINE || 0);

  const out = await withTransaction(async (conn) => {
    const [copies] = await conn.query(
      'SELECT copy_id, book_id, status FROM book_copies WHERE serial_no = ? FOR UPDATE', [serial_no]);
    if (!copies.length) throw new AppError(404, 'No copy with that serial number');
    const copy = copies[0];
    if (copy.status !== 'available') throw new AppError(409, `Copy is not available (status: ${copy.status})`);

    // Lock the member row so two librarians cannot push one member past the limit at once
    const [users] = await conn.query('SELECT user_id, role, status, name FROM users WHERE member_code = ? FOR UPDATE', [member_code]);
    if (!users.length) throw new AppError(404, 'Member not found');
    const member = users[0];
    if (member.status !== 'active') throw new AppError(409, 'Member account is suspended');

    const [[policy]] = await conn.query('SELECT * FROM loan_policies WHERE role = ?', [member.role]);

    const [[{ active }]] = await conn.query(
      'SELECT COUNT(*) AS active FROM issues WHERE user_id = ? AND return_date IS NULL', [member.user_id]);
    if (active >= policy.max_books) throw new AppError(409, `Limit reached: ${policy.max_books} books allowed for ${member.role}`);

    const [[{ overdue }]] = await conn.query(
      'SELECT COUNT(*) AS overdue FROM issues WHERE user_id = ? AND return_date IS NULL AND due_date < CURDATE()', [member.user_id]);
    if (overdue > 0) throw new AppError(409, 'Member has overdue books; return them first');

    const [[{ unpaid }]] = await conn.query(
      'SELECT COALESCE(SUM(fine_amount), 0) AS unpaid FROM issues WHERE user_id = ? AND return_date IS NOT NULL AND fine_paid = 0',
      [member.user_id]);
    if (Number(unpaid) > maxUnpaid) throw new AppError(409, `Member has unpaid fines: ${unpaid}`);

    const [dup] = await conn.query(
      `SELECT 1 FROM issues i JOIN book_copies c ON c.copy_id = i.copy_id
       WHERE i.user_id = ? AND c.book_id = ? AND i.return_date IS NULL LIMIT 1`, [member.user_id, copy.book_id]);
    if (dup.length) throw new AppError(409, 'Member already holds a copy of this book');

    const [ins] = await conn.query(
      `INSERT INTO issues (copy_id, user_id, issued_by, issue_date, due_date)
       VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? DAY))`,
      [copy.copy_id, member.user_id, req.user.id, policy.loan_days]);
    await conn.query("UPDATE book_copies SET status = 'issued' WHERE copy_id = ?", [copy.copy_id]);
    return ins.insertId;
  });

  const [rows] = await pool.query(`${BASE} WHERE i.issue_id = ?`, [out]);
  res.status(201).json(rows[0]);
}));

// ---------- RETURN ----------
const returnSchema = z.object({
  condition: z.enum(['good', 'damaged', 'lost']).default('good'),
  extra_charge: z.coerce.number().min(0).max(100000).default(0), // e.g. replacement cost
  notes: z.string().trim().max(255).optional(),
});

router.post('/:id/return', staffOnly, validate(idParam, 'params'), validate(returnSchema), asyncHandler(async (req, res) => {
  const { condition, extra_charge, notes } = req.valid.body;
  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT i.issue_id, i.copy_id, i.return_date, GREATEST(DATEDIFF(CURDATE(), i.due_date), 0) AS days_late, lp.fine_per_day
       FROM issues i JOIN users u ON u.user_id = i.user_id JOIN loan_policies lp ON lp.role = u.role
       WHERE i.issue_id = ? FOR UPDATE`, [req.valid.params.id]);
    if (!rows.length) throw new AppError(404, 'Issue record not found');
    const r = rows[0];
    if (r.return_date) throw new AppError(409, 'Already returned');

    const fine = r.days_late * Number(r.fine_per_day) + extra_charge;
    await conn.query(
      `UPDATE issues SET return_date = CURDATE(), received_by = ?, fine_amount = ?, fine_paid = ?, notes = COALESCE(?, notes)
       WHERE issue_id = ?`, [req.user.id, fine, fine === 0 ? 1 : 0, notes || null, r.issue_id]);
    const copyStatus = condition === 'good' ? 'available' : condition;
    await conn.query('UPDATE book_copies SET status = ? WHERE copy_id = ?', [copyStatus, r.copy_id]);
  });
  const [rows] = await pool.query(`${BASE} WHERE i.issue_id = ?`, [req.valid.params.id]);
  res.json(rows[0]);
}));

// ---------- RENEW ----------
router.post('/:id/renew', staffOnly, validate(idParam, 'params'), asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT i.issue_id, i.return_date, i.renew_count, i.due_date < CURDATE() AS overdue, lp.loan_days, lp.max_renewals
       FROM issues i JOIN users u ON u.user_id = i.user_id JOIN loan_policies lp ON lp.role = u.role
       WHERE i.issue_id = ? FOR UPDATE`, [req.valid.params.id]);
    if (!rows.length) throw new AppError(404, 'Issue record not found');
    const r = rows[0];
    if (r.return_date) throw new AppError(409, 'Book already returned');
    if (r.overdue) throw new AppError(409, 'Overdue books cannot be renewed');
    if (r.renew_count >= r.max_renewals) throw new AppError(409, `Renewal limit reached (${r.max_renewals})`);
    await conn.query(
      'UPDATE issues SET due_date = DATE_ADD(CURDATE(), INTERVAL ? DAY), renew_count = renew_count + 1 WHERE issue_id = ?',
      [r.loan_days, r.issue_id]);
  });
  const [rows] = await pool.query(`${BASE} WHERE i.issue_id = ?`, [req.valid.params.id]);
  res.json(rows[0]);
}));

// ---------- PAY FINE ----------
router.post('/:id/pay-fine', staffOnly, validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const [r] = await pool.query(
    `UPDATE issues SET fine_paid = 1, fine_paid_at = NOW()
     WHERE issue_id = ? AND return_date IS NOT NULL AND fine_amount > 0 AND fine_paid = 0`, [req.valid.params.id]);
  if (!r.affectedRows) throw new AppError(409, 'No unpaid fine on a returned book for this record');
  res.json({ message: 'Fine marked as paid' });
}));

module.exports = router;

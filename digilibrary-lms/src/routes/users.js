const router = require('express').Router();
const { z } = require('zod');
const { pool } = require('../config/db');
const { AppError, asyncHandler } = require('../utils/http');
const { escapeLike, buildUpdate } = require('../utils/helpers');
const validate = require('../middleware/validate');
const { authenticate, staffOnly } = require('../middleware/auth');

router.use(authenticate);

const COLS = `user_id, member_code, name, email, role, phone, address, department, course,
              year_of_study, enrollment_no, employee_id, designation, status, created_at`;

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['admin', 'librarian', 'staff', 'faculty', 'student']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Librarian/admin: find members (by name, email or member code)
router.get(
  '/',
  staffOnly,
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { q, role, status, page, limit } = req.valid.query;
    const where = ['1=1'];
    const params = [];
    if (q) {
      const like = `%${escapeLike(q)}%`;
      where.push('(name LIKE ? OR email LIKE ? OR member_code LIKE ?)');
      params.push(like, like, like);
    }
    if (role) { where.push('role = ?'); params.push(role); }
    if (status) { where.push('status = ?'); params.push(status); }
    const w = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users WHERE ${w}`, params);
    const [rows] = await pool.query(`SELECT ${COLS} FROM users WHERE ${w} ORDER BY name LIMIT ? OFFSET ?`, [
      ...params, limit, (page - 1) * limit,
    ]);
    res.json({ page, limit, total, results: rows });
  })
);

const idParam = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const id = req.valid.params.id;
    if (id !== req.user.id && !['admin', 'librarian'].includes(req.user.role)) throw new AppError(403, 'Not allowed');
    const [rows] = await pool.query(`SELECT ${COLS} FROM users WHERE user_id = ?`, [id]);
    if (!rows.length) throw new AppError(404, 'User not found');
    res.json(rows[0]);
  })
);

const selfFields = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,20}$/).optional(),
  address: z.string().trim().min(5).max(300).optional(),
});
const adminFields = selfFields.extend({
  role: z.enum(['admin', 'librarian', 'staff', 'faculty', 'student']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  department: z.string().trim().max(100).optional(),
  course: z.string().trim().max(100).optional(),
  year_of_study: z.coerce.number().int().min(1).max(8).optional(),
  designation: z.string().trim().max(100).optional(),
});

// Members edit their own contact details; admin can edit anyone (incl. role/status)
router.patch(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const id = req.valid.params.id;
    const isAdmin = req.user.role === 'admin';
    if (id !== req.user.id && !isAdmin) throw new AppError(403, 'Not allowed');

    const data = (isAdmin ? adminFields : selfFields).parse(req.body);
    if (isAdmin && id === req.user.id && (data.role || data.status)) {
      throw new AppError(400, 'Admins cannot change their own role or status');
    }
    const upd = buildUpdate(data, Object.keys(adminFields.shape));
    if (upd.empty) throw new AppError(400, 'Nothing to update');
    const [r] = await pool.query(`UPDATE users SET ${upd.sql} WHERE user_id = ?`, [...upd.params, id]);
    if (!r.affectedRows) throw new AppError(404, 'User not found');
    const [rows] = await pool.query(`SELECT ${COLS} FROM users WHERE user_id = ?`, [id]);
    res.json(rows[0]);
  })
);

module.exports = router;

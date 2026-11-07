const router = require('express').Router();
const { z } = require('zod');
const { pool, withTransaction } = require('../config/db');
const { AppError, asyncHandler } = require('../utils/http');
const { pad, escapeLike, buildUpdate } = require('../utils/helpers');
const validate = require('../middleware/validate');
const { authenticate, staffOnly, adminOnly } = require('../middleware/auth');

router.use(authenticate);

// ---------- helpers ----------
const TOTAL_SQL = `(SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.book_id AND c.status <> 'lost')`;
const AVAIL_SQL = `(SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.book_id AND c.status = 'available')`;
const SUBJECTS_SQL = `(SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR '||')
                       FROM book_subjects bs JOIN subjects s ON s.subject_id = bs.subject_id
                       WHERE bs.book_id = b.book_id)`;

const shape = (r) => ({
  book_id: r.book_id, title: r.title, author: r.author, isbn: r.isbn, publisher: r.publisher,
  publication_year: r.publication_year, edition: r.edition, language: r.language,
  call_number: r.call_number, shelf_location: r.shelf_location, description: r.description,
  subjects: r.subjects ? r.subjects.split('||') : [],
  availability: {
    available: Number(r.available_copies),
    total: Number(r.total_copies),
    is_available: Number(r.available_copies) > 0,
  },
});

async function setSubjects(conn, bookId, names) {
  await conn.query('DELETE FROM book_subjects WHERE book_id = ?', [bookId]);
  for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
    const [r] = await conn.query(
      'INSERT INTO subjects (name) VALUES (?) ON DUPLICATE KEY UPDATE subject_id = LAST_INSERT_ID(subject_id)',
      [name]
    );
    await conn.query('INSERT IGNORE INTO book_subjects (book_id, subject_id) VALUES (?, ?)', [bookId, r.insertId]);
  }
}

// Adds `count` copies with auto serial numbers BK00012-001, BK00012-002 ...
async function addCopies(conn, bookId, count) {
  await conn.query('SELECT book_id FROM books WHERE book_id = ? FOR UPDATE', [bookId]);
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM book_copies WHERE book_id = ?', [bookId]);
  const serials = [];
  for (let i = 1; i <= count; i++) {
    const serial = `BK${pad(bookId, 5)}-${pad(n + i, 3)}`;
    await conn.query('INSERT INTO book_copies (book_id, serial_no) VALUES (?, ?)', [bookId, serial]);
    serials.push(serial);
  }
  return serials;
}

// ---------- search ----------
const searchQuery = z.object({
  q: z.string().trim().max(150).optional(),
  subject: z.string().trim().max(100).optional(),
  available_only: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * Search by title / author / ISBN / subject.
 * Ranking: exact title match -> exact ISBN -> subject match -> full-text relevance -> title A-Z.
 * Each result carries availability {available, total} for the right-hand column in the UI.
 */
router.get(
  '/',
  validate(searchQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { q, subject, available_only, page, limit } = req.valid.query;
    const where = ['1=1'];
    const wParams = [];
    let scoreSql = '0';
    const selParams = [];
    const ordParams = [];
    let order = 'b.title ASC';

    if (q) {
      const like = `%${escapeLike(q)}%`;
      const subjectHit = `EXISTS (SELECT 1 FROM book_subjects bs JOIN subjects s ON s.subject_id = bs.subject_id
                                  WHERE bs.book_id = b.book_id AND s.name LIKE ?)`;
      where.push(`(b.title = ? OR b.isbn = ? OR b.title LIKE ? OR b.author LIKE ? OR ${subjectHit}
                   OR MATCH(b.title, b.author, b.description) AGAINST (? IN NATURAL LANGUAGE MODE))`);
      wParams.push(q, q, like, like, like, q);

      scoreSql = 'MATCH(b.title, b.author, b.description) AGAINST (? IN NATURAL LANGUAGE MODE)';
      selParams.push(q);
      order = `(b.title = ?) DESC, (b.isbn = ?) DESC, ${subjectHit.replace('EXISTS', '(EXISTS')}) DESC, score DESC, b.title ASC`;
      ordParams.push(q, q, like);
    }
    if (subject) {
      where.push(`EXISTS (SELECT 1 FROM book_subjects bs JOIN subjects s ON s.subject_id = bs.subject_id
                          WHERE bs.book_id = b.book_id AND s.name = ?)`);
      wParams.push(subject);
    }
    if (available_only === 'true') {
      where.push(`EXISTS (SELECT 1 FROM book_copies c WHERE c.book_id = b.book_id AND c.status = 'available')`);
    }

    const w = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM books b WHERE ${w}`, wParams);
    const [rows] = await pool.query(
      `SELECT b.*, ${TOTAL_SQL} AS total_copies, ${AVAIL_SQL} AS available_copies,
              ${SUBJECTS_SQL} AS subjects, ${scoreSql} AS score
       FROM books b WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...selParams, ...wParams, ...ordParams, limit, (page - 1) * limit]
    );
    res.json({ page, limit, total, results: rows.map(shape) });
  })
);

router.get(
  '/subjects/list',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT s.name, COUNT(bs.book_id) AS books FROM subjects s
       LEFT JOIN book_subjects bs ON bs.subject_id = s.subject_id GROUP BY s.subject_id ORDER BY s.name`
    );
    res.json(rows);
  })
);

// ---------- details ("more details" section) ----------
const idParam = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.valid.params;
    const [rows] = await pool.query(
      `SELECT b.*, ${TOTAL_SQL} AS total_copies, ${AVAIL_SQL} AS available_copies, ${SUBJECTS_SQL} AS subjects
       FROM books b WHERE b.book_id = ?`,
      [id]
    );
    if (!rows.length) throw new AppError(404, 'Book not found');
    const book = shape(rows[0]);

    const isStaff = ['admin', 'librarian'].includes(req.user.role);
    const [copies] = await pool.query(
      `SELECT c.copy_id, c.serial_no, c.status,
              ${isStaff ? `i.due_date, u.name AS borrower_name, u.member_code AS borrower_code` : `i.due_date`}
       FROM book_copies c
       LEFT JOIN issues i ON i.copy_id = c.copy_id AND i.return_date IS NULL
       ${isStaff ? 'LEFT JOIN users u ON u.user_id = i.user_id' : ''}
       WHERE c.book_id = ? ORDER BY c.serial_no`,
      [id]
    );

    const [related] = await pool.query(
      `SELECT DISTINCT b2.book_id, b2.title, b2.author
       FROM book_subjects a JOIN book_subjects o ON o.subject_id = a.subject_id AND o.book_id <> a.book_id
       JOIN books b2 ON b2.book_id = o.book_id WHERE a.book_id = ? LIMIT 6`,
      [id]
    );

    res.json({ ...book, copies, related_books: related });
  })
);

// ---------- catalogue management (librarian/admin) ----------
const bookFields = {
  title: z.string().trim().min(1).max(250),
  author: z.string().trim().min(1).max(200),
  isbn: z.string().trim().max(20).optional(),
  publisher: z.string().trim().max(150).optional(),
  publication_year: z.coerce.number().int().min(1000).max(new Date().getFullYear() + 1).optional(),
  edition: z.string().trim().max(50).optional(),
  language: z.string().trim().max(40).optional(),
  description: z.string().trim().max(5000).optional(),
  call_number: z.string().trim().max(50).optional(),
  shelf_location: z.string().trim().max(60).optional(),
  subjects: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
};
const createSchema = z.object({ ...bookFields, copies: z.coerce.number().int().min(0).max(200).default(1) });
const updateSchema = z.object(bookFields).partial();

router.post(
  '/',
  staffOnly,
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { subjects = [], copies, ...b } = req.valid.body;
    const out = await withTransaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO books (title, author, isbn, publisher, publication_year, edition, language, description, call_number, shelf_location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.title, b.author, b.isbn || null, b.publisher || null, b.publication_year || null, b.edition || null,
         b.language || 'English', b.description || null, b.call_number || null, b.shelf_location || null]
      );
      await setSubjects(conn, r.insertId, subjects);
      const serials = await addCopies(conn, r.insertId, copies);
      return { book_id: r.insertId, serial_numbers: serials };
    });
    res.status(201).json(out);
  })
);

router.patch(
  '/:id',
  staffOnly,
  validate(idParam, 'params'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.valid.params;
    const { subjects, ...fields } = req.valid.body;
    await withTransaction(async (conn) => {
      const upd = buildUpdate(fields, Object.keys(bookFields));
      if (!upd.empty) {
        const [r] = await conn.query(`UPDATE books SET ${upd.sql} WHERE book_id = ?`, [...upd.params, id]);
        if (!r.affectedRows) throw new AppError(404, 'Book not found');
      }
      if (subjects) await setSubjects(conn, id, subjects);
    });
    res.json({ message: 'Book updated' });
  })
);

router.post(
  '/:id/copies',
  staffOnly,
  validate(idParam, 'params'),
  validate(z.object({ count: z.coerce.number().int().min(1).max(200) })),
  asyncHandler(async (req, res) => {
    const serials = await withTransaction((conn) => addCopies(conn, req.valid.params.id, req.valid.body.count));
    res.status(201).json({ serial_numbers: serials });
  })
);

// Mark a copy damaged / lost / back to available (cannot touch a copy that is currently issued)
router.patch(
  '/copies/:copyId',
  staffOnly,
  validate(z.object({ status: z.enum(['available', 'damaged', 'lost']) })),
  asyncHandler(async (req, res) => {
    const [r] = await pool.query(
      `UPDATE book_copies SET status = ? WHERE copy_id = ? AND status <> 'issued'`,
      [req.valid.body.status, req.params.copyId]
    );
    if (!r.affectedRows) throw new AppError(409, 'Copy not found or currently issued');
    res.json({ message: 'Copy status updated' });
  })
);

router.delete(
  '/:id',
  adminOnly,
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    // Fails with 409 if any copy has issue history (FK), preserving records.
    const [r] = await pool.query('DELETE FROM books WHERE book_id = ?', [req.valid.params.id]);
    if (!r.affectedRows) throw new AppError(404, 'Book not found');
    res.json({ message: 'Book deleted' });
  })
);

module.exports = router;

const router = require('express').Router();
const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/http');
const { authenticate, staffOnly } = require('../middleware/auth');

router.get('/summary', authenticate, staffOnly, asyncHandler(async (req, res) => {
  const [[t]] = await pool.query(`SELECT COUNT(*) AS titles FROM books`);
  const [[c]] = await pool.query(`SELECT
      SUM(status <> 'lost') AS total_copies, SUM(status = 'available') AS available,
      SUM(status = 'issued') AS issued, SUM(status = 'damaged') AS damaged, SUM(status = 'lost') AS lost
    FROM book_copies`);
  const [[o]] = await pool.query(`SELECT COUNT(*) AS overdue FROM issues WHERE return_date IS NULL AND due_date < CURDATE()`);
  const [[f]] = await pool.query(`SELECT COALESCE(SUM(fine_amount),0) AS unpaid_fines FROM issues WHERE return_date IS NOT NULL AND fine_paid = 0`);
  const [members] = await pool.query(`SELECT role, COUNT(*) AS count FROM users GROUP BY role`);
  res.json({ titles: t.titles, copies: c, overdue_books: o.overdue, unpaid_fines: Number(f.unpaid_fines), members_by_role: members });
}));

module.exports = router;

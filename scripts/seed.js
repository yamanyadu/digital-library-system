// Creates the FIRST admin (nobody can self-register as admin without a code) and optional sample books.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

(async () => {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
  if (!existing.length) {
    const hash = await bcrypt.hash(process.env.BOOTSTRAP_ADMIN_PASSWORD, 12);
    const [r] = await pool.query(
      `INSERT INTO users (member_code, name, email, password_hash, role, address) VALUES (?, ?, ?, ?, 'admin', 'Library Office')`,
      ['TMP-ADMIN', process.env.BOOTSTRAP_ADMIN_NAME || 'Library Admin', email, hash]);
    await pool.query('UPDATE users SET member_code = ? WHERE user_id = ?',
      [`ADM-${new Date().getFullYear()}-${String(r.insertId).padStart(5, '0')}`, r.insertId]);
    console.log('Admin created:', email);
  } else console.log('Admin already exists:', email);

  if (process.argv.includes('--sample')) {
    // Reuse the real route logic through direct SQL for a few demo titles
    const samples = [
      ['Linear Algebra and Its Applications', 'David C. Lay', '9780321982384', ['Mathematics', 'Linear Algebra'], 3],
      ['Introduction to Algorithms', 'Thomas H. Cormen', '9780262046305', ['Computer Science', 'Algorithms'], 2],
      ['Advanced Engineering Mathematics', 'Erwin Kreyszig', '9780470458365', ['Mathematics', 'Engineering'], 4],
      ['Database System Concepts', 'Abraham Silberschatz', '9780078022159', ['Computer Science', 'Databases'], 2],
    ];
    for (const [title, author, isbn, subjects, copies] of samples) {
      const [ex] = await pool.query('SELECT book_id FROM books WHERE isbn = ?', [isbn]);
      if (ex.length) continue;
      const [b] = await pool.query('INSERT INTO books (title, author, isbn) VALUES (?, ?, ?)', [title, author, isbn]);
      for (const s of subjects) {
        const [sr] = await pool.query('INSERT INTO subjects (name) VALUES (?) ON DUPLICATE KEY UPDATE subject_id = LAST_INSERT_ID(subject_id)', [s]);
        await pool.query('INSERT IGNORE INTO book_subjects VALUES (?, ?)', [b.insertId, sr.insertId]);
      }
      for (let n = 1; n <= copies; n++) {
        await pool.query('INSERT INTO book_copies (book_id, serial_no) VALUES (?, ?)',
          [b.insertId, `BK${String(b.insertId).padStart(5, '0')}-${String(n).padStart(3, '0')}`]);
      }
    }
    console.log('Sample books added.');
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });

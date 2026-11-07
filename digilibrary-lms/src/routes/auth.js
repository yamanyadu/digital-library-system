const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { pool, withTransaction } = require('../config/db');
const { AppError, asyncHandler } = require('../utils/http');
const { pad, ROLE_PREFIX } = require('../utils/helpers');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

// Fields that MUST be supplied for each role (department/course details depend on role)
const REQUIRED_BY_ROLE = {
  student: ['department', 'course', 'year_of_study', 'enrollment_no'],
  faculty: ['department', 'employee_id', 'designation'],
  staff: ['department', 'employee_id', 'designation', 'registration_code'],
  librarian: ['employee_id', 'registration_code'],
  admin: ['registration_code'],
};

const opt = (max) => z.string().trim().min(1).max(max).optional();

const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(150),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    role: z.enum(['student', 'faculty', 'staff', 'librarian', 'admin']),
    address: z.string().trim().min(5).max(300),
    phone: z.string().trim().regex(/^[0-9+\-\s]{7,20}$/, 'Invalid phone number').optional(),
    department: opt(100),
    course: opt(100),
    year_of_study: z.coerce.number().int().min(1).max(8).optional(),
    enrollment_no: opt(40),
    employee_id: opt(40),
    designation: opt(100),
    registration_code: opt(30),
  })
  .superRefine((d, ctx) => {
    for (const field of REQUIRED_BY_ROLE[d.role]) {
      if (d[field] === undefined) {
        ctx.addIssue({ code: 'custom', path: [field], message: `${field} is required for role "${d.role}"` });
      }
    }
  });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const sign = (user) =>
  jwt.sign({ sub: user.user_id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

const PRIVILEGED = ['admin', 'librarian', 'staff'];

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const d = req.valid.body;
    const hash = await bcrypt.hash(d.password, 12);

    const user = await withTransaction(async (conn) => {
      // Privileged roles need a valid, unused, unexpired code issued for that exact role.
      let codeRow = null;
      if (PRIVILEGED.includes(d.role)) {
        const [codes] = await conn.query(
          'SELECT code_id, role, used_by, expires_at < NOW() AS expired FROM registration_codes WHERE code = ? FOR UPDATE',
          [d.registration_code]
        );
        codeRow = codes[0];
        if (!codeRow || codeRow.role !== d.role || codeRow.used_by || codeRow.expired) {
          throw new AppError(403, 'Invalid, expired or already used registration code');
        }
      }

      const [ins] = await conn.query(
        `INSERT INTO users (member_code, name, email, password_hash, role, phone, address,
                            department, course, year_of_study, enrollment_no, employee_id, designation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'TMP-' + Date.now() + Math.random().toString(36).slice(2, 8), // replaced just below
          d.name, d.email, hash, d.role, d.phone || null, d.address,
          d.department || null, d.course || null, d.year_of_study || null,
          d.enrollment_no || null, d.employee_id || null, d.designation || null,
        ]
      );
      const memberCode = `${ROLE_PREFIX[d.role]}-${new Date().getFullYear()}-${pad(ins.insertId, 5)}`;
      await conn.query('UPDATE users SET member_code = ? WHERE user_id = ?', [memberCode, ins.insertId]);

      if (codeRow) {
        await conn.query('UPDATE registration_codes SET used_by = ?, used_at = NOW() WHERE code_id = ?', [
          ins.insertId, codeRow.code_id,
        ]);
      }
      return { user_id: ins.insertId, member_code: memberCode, name: d.name, email: d.email, role: d.role };
    });

    res.status(201).json({ token: sign(user), user });
  })
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.valid.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new AppError(401, 'Invalid email or password');
    if (u.status !== 'active') throw new AppError(403, 'Account is suspended. Contact the library.');
    res.json({
      token: sign(u),
      user: { user_id: u.user_id, member_code: u.member_code, name: u.name, email: u.email, role: u.role },
    });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT user_id, member_code, name, email, role, phone, address, department, course,
              year_of_study, enrollment_no, employee_id, designation, status, created_at
       FROM users WHERE user_id = ?`,
      [req.user.id]
    );
    res.json(rows[0]);
  })
);

router.post(
  '/change-password',
  authenticate,
  validate(z.object({ current_password: z.string().min(1), new_password: z.string().min(8).max(72) })),
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.valid.body;
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.id]);
    if (!(await bcrypt.compare(current_password, rows[0].password_hash))) throw new AppError(401, 'Current password is wrong');
    await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [await bcrypt.hash(new_password, 12), req.user.id]);
    res.json({ message: 'Password updated' });
  })
);

module.exports = router;

const router = require('express').Router();
const { z } = require('zod');
const { pool } = require('../config/db');
const { AppError, asyncHandler } = require('../utils/http');
const { randomCode, ROLE_PREFIX } = require('../utils/helpers');
const validate = require('../middleware/validate');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate, adminOnly);

const createSchema = z.object({
  role: z.enum(['admin', 'librarian', 'staff']),
  count: z.coerce.number().int().min(1).max(50).default(1),
  expires_in_days: z.coerce.number().int().min(1).max(90).default(7),
});

// Admin generates one-time codes to hand to a new admin / librarian / staff member
router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { role, count, expires_in_days } = req.valid.body;
    const created = [];
    for (let i = 0; i < count; i++) {
      const code = randomCode(ROLE_PREFIX[role]);
      await pool.query(
        'INSERT INTO registration_codes (code, role, created_by, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
        [code, role, req.user.id, expires_in_days]
      );
      created.push(code);
    }
    res.status(201).json({ role, expires_in_days, codes: created });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT rc.code, rc.role, rc.expires_at, rc.created_at, rc.used_at,
              u.name AS used_by_name, u.member_code AS used_by_member_code,
              CASE WHEN rc.used_by IS NOT NULL THEN 'used'
                   WHEN rc.expires_at < NOW() THEN 'expired' ELSE 'unused' END AS status
       FROM registration_codes rc LEFT JOIN users u ON u.user_id = rc.used_by
       ORDER BY rc.created_at DESC LIMIT 200`
    );
    res.json(rows);
  })
);

router.delete(
  '/:code',
  asyncHandler(async (req, res) => {
    const [r] = await pool.query('DELETE FROM registration_codes WHERE code = ? AND used_by IS NULL', [req.params.code]);
    if (!r.affectedRows) throw new AppError(404, 'Unused code not found');
    res.json({ message: 'Code revoked' });
  })
);

module.exports = router;

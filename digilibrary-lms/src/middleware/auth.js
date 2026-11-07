const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { AppError, asyncHandler } = require('../utils/http');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }

  // Re-check the DB on every request so suspended users / role changes apply immediately.
  const [rows] = await pool.query(
    'SELECT user_id, member_code, name, email, role, status FROM users WHERE user_id = ?',
    [payload.sub]
  );
  if (!rows.length) throw new AppError(401, 'Account no longer exists');
  if (rows[0].status !== 'active') throw new AppError(403, 'Account is suspended');

  req.user = { id: rows[0].user_id, ...rows[0] };
  next();
});

const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new AppError(403, 'You do not have permission for this action'));

module.exports = {
  authenticate,
  authorize,
  adminOnly: authorize('admin'),
  staffOnly: authorize('admin', 'librarian'), // "library staff" = admin + librarian
};

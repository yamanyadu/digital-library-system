const { ZodError } = require('zod');

module.exports = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err.status) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Duplicate value: ' + (err.sqlMessage || '') });
  if (err.errno === 1451) return res.status(409).json({ error: 'Cannot delete: record is referenced by other data' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};

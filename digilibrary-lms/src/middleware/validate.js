// validate(schema, 'body' | 'query' | 'params') -> parsed data in req.valid[source]
module.exports = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error);
  req.valid = { ...(req.valid || {}), [source]: result.data };
  next();
};

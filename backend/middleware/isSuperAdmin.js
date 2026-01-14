module.exports = function isSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin privileges required.' });
  }
  return next();
};

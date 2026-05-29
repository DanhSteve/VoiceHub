function requireUser(req, res, next) {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }
  return next();
}

module.exports = requireUser;

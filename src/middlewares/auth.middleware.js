const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Not authorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token failed' });
  }
};

const requireRoles = (...allowedRoles) => (req, res, next) => {
  const role = req.user?.role;
  if (!role || !allowedRoles.includes(role)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};

/** JWT user id must match :paramName, or caller has one of allowedRoles. */
const allowSelfOrRoles = (paramName, ...allowedRoles) => (req, res, next) => {
  const paramId = Number(req.params[paramName]);
  if (Number.isInteger(paramId) && req.user?.id === paramId) {
    return next();
  }
  const role = req.user?.role;
  if (role && allowedRoles.includes(role)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Forbidden' });
};

module.exports = { protect, requireRoles, allowSelfOrRoles };

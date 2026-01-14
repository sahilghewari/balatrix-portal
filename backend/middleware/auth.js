const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { ensureSecretStrong } = require('../utils/jwt');

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_ALGO = process.env.JWT_ALGORITHM || 'HS256';

ensureSecretStrong(JWT_SECRET);

function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return res.status(401).json({ message: 'Authorization header missing or malformed.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [TOKEN_ALGO] });
    if (!decoded || !decoded.userId || !decoded.role) {
      return res.status(401).json({ message: 'Invalid authentication token.' });
    }

    req.user = {
      id: decoded.userId,
      role: decoded.role,
      ...decoded,
    };

    return next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({ message: 'Invalid or expired authentication token.' });
  }
}

function requireRole(role) {
  const allowed = Array.isArray(role) ? role : [role];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions.' });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  requireRole,
};

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const getJwtSecret = () => String(process.env.JWT_SECRET || '').trim();

const normalizeToken = (rawToken) => {
  if (!rawToken) return null;

  let token = String(rawToken).trim();
  if (!token) return null;

  if (token.startsWith('Bearer ')) {
    token = token.slice(7).trim();
  }

  // Handle accidentally stringified localStorage values like "\"ey...\""
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }

  if (!token || token === 'null' || token === 'undefined') {
    return null;
  }

  return token;
};

/**
 * Middleware xác thực JWT cho HTTP requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const authenticate = (req, res, next) => {
  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      logger.error('JWT_SECRET is not configured');
      return res.status(500).json({
        success: false,
        message: 'Authentication service misconfigured',
      });
    }

    // Lấy token từ header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    // Extract token
    const token = normalizeToken(authHeader.split(' ')[1]);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    // Verify token
    try {
      const decoded = jwt.verify(token, jwtSecret);
      
      // Gắn user info vào request
      req.user = {
        id: decoded.id,
        email: decoded.email,
        ...decoded,
      };

      logger.debug(`User authenticated: ${req.user.id}`);
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.warn('Token expired');
        return res.status(401).json({
          success: false,
          message: 'Token expired',
        });
      }

      if (error.name === 'JsonWebTokenError') {
        logger.warn('Invalid token');
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
        });
      }

      throw error;
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
};

/**
 * Middleware xác thực JWT cho Socket.IO
 * @param {Object} socket - Socket.IO socket object
 * @param {Function} next - Next middleware function
 */
const socketAuth = (socket, next) => {
  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      logger.error('JWT_SECRET is not configured');
      return next(new Error('Authentication service misconfigured'));
    }

    const authHeader = socket.handshake.headers?.authorization;
    const tokenFromHeader = authHeader?.split?.(' ')?.[1];
    const rawToken =
      socket.handshake.auth?.token || tokenFromHeader;
    const token = normalizeToken(rawToken);

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, jwtSecret);
    const normalizedUser = {
      ...decoded,
      id: decoded.id || decoded.userId || decoded._id,
      userId: decoded.userId || decoded.id || decoded._id,
    };

    if (!normalizedUser.id) {
      return next(new Error('Authentication error: Invalid token payload'));
    }

    socket.user = normalizedUser;
    socket.data = socket.data || {};
    socket.data.user = normalizedUser;
    
    logger.debug(`Socket authenticated: ${socket.user.id}`);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Socket token expired');
      return next(new Error('Authentication error: Token expired'));
    }

    if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid socket token');
      return next(new Error('Authentication error: Invalid token'));
    }

    logger.error('Socket authentication error:', error);
    next(new Error('Authentication error: Invalid token'));
  }
};

/**
 * Optional authentication - không bắt buộc token
 * Nếu có token thì verify, không có thì bỏ qua
 */
const optionalAuth = (req, res, next) => {
  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = normalizeToken(authHeader.split(' ')[1]);
      if (!token) {
        return next();
      }
      
      try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = {
          id: decoded.id,
          email: decoded.email,
          ...decoded,
        };
      } catch (error) {
        // Ignore error, continue without user
        logger.debug('Optional auth failed, continuing without user');
      }
    }

    next();
  } catch (error) {
    // Ignore error, continue without user
    next();
  }
};

module.exports = {
  authenticate,
  socketAuth,
  optionalAuth,
};




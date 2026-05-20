const jwt = require('jsonwebtoken');
const { isPublicRoute } = require('../config/services');

const getJwtSecret = () => String(process.env.JWT_SECRET || '').trim();

/**
 * Middleware xác thực JWT
 * Verify JWT token và gắn req.user
 */
const authMiddleware = (req, res, next) => {
  // Lấy path không có query string để check public route (Express 5 / proxy: dùng thêm originalUrl)
  const pathWithoutQuery = req.path.split('?')[0];
  const fromOriginal = String(req.originalUrl || req.url || '')
    .split('?')[0]
    .replace(/\/+/g, '/');

  // Bỏ qua các route public
  if (
    isPublicRoute(pathWithoutQuery) ||
    isPublicRoute(fromOriginal) ||
    pathWithoutQuery === '/api/health/gateway-trust' ||
    fromOriginal.endsWith('/api/health/gateway-trust')
  ) {
    console.log(`[API-Gateway] Public route detected: ${pathWithoutQuery}, skipping authentication`);
    return next();
  }
  
  console.log(`[API-Gateway] Protected route: ${req.path}, checking authentication...`);

  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
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
    const token = authHeader.split(' ')[1];

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
        id: decoded.id || decoded.userId || decoded._id,
        email: decoded.email,
        ...decoded,
      };

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired',
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
        });
      }

      throw error;
    }
  } catch (error) {
    console.error('[API-Gateway] authMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
};

module.exports = authMiddleware;





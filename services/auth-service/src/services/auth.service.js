const UserAuth = require('../models/UserAuth');
const { validateRegistrationDateOfBirth } = require('../utils/dateOfBirth');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../config/jwt');
const { getRedisClient } = require('/shared');
const emailService = require('../utils/email');
const { bootstrapUserProfile } = require('../utils/bootstrapUserProfile');
const crypto = require('crypto');
const { mongoose } = require('/shared/config/mongo');
const {
  findUserAuthByEmail,
  hydrateAuthEmailDoc,
  writeEmailFields,
  normalizeEmail,
} = require('../utils/authEmailPii');

function createServiceError(message, statusCode = 400, errorCode = 'AUTH_VALIDATION') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}
async function ensureMongoReady(scope = 'AUTH') {
  const readyState = mongoose.connection.readyState;
  console.log(
    `[AuthService] [${scope}] MongoDB readyState:`,
    readyState,
    '(1=connected, 2=connecting, 0=disconnected)'
  );
  if (readyState === 1) return;
  // Không reconnect trong request để tránh reset connection pool cạnh tranh với background reconnect.
  throw createServiceError('Hệ thống đang bận. Vui lòng thử lại sau.', 503, 'AUTH_DB_UNAVAILABLE');
}

class AuthService {
  // Đăng ký user mới
  async register(userData, frontendUrl) {
    try {
      const { email, password, firstName, lastName, dateOfBirth } = userData;
      const normalizedEmail = normalizeEmail(email);

      // Validate required fields
      if (!normalizedEmail || !password) {
        throw new Error('Email and password are required');
      }

      if (!firstName || !lastName) {
        throw new Error('First name and last name are required');
      }

      const dobCheck = validateRegistrationDateOfBirth(dateOfBirth);
      if (!dobCheck.ok) {
        throw new Error(dobCheck.message);
      }

      // Kiểm tra trạng thái kết nối theo fail-fast, không reconnect trong request.
      await ensureMongoReady('REGISTER');

      // Kiểm tra email đã tồn tại chưa
      console.log('[AuthService] Checking if email exists:', normalizedEmail);
      try {
        const existingUser = await findUserAuthByEmail(normalizedEmail, {
          maxTimeMS: 15000,
          lean: true,
        });
        
        if (existingUser) {
          console.log('[AuthService] Email already exists');
          throw createServiceError('Email đã được sử dụng', 400, 'AUTH_EMAIL_EXISTS');
        }
        console.log('[AuthService] ✅ Email is available');
      } catch (error) {
        if (error.errorCode === 'AUTH_EMAIL_EXISTS') {
          throw error;
        }
        console.error('[AuthService] ❌ Error checking email:', error.message);
        console.error('[AuthService] Error code:', error.code);
        console.error('[AuthService] Error name:', error.name);
        
        // Nếu là connection error, throw với message rõ ràng hơn
        if (error.name === 'MongoServerError' || error.message.includes('buffering') || error.message.includes('timeout')) {
          throw createServiceError('Hệ thống đang bận. Vui lòng thử lại sau.', 503, 'AUTH_DB_UNAVAILABLE');
        }
        throw createServiceError('Không thể xử lý đăng ký lúc này. Vui lòng thử lại.', 500, 'AUTH_INTERNAL_ERROR');
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.errors.join(', '));
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Tạo email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Tạo user auth (chưa có userId, chưa active)
      // userId sẽ được tạo sau khi verify email thành công
      const userAuth = new UserAuth({
        ...writeEmailFields(normalizedEmail),
        password: hashedPassword,
        firstName,
        lastName,
        dateOfBirth: dobCheck.date,
        emailVerificationToken,
        emailVerificationExpiresAt,
        isEmailVerified: false,
        isActive: false, // Chỉ active sau khi verify email
      });

      await userAuth.save();

      // Gửi email verification trong background (không block response)
      // Để tránh timeout, không await email sending
      console.log('[AuthService] 🔍 Checking email service availability...');
      console.log('[AuthService] emailService.isAvailable():', emailService.isAvailable());
      console.log('[AuthService] EMAIL_USER:', process.env.EMAIL_USER ? 'SET (' + process.env.EMAIL_USER + ')' : 'NOT SET');
      console.log('[AuthService] EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
      
      if (emailService.isAvailable()) {
        console.log('[AuthService] 📧 Email service is available, scheduling verification email to:', normalizedEmail);
        console.log('[AuthService] Verification token: REDACTED');
        console.log('[AuthService] Email will be sent in background to avoid timeout');
        
        // Gửi email trong background - không await
        const emailPromise = emailService.sendVerificationEmail(
          normalizedEmail,
          emailVerificationToken,
          frontendUrl
        );
        console.log('[AuthService] Email promise created, waiting for result...');
        
        emailPromise
          .then((result) => {
            console.log('[AuthService] 📬 Email promise resolved');
            console.log('[AuthService] Result:', result ? 'Has result' : 'Null result');
            if (result && result.messageId) {
              console.log('[AuthService] ✅ Verification email sent successfully to:', normalizedEmail);
              console.log('[AuthService] Email messageId:', result.messageId);
              console.log('[AuthService] Email response:', result.response);
            } else {
              console.warn('[AuthService] ❌ Email service returned null');
              console.warn('[AuthService] Result type:', typeof result);
              console.warn('[AuthService] Result value:', result);
              console.warn('[AuthService] Check email service configuration and logs above');
            }
          })
          .catch((error) => {
            console.error('[AuthService] ❌ Email promise rejected (error occurred)');
            console.error('[AuthService] Error type:', typeof error);
            console.error('[AuthService] Error message:', error.message || error);
            console.error('[AuthService] Error code:', error.code);
            console.error('[AuthService] Error command:', error.command);
            console.error('[AuthService] Error response:', error.response);
            console.error('[AuthService] Error responseCode:', error.responseCode);
            if (error.stack) {
              console.error('[AuthService] Error stack:', error.stack);
            }
            
            // Nếu là lỗi authentication
            if (error.code === 'EAUTH' || error.responseCode === 535) {
              console.error('[AuthService] ⚠️ Gmail authentication failed!');
              console.error('[AuthService] Please check:');
              console.error('[AuthService] 1. EMAIL_USER is correct');
              console.error('[AuthService] 2. EMAIL_PASSWORD is an App Password (not regular password)');
              console.error('[AuthService] 3. 2-Step Verification is enabled');
            }
          });
        
        console.log('[AuthService] Email sending initiated, continuing with registration response...');
      } else {
        console.warn('[AuthService] ⚠️ Email service NOT available, skipping email send');
        console.warn('[AuthService] EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
        console.warn('[AuthService] EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
        console.warn('[AuthService] transporter:', emailService.transporter ? 'EXISTS' : 'NULL');
      }

      return {
        userAuth,
        emailVerificationToken: emailService.isAvailable() ? undefined : emailVerificationToken, // Chỉ trả về token nếu không gửi email
        emailScheduled: emailService.isAvailable(), // Email đã được lên lịch gửi (không chờ kết quả)
      };
    } catch (error) {
      throw error;
    }
  }

  // Đăng nhập
  async login(email, password) {
    try {
      // Kiểm tra trạng thái kết nối theo fail-fast, không reconnect trong request.
      await ensureMongoReady('LOGIN');

      const userAuth = await findUserAuthByEmail(email, { maxTimeMS: 15000 });

      if (!userAuth) {
        throw createServiceError('Email hoặc mật khẩu không đúng', 401, 'AUTH_INVALID_CREDENTIALS');
      }

      const plainEmail = await hydrateAuthEmailDoc(userAuth);

      // Kiểm tra email đã được verify chưa
      if (!userAuth.isEmailVerified) {
        throw createServiceError('Vui lòng xác thực email trước khi đăng nhập', 401, 'AUTH_EMAIL_NOT_VERIFIED');
      }

      // Kiểm tra account có active không
      if (!userAuth.isActive) {
        throw createServiceError('Tài khoản chưa kích hoạt.', 401, 'AUTH_ACCOUNT_INACTIVE');
      }

      // Kiểm tra account có bị lock không
      if (userAuth.isLocked) {
        throw createServiceError('Tài khoản tạm khóa do đăng nhập sai nhiều lần', 401, 'AUTH_ACCOUNT_LOCKED');
      }

      // Kiểm tra password
      const isPasswordValid = await comparePassword(password, userAuth.password);
      if (!isPasswordValid) {
        await userAuth.incLoginAttempts();
        throw createServiceError('Email hoặc mật khẩu không đúng', 401, 'AUTH_INVALID_CREDENTIALS');
      }

      // Reset login attempts
      await userAuth.resetLoginAttempts();

      // Cập nhật lastLoginAt
      userAuth.lastLoginAt = new Date();
      await userAuth.save();

      // Tạo tokens
      const payload = {
        id: userAuth.userId.toString(),
        email: plainEmail,
      };

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // Lưu refresh token vào database
      userAuth.refreshToken = refreshToken;
      userAuth.refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await userAuth.save();

      // Cache refresh token trong Redis
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `refresh_token:${userAuth.userId}`;
        await redis.setex(cacheKey, 30 * 24 * 60 * 60, refreshToken); // 30 days
      }

      // Đảm bảo UserProfile tồn tại (phòng bootstrap verify email lỗi trước đó)
      void bootstrapUserProfile(userAuth, userAuth.userId);

      return {
        accessToken,
        refreshToken,
        user: {
          id: userAuth.userId,
          email: plainEmail,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Refresh access token
  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Kiểm tra refresh token trong database
      const userAuth = await UserAuth.findOne({
        userId: decoded.id,
        refreshToken,
      });

      if (!userAuth || userAuth.refreshTokenExpiresAt < new Date()) {
        throw createServiceError('Phiên đăng nhập không hợp lệ hoặc đã hết hạn', 401, 'AUTH_REFRESH_INVALID');
      }

      const plainEmail = await hydrateAuthEmailDoc(userAuth);

      const payload = {
        id: userAuth.userId.toString(),
        email: plainEmail,
      };

      const accessToken = generateAccessToken(payload);

      return {
        accessToken,
      };
    } catch (error) {
      throw error;
    }
  }

  // Đăng xuất
  async logout(userId) {
    try {
      // Kiểm tra trạng thái kết nối theo fail-fast, không reconnect trong request.
      await ensureMongoReady('LOGOUT');

      const userAuth = await UserAuth.findOne({ userId }).maxTimeMS(5000);
      if (userAuth) {
        userAuth.refreshToken = null;
        userAuth.refreshTokenExpiresAt = null;
        await userAuth.save();
      }

      // Xóa refresh token từ Redis
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `refresh_token:${userId}`;
        await redis.del(cacheKey);
      }

      return true;
    } catch (error) {
      throw error;
    }
  }

  // Đổi mật khẩu
  async changePassword(userId, oldPassword, newPassword) {
    try {
      const userAuth = await UserAuth.findOne({ userId });
      if (!userAuth) {
        throw new Error('User not found');
      }

      // Kiểm tra old password
      const isOldPasswordValid = await comparePassword(oldPassword, userAuth.password);
      if (!isOldPasswordValid) {
        throw new Error('Old password is incorrect');
      }

      // Validate new password strength
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.errors.join(', '));
      }

      // Hash new password
      const hashedPassword = await hashPassword(newPassword);

      // Cập nhật password
      userAuth.password = hashedPassword;
      await userAuth.save();

      return true;
    } catch (error) {
      throw error;
    }
  }

  // Quên mật khẩu - tạo reset token
  async forgotPassword(email, frontendUrl) {
    try {
      const normalizedEmail = normalizeEmail(email);
      const userAuth = await findUserAuthByEmail(normalizedEmail);
      if (!userAuth) {
        // Không báo lỗi để tránh email enumeration
        return {
          message: 'If email exists, password reset link has been sent',
          emailScheduled: false,
        };
      }

      const plainEmail = await hydrateAuthEmailDoc(userAuth);

      // Tạo reset token
      const passwordResetToken = crypto.randomBytes(32).toString('hex');
      const passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      userAuth.passwordResetToken = passwordResetToken;
      userAuth.passwordResetExpiresAt = passwordResetExpiresAt;
      await userAuth.save();

      let emailScheduled = false;
      if (emailService.isAvailable()) {
        const emailResult = await emailService.sendPasswordResetEmail(email, passwordResetToken, frontendUrl);
        emailScheduled = !!emailResult;
      }

      const response = {
        message: 'If email exists, password reset link has been sent',
        emailScheduled,
      };

      // Dev fallback: trả token để test local khi SMTP chưa cấu hình
      if (!emailScheduled && process.env.NODE_ENV !== 'production') {
        const baseNormalized = String(
          (frontendUrl && String(frontendUrl).trim()) ||
            process.env.FRONTEND_URL ||
            'http://localhost:5173'
        ).replace(/\/+$/, '');
        response.resetToken = passwordResetToken;
        response.resetUrl = `${baseNormalized}/reset-password?token=${passwordResetToken}`;
      }

      return response;
    } catch (error) {
      throw error;
    }
  }

  // Gửi lại email xác thực
  async resendVerificationEmail(email, frontendUrl) {
    try {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        throw new Error('Email is required');
      }

      const userAuth = await findUserAuthByEmail(normalizedEmail);

      if (!userAuth) {
        // Không trả lỗi để tránh email enumeration
        return {
          message: 'If email exists, verification link has been sent',
          emailScheduled: false,
        };
      }

      if (userAuth.isEmailVerified) {
        return {
          message: 'Email is already verified',
          emailScheduled: false,
          alreadyVerified: true,
        };
      }

      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      userAuth.emailVerificationToken = emailVerificationToken;
      userAuth.emailVerificationExpiresAt = emailVerificationExpiresAt;
      await userAuth.save();

      const plainEmail = await hydrateAuthEmailDoc(userAuth);

      let emailScheduled = false;
      if (emailService.isAvailable()) {
        const emailResult = await emailService.sendVerificationEmail(
          plainEmail,
          emailVerificationToken,
          frontendUrl
        );
        emailScheduled = !!emailResult;
      }

      const response = {
        message: 'If email exists, verification link has been sent',
        emailScheduled,
      };

      // Dev fallback: trả token để test local khi SMTP chưa cấu hình
      if (!emailScheduled && process.env.NODE_ENV !== 'production') {
        const baseNormalized = String(
          (frontendUrl && String(frontendUrl).trim()) ||
            process.env.FRONTEND_URL ||
            'http://localhost:5173'
        ).replace(/\/+$/, '');
        response.verificationToken = emailVerificationToken;
        response.verificationUrl = `${baseNormalized}/verify-email?token=${emailVerificationToken}`;
      }

      return response;
    } catch (error) {
      throw error;
    }
  }

  // Reset mật khẩu
  async resetPassword(resetToken, newPassword) {
    try {
      const userAuth = await UserAuth.findOne({
        passwordResetToken: resetToken,
        passwordResetExpiresAt: { $gt: new Date() },
      });

      if (!userAuth) {
        throw new Error('Invalid or expired reset token');
      }

      // Validate new password strength
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.errors.join(', '));
      }

      // Hash new password
      const hashedPassword = await hashPassword(newPassword);

      // Cập nhật password và xóa reset token
      userAuth.password = hashedPassword;
      userAuth.passwordResetToken = null;
      userAuth.passwordResetExpiresAt = null;
      await userAuth.save();

      return true;
    } catch (error) {
      throw error;
    }
  }

  // Xác thực email
  async verifyEmail(verificationToken) {
    try {
      const userAuth = await UserAuth.findOne({
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: { $gt: new Date() },
      });

      if (!userAuth) {
        throw new Error('Invalid or expired verification token');
      }

      // Kiểm tra đã verify chưa
      if (userAuth.isEmailVerified) {
        throw new Error('Email already verified');
      }

      // Tạo userId mới (ObjectId)
      const userId = new mongoose.Types.ObjectId();

      // Cập nhật user auth: verify email, active account, set userId
      userAuth.isEmailVerified = true;
      userAuth.isActive = true;
      userAuth.userId = userId;
      userAuth.emailVerificationToken = null;
      userAuth.emailVerificationExpiresAt = null;
      await userAuth.save();

      // Tạo UserProfile trong user-service (HTTP nội bộ — không qua webhook)
      const bootstrap = await bootstrapUserProfile(userAuth, userId);
      if (!bootstrap.ok) {
        console.warn(
          '[AuthService] verifyEmail: UserProfile bootstrap chưa thành công — user có thể đăng nhập lại để thử tạo profile.',
          bootstrap.reason
        );
      }

      const plainEmail = await hydrateAuthEmailDoc(userAuth);

      return {
        userId: userId.toString(),
        email: plainEmail,
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new AuthService();



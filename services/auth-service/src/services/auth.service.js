const UserAuth = require('../models/UserAuth');
const { validateRegistrationDateOfBirth } = require('../utils/dateOfBirth');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../config/jwt');
const { getRedisClient } = require('/shared');
const emailService = require('../utils/email');
const crypto = require('crypto');
const { mongoose } = require('/shared/config/mongo');
const axios = require('axios');

async function ensureMongoReady(scope = 'AUTH') {
  const readyState = mongoose.connection.readyState;
  console.log(
    `[AuthService] [${scope}] MongoDB readyState:`,
    readyState,
    '(1=connected, 2=connecting, 0=disconnected)'
  );
  if (readyState === 1) return;
  // Không reconnect trong request để tránh reset connection pool cạnh tranh với background reconnect.
  throw new Error('Database temporarily unavailable. Please retry.');
}

class AuthService {
  // Đăng ký user mới
  async register(userData, frontendUrl) {
    try {
      const { email, password, firstName, lastName, dateOfBirth } = userData;

      // Validate required fields
      if (!email || !password) {
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
      console.log('[AuthService] Checking if email exists:', email);
      try {
        const existingUser = await UserAuth.findOne({ email })
          .maxTimeMS(15000) // 15 seconds timeout
          .lean(); // Use lean() for faster query
        
        if (existingUser) {
          console.log('[AuthService] Email already exists');
          throw new Error('Email already exists');
        }
        console.log('[AuthService] ✅ Email is available');
      } catch (error) {
        if (error.message === 'Email already exists') {
          throw error;
        }
        console.error('[AuthService] ❌ Error checking email:', error.message);
        console.error('[AuthService] Error code:', error.code);
        console.error('[AuthService] Error name:', error.name);
        
        // Nếu là connection error, throw với message rõ ràng hơn
        if (error.name === 'MongoServerError' || error.message.includes('buffering') || error.message.includes('timeout')) {
          throw new Error(`Database connection error: ${error.message}. Please try again.`);
        }
        throw new Error(`Database query failed: ${error.message}`);
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
        email,
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
        console.log('[AuthService] 📧 Email service is available, scheduling verification email to:', email);
        console.log('[AuthService] Verification token: REDACTED');
        console.log('[AuthService] Email will be sent in background to avoid timeout');
        
        // Gửi email trong background - không await
        const emailPromise = emailService.sendVerificationEmail(email, emailVerificationToken, frontendUrl);
        console.log('[AuthService] Email promise created, waiting for result...');
        
        emailPromise
          .then((result) => {
            console.log('[AuthService] 📬 Email promise resolved');
            console.log('[AuthService] Result:', result ? 'Has result' : 'Null result');
            if (result && result.messageId) {
              console.log('[AuthService] ✅ Verification email sent successfully to:', email);
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
      throw new Error(`Error registering user: ${error.message}`);
    }
  }

  // Đăng nhập
  async login(email, password) {
    try {
      // Kiểm tra trạng thái kết nối theo fail-fast, không reconnect trong request.
      await ensureMongoReady('LOGIN');

      const userAuth = await UserAuth.findOne({ email })
        .maxTimeMS(15000)
        .lean(false);

      if (!userAuth) {
        throw new Error('Invalid email or password');
      }

      // Kiểm tra email đã được verify chưa
      if (!userAuth.isEmailVerified) {
        throw new Error('Please verify your email before logging in');
      }

      // Kiểm tra account có active không
      if (!userAuth.isActive) {
        throw new Error('Account is not active. Please verify your email first.');
      }

      // Kiểm tra account có bị lock không
      if (userAuth.isLocked) {
        throw new Error('Account is temporarily locked due to too many failed login attempts');
      }

      // Kiểm tra password
      const isPasswordValid = await comparePassword(password, userAuth.password);
      if (!isPasswordValid) {
        await userAuth.incLoginAttempts();
        throw new Error('Invalid email or password');
      }

      // Reset login attempts
      await userAuth.resetLoginAttempts();

      // Cập nhật lastLoginAt
      userAuth.lastLoginAt = new Date();
      await userAuth.save();

      // Tạo tokens
      const payload = {
        id: userAuth.userId.toString(),
        email: userAuth.email,
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

      return {
        accessToken,
        refreshToken,
        user: {
          id: userAuth.userId,
          email: userAuth.email,
        },
      };
    } catch (error) {
      throw new Error(`Error logging in: ${error.message}`);
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
        throw new Error('Invalid or expired refresh token');
      }

      // Tạo access token mới
      const payload = {
        id: userAuth.userId.toString(),
        email: userAuth.email,
      };

      const accessToken = generateAccessToken(payload);

      return {
        accessToken,
      };
    } catch (error) {
      throw new Error(`Error refreshing token: ${error.message}`);
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
      throw new Error(`Error logging out: ${error.message}`);
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
      throw new Error(`Error changing password: ${error.message}`);
    }
  }

  // Quên mật khẩu - tạo reset token
  async forgotPassword(email, frontendUrl) {
    try {
      const userAuth = await UserAuth.findOne({ email });
      if (!userAuth) {
        // Không báo lỗi để tránh email enumeration
        return {
          message: 'If email exists, password reset link has been sent',
          emailScheduled: false,
        };
      }

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
      throw new Error(`Error processing forgot password: ${error.message}`);
    }
  }

  // Gửi lại email xác thực
  async resendVerificationEmail(email, frontendUrl) {
    try {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail) {
        throw new Error('Email is required');
      }

      const userAuth = await UserAuth.findOne({ email: normalizedEmail });

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

      let emailScheduled = false;
      if (emailService.isAvailable()) {
        const emailResult = await emailService.sendVerificationEmail(
          userAuth.email,
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
      throw new Error(`Error resending verification email: ${error.message}`);
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
      throw new Error(`Error resetting password: ${error.message}`);
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

      // Tạo UserProfile trong user-service sau khi verify email thành công
      try {
        const userServiceUrl = process.env.USER_SERVICE_URL || 'http://user-service:3004';
        
        // username & displayName dựa trên tên thật; email dùng để phân biệt
        const rawName = `${userAuth.firstName || ''} ${userAuth.lastName || ''}`.trim();
        const username = rawName || userAuth.email.split('@')[0];
        const displayName = rawName || username;

        const internalToken = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
        if (!internalToken) {
          console.error(
            'USER_SERVICE_INTERNAL_TOKEN not set; cannot bootstrap UserProfile. Set in root .env / auth-service env.'
          );
        } else {
          const response = await axios.post(
            `${userServiceUrl}/api/users/internal/bootstrap`,
            {
              userId: userId.toString(),
              username,
              email: userAuth.email,
              displayName,
              dateOfBirth: userAuth.dateOfBirth,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'x-internal-token': internalToken,
              },
              timeout: 5000,
            }
          );

          if (response) {
            console.log('UserProfile created successfully:', response.data);
          }
        }
      } catch (error) {
        // Log lỗi nhưng không throw - user đã verify email thành công
        // UserProfile có thể được tạo sau hoặc thủ công
        console.error('Failed to create UserProfile:', error.message);
        // Không throw error để không block email verification
      }

      return {
        userId: userId.toString(),
        email: userAuth.email,
      };
    } catch (error) {
      throw new Error(`Error verifying email: ${error.message}`);
    }
  }
}

module.exports = new AuthService();



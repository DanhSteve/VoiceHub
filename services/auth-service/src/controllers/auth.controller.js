const authService = require('../services/auth.service');
const { resolveFrontendUrl } = require('/shared');
const { readEmailFromStored } = require('/shared/utils/emailPii');

function sendError(res, err, fallbackStatus, fallbackMessage, fallbackCode) {
  const status = Number(err?.statusCode) || fallbackStatus;
  const message = String(err?.message || fallbackMessage);
  const errorCode = String(err?.errorCode || fallbackCode || '').trim();
  return res.status(status).json({
    success: false,
    message,
    ...(errorCode ? { errorCode } : {}),
    ...(message ? { messageUser: message } : {}),
  });
}

class AuthController {
  // Đăng ký
  async register(req, res) {
    console.log('[AuthController] ========== REGISTER REQUEST RECEIVED ==========');
    console.log('[AuthController] Request method:', req.method);
    console.log('[AuthController] Request path:', req.path);
    console.log('[AuthController] Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('[AuthController] Request body exists:', !!req.body);
    
    // Kiểm tra nếu request đã bị abort
    if (req.aborted) {
      console.warn('[AuthController] Request already aborted, returning early');
      return;
    }

    try {
      console.log('[AuthController] Parsing request body...');
      const { email, password, firstName, lastName, dateOfBirth } = req.body;
      console.log('[AuthController] Parsed data:', { 
        email, 
        firstName, 
        lastName, 
        hasPassword: !!password,
        hasDateOfBirth: !!dateOfBirth 
      });

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      if (!firstName || !lastName) {
        return res.status(400).json({
          success: false,
          message: 'First name and last name are required',
        });
      }

      // dateOfBirth: bắt buộc khi đăng ký mới (validate trong auth.service)

      console.log('[AuthController] Starting registration for:', email);
      console.log('[AuthController] Calling authService.register()...');
      const startTime = Date.now();
      
      const frontendUrl = resolveFrontendUrl(req);
      const result = await authService.register(
        {
        email,
        password,
        firstName,
        lastName,
        dateOfBirth,
        },
        frontendUrl
      );

      const duration = Date.now() - startTime;
      console.log(`[AuthController] ✅ Registration service completed in ${duration}ms`);
      console.log('[AuthController] Result:', {
        hasUserAuth: !!result.userAuth,
        email: result.userAuth?.email,
        emailScheduled: result.emailScheduled,
      });

      // Kiểm tra lại nếu request đã bị abort trước khi gửi response
      if (req.aborted || res.headersSent) {
        console.warn('[AuthController] Request aborted or response already sent');
        return;
      }

      const responseData = {
        email: readEmailFromStored(result.userAuth?.email),
        message: 'Registration successful. Please check your email to verify your account.',
      };

      // Thêm thông tin về email verification
      if (result.emailScheduled) {
        responseData.emailScheduled = true;
        responseData.message = 'Đăng ký thành công! Email xác thực đang được gửi. Vui lòng kiểm tra hộp thư của bạn (có thể mất vài phút).';
        console.log('[AuthController] ✅ Email verification scheduled (check logs for sending status)');
      } else {
        responseData.emailScheduled = false;
        console.warn('[AuthController] ⚠️ Email service not configured');
        responseData.message = 'Đăng ký thành công. Email service chưa được cấu hình.';
      }

      // Chỉ trả về token nếu email service chưa được cấu hình (development mode)
      if (result.emailVerificationToken) {
        responseData.emailVerificationToken = result.emailVerificationToken;
        responseData.message = 'Registration successful. Please verify your email using the token below (development mode).';
      }

      console.log('[AuthController] Sending response:', {
        success: true,
        emailSent: responseData.emailSent,
        email: responseData.email,
      });

      res.status(201).json({
        success: true,
        message: responseData.message,
        data: responseData,
      });
    } catch (error) {
      console.error('[AuthController] ❌ ERROR in register:', error.message);
      console.error('[AuthController] Error stack:', error.stack);
      console.error('[AuthController] Error type:', error.constructor.name);
      
      // Kiểm tra nếu request đã bị abort hoặc response đã được gửi
      if (req.aborted || res.headersSent) {
        console.warn('[AuthController] Request aborted or response already sent, skipping error response');
        return;
      }

      // Xử lý lỗi request aborted
      if (error.message && error.message.includes('aborted')) {
        console.log('[AuthController] Request aborted during registration');
        return;
      }

      console.log('[AuthController] Sending error response to client...');
      return sendError(res, error, 400, 'Đăng ký thất bại', 'AUTH_REGISTER_FAILED');
      console.log('[AuthController] Error response sent');
    }
  }

  // Đăng nhập
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      const result = await authService.login(email, password);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return sendError(res, error, 401, 'Đăng nhập thất bại', 'AUTH_LOGIN_FAILED');
    }
  }

  // Refresh token
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
      }

      const result = await authService.refreshToken(refreshToken);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      return sendError(res, error, 401, 'Làm mới phiên thất bại', 'AUTH_REFRESH_FAILED');
    }
  }

  // Đăng xuất
  async logout(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      await authService.logout(userId);

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      return sendError(res, error, 500, 'Đăng xuất thất bại', 'AUTH_LOGOUT_FAILED');
    }
  }

  // Đổi mật khẩu
  async changePassword(req, res) {
    try {
      const { oldPassword, newPassword } = req.body;
      const userId = req.user?.id || req.user?._id;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Old password and new password are required',
        });
      }

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      await authService.changePassword(userId, oldPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      return sendError(res, error, 400, 'Đổi mật khẩu thất bại', 'AUTH_CHANGE_PASSWORD_FAILED');
    }
  }

  // Quên mật khẩu
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required',
        });
      }

      const frontendUrl = resolveFrontendUrl(req);
      const result = await authService.forgotPassword(email, frontendUrl);

      res.json({
        success: true,
        message: result.message,
        data: {
          emailScheduled: !!result.emailScheduled,
          ...(result.resetToken ? { resetToken: result.resetToken } : {}),
          ...(result.resetUrl ? { resetUrl: result.resetUrl } : {}),
        },
      });
    } catch (error) {
      return sendError(res, error, 500, 'Không thể xử lý yêu cầu lúc này', 'AUTH_FORGOT_PASSWORD_FAILED');
    }
  }

  // Gửi lại email xác thực
  async resendVerification(req, res) {
    try {
      const { email } = req.body || {};

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required',
        });
      }

      const frontendUrl = resolveFrontendUrl(req);
      const result = await authService.resendVerificationEmail(email, frontendUrl);

      res.json({
        success: true,
        message: result.message,
        data: {
          emailScheduled: !!result.emailScheduled,
          ...(result.alreadyVerified ? { alreadyVerified: true } : {}),
          ...(result.verificationToken ? { verificationToken: result.verificationToken } : {}),
          ...(result.verificationUrl ? { verificationUrl: result.verificationUrl } : {}),
        },
      });
    } catch (error) {
      return sendError(res, error, 500, 'Không thể xử lý yêu cầu lúc này', 'AUTH_RESEND_VERIFY_FAILED');
    }
  }

  // Reset mật khẩu
  async resetPassword(req, res) {
    try {
      const resetToken = req.body?.resetToken || req.body?.token;
      const newPassword = req.body?.newPassword || req.body?.password;

      if (!resetToken || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Reset token and new password are required',
        });
      }

      await authService.resetPassword(resetToken, newPassword);

      res.json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      return sendError(res, error, 400, 'Đặt lại mật khẩu thất bại', 'AUTH_RESET_PASSWORD_FAILED');
    }
  }

  // Xác thực email
  async verifyEmail(req, res) {
    try {
      console.log('[AuthController] verifyEmail:', req.method, req.path);

      // GET request: token chỉ có trong query string, KHÔNG có body
      // Lấy token từ query string (ưu tiên) hoặc body (nếu là POST)
      const verificationToken = req.query.token || req.body?.verificationToken || req.body?.token;

      console.log('[AuthController] Extracted token:', verificationToken ? 'REDACTED' : 'NOT FOUND');

      if (!verificationToken) {
        console.error('[AuthController] ❌ No verification token provided');
        return res.status(400).json({
          success: false,
          message: 'Verification token is required',
        });
      }

      console.log('[AuthController] Calling authService.verifyEmail...');
      const result = await authService.verifyEmail(verificationToken);

      res.json({
        success: true,
        message: 'Email verified successfully. Your account has been activated.',
        data: {
          userId: result.userId,
          email: result.email,
        },
      });
    } catch (error) {
      return sendError(res, error, 400, 'Xác thực email thất bại', 'AUTH_VERIFY_EMAIL_FAILED');
    }
  }

  // Lấy thông tin user hiện tại
  async getMe(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      // TODO: Lấy thông tin user từ user-service
      res.json({
        success: true,
        data: {
          id: userId,
          email: req.user.email,
        },
      });
    } catch (error) {
      return sendError(res, error, 500, 'Không tải được thông tin tài khoản', 'AUTH_ME_FAILED');
    }
  }
}

module.exports = new AuthController();





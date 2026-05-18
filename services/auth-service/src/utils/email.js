const nodemailer = require('nodemailer');

/**
 * Email Service - Gửi email verification và password reset
 */
class EmailService {
  constructor() {
    // Kiểm tra email config trước khi tạo transporter
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;
    
    if (emailUser && emailPassword) {
      console.log(`[EmailService] Initializing with user: ${emailUser}`);
      // Tạo transporter với Gmail SMTP
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser, // Gmail của bạn
          pass: emailPassword, // App Password (không phải mật khẩu thường)
        },
        // Thêm timeout để tránh chờ SMTP quá lâu
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000, // 10 seconds
        socketTimeout: 10000, // 10 seconds
      });
      
      // Verify connection khi khởi tạo
      this.verifyConnection();
    } else {
      console.warn('[EmailService] EMAIL_USER or EMAIL_PASSWORD not set. Email service will not be available.');
      this.transporter = null;
    }
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection() {
    if (!this.transporter) {
      return false;
    }
    
    try {
      await this.transporter.verify();
      console.log('[EmailService] SMTP connection verified successfully');
      return true;
    } catch (error) {
      console.error('[EmailService] SMTP connection verification failed:', error.message);
      return false;
    }
  }

  /**
   * Gửi email verification
   * @param {string} email - Email người nhận
   * @param {string} verificationToken - Token để verify
   */
  async sendVerificationEmail(email, verificationToken, frontendUrl) {
    console.log('[EmailService] 📨 sendVerificationEmail called');
    console.log('[EmailService] Email:', email);
    console.log('[EmailService] Token length:', verificationToken ? verificationToken.length : 0);
    
    try {
      // Kiểm tra email service có sẵn sàng không
      console.log('[EmailService] Checking availability...');
      const isAvail = this.isAvailable();
      console.log('[EmailService] isAvailable():', isAvail);
      
      if (!isAvail) {
        console.log('[EmailService] ❌ Email service not configured, skipping email send');
        console.log('[EmailService] EMAIL_USER:', process.env.EMAIL_USER ? 'SET (' + process.env.EMAIL_USER + ')' : 'NOT SET');
        console.log('[EmailService] EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
        console.log('[EmailService] transporter:', this.transporter ? 'EXISTS' : 'NULL');
        return null;
      }

      console.log(`[EmailService] ✅ Service available, sending verification email to: ${email}`);
      const base =
        (frontendUrl && String(frontendUrl).trim()) ||
        process.env.FRONTEND_URL ||
        'http://localhost:5173';
      const baseNormalized = String(base).replace(/\/+$/, '');
      const verificationUrl = `${baseNormalized}/verify-email?token=${verificationToken}`;
      console.log(`[EmailService] Verification URL: ${verificationUrl}`);
      console.log(`[EmailService] From: ${process.env.EMAIL_USER}`);
      console.log(`[EmailService] To: ${email}`);

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || 'VoiceChat App'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Xác thực email của bạn',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Xác thực Email</h1>
              </div>
              <div class="content">
                <p>Xin chào,</p>
                <p>Cảm ơn bạn đã đăng ký tài khoản tại VoiceChat App!</p>
                <p>Vui lòng click vào nút bên dưới để xác thực email của bạn:</p>
                <p style="text-align: center;">
                  <a href="${verificationUrl}" class="button">Xác thực Email</a>
                </p>
                <p>Hoặc copy link sau vào trình duyệt:</p>
                <p style="word-break: break-all; background: #fff; padding: 10px; border-radius: 5px;">
                  ${verificationUrl}
                </p>
                <p><strong>Lưu ý:</strong> Link này sẽ hết hạn sau 24 giờ.</p>
                <p>Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.</p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} VoiceChat App. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Xác thực Email
          
          Xin chào,
          
          Cảm ơn bạn đã đăng ký tài khoản tại VoiceChat App!
          
          Vui lòng click vào link sau để xác thực email của bạn:
          ${verificationUrl}
          
          Link này sẽ hết hạn sau 24 giờ.
          
          Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.
        `,
      };

      // Gửi email với timeout
      console.log('[EmailService] 📤 Preparing to send email via transporter...');
      console.log('[EmailService] Transporter exists:', !!this.transporter);
      
      const sendPromise = this.transporter.sendMail(mailOptions);
      console.log('[EmailService] Send promise created, waiting for response...');
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => {
          console.warn('[EmailService] ⏱️ Email send timeout after 10 seconds');
          reject(new Error('Email send timeout'));
        }, 10000)
      );
      
      console.log('[EmailService] Racing between send and timeout...');
      const info = await Promise.race([sendPromise, timeoutPromise]);
      
      console.log('[EmailService] ✅ Email sent successfully!');
      console.log('[EmailService] MessageId:', info.messageId);
      console.log('[EmailService] Response:', info.response);
      console.log('[EmailService] Accepted:', info.accepted);
      console.log('[EmailService] Rejected:', info.rejected);
      
      return info;
    } catch (error) {
      console.error('[EmailService] Error sending verification email:', error.message);
      console.error('[EmailService] Error details:', {
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
      });
      
      // Nếu là lỗi authentication, log rõ ràng
      if (error.code === 'EAUTH' || error.responseCode === 535) {
        console.error('[EmailService] Authentication failed. Please check:');
        console.error('[EmailService] 1. EMAIL_USER is correct');
        console.error('[EmailService] 2. EMAIL_PASSWORD is an App Password (not regular password)');
        console.error('[EmailService] 3. 2-Step Verification is enabled on Gmail account');
      }
      
      // Không throw error để không block registration
      // Chỉ log lỗi và return null
      return null;
    }
  }

  /**
   * Gửi email reset password
   * @param {string} email - Email người nhận
   * @param {string} resetToken - Token để reset password
   */
  async sendPasswordResetEmail(email, resetToken, frontendUrl) {
    try {
      if (!this.isAvailable()) {
        console.warn('[EmailService] Password reset email skipped: service not configured');
        return null;
      }

      const base =
        (frontendUrl && String(frontendUrl).trim()) ||
        process.env.FRONTEND_URL ||
        'http://localhost:5173';
      const baseNormalized = String(base).replace(/\/+$/, '');
      const resetUrl = `${baseNormalized}/reset-password?token=${resetToken}`;

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || 'VoiceChat App'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Đặt lại mật khẩu',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; padding: 12px 30px; background: #f5576c; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
              .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Đặt lại Mật khẩu</h1>
              </div>
              <div class="content">
                <p>Xin chào,</p>
                <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản VoiceChat App.</p>
                <p>Click vào nút bên dưới để đặt lại mật khẩu:</p>
                <p style="text-align: center;">
                  <a href="${resetUrl}" class="button">Đặt lại Mật khẩu</a>
                </p>
                <p>Hoặc copy link sau vào trình duyệt:</p>
                <p style="word-break: break-all; background: #fff; padding: 10px; border-radius: 5px;">
                  ${resetUrl}
                </p>
                <div class="warning">
                  <p><strong>⚠️ Lưu ý:</strong></p>
                  <ul>
                    <li>Link này sẽ hết hạn sau 1 giờ.</li>
                    <li>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</li>
                    <li>Mật khẩu của bạn sẽ không thay đổi nếu bạn không click vào link trên.</li>
                  </ul>
                </div>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} VoiceChat App. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Đặt lại Mật khẩu
          
          Xin chào,
          
          Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản VoiceChat App.
          
          Click vào link sau để đặt lại mật khẩu:
          ${resetUrl}
          
          Link này sẽ hết hạn sau 1 giờ.
          
          Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
        `,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return null;
    }
  }

  /**
   * Kiểm tra email service có sẵn sàng không
   */
  isAvailable() {
    const hasUser = !!process.env.EMAIL_USER;
    const hasPassword = !!process.env.EMAIL_PASSWORD;
    const hasTransporter = !!this.transporter;
    
    if (!hasUser || !hasPassword || !hasTransporter) {
      console.log('[EmailService] Service not available:', {
        hasUser,
        hasPassword,
        hasTransporter,
      });
      return false;
    }
    
    return true;
  }
}

// Export singleton instance
const emailService = new EmailService();

module.exports = emailService;









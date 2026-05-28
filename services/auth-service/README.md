# Auth Service

Service quản lý xác thực và phân quyền cho hệ thống.

## Cấu hình môi trường

Tạo file `.env` trực tiếp trong thư mục `services/auth-service/` và cập nhật các giá trị:

```env
# Server
NODE_ENV=development
PORT=3001

# Database (Atlas)
MONGODB_URI=mongodb+srv://user:password@cluster0.xxx.mongodb.net/auth_db

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_REFRESH_EXPIRES_IN=30d
```

## API Endpoints

### Public Routes
- `POST /api/auth/register` - Đăng ký
- `POST /api/auth/login` - Đăng nhập
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/forgot-password` - Quên mật khẩu
- `POST /api/auth/reset-password` - Reset mật khẩu
- `POST /api/auth/verify-email` - Xác thực email

### Protected Routes
- `POST /api/auth/logout` - Đăng xuất
- `POST /api/auth/change-password` - Đổi mật khẩu
- `GET /api/auth/me` - Lấy thông tin user hiện tại

## Chạy service

```bash
# Development
npm run dev

# Production
npm start
```





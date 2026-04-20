# Quy ước tầng HTTP (VoiceHub client)

## Hai instance Axios (cố ý tách — không gộp interceptor một PR)

| Module | Import | Khi dùng |
|--------|--------|----------|
| [`api.js`](./api.js) | `import api from './api'` | Hầu hết service “legacy”: `authService`, `chatService`, `userService`, `friendService`, … Interceptor: toast/401 có delay, xử lý 404 friend search, landing embed. |
| [`api/apiClient.js`](./api/apiClient.js) | `import apiClient from './api/apiClient'` | Chỉ dùng trong các module `services/api/*API.js` (task, org, …). Cùng `baseURL`: `VITE_API_URL \|\| '/api'`. |

**Nguyên tắc:** code mới ưu tiên gọi qua hàm trong `*Service.js` hoặc `*API.js` đã có; tránh `api.get('/path/...')` rải rác trong page nếu đã có wrapper.

## User — một nguồn sự thật

- **Chỉ dùng [`userService.js`](./userService.js)** cho mọi thao tác REST user (`getMe`, `getProfile`, `updateProfile`, …). Không thêm lớp `userAPI` trùng lặp.

## Phân tích bundle

Chạy `npm run build:analyze` — mở `dist/stats.html` (treemap). Script `build` thường không bật visualizer.

# VoiceHub — Frontend (`client/`)

Ứng dụng web **React 18 + Vite 5**, gọi **API Gateway** qua prefix `/api` (dev: proxy trong [`vite.config.js`](vite.config.js)).

Tài liệu repo gốc: [`../README.md`](../README.md). Quy ước HTTP FE: [`src/services/HTTP_CONVENTIONS.md`](src/services/HTTP_CONVENTIONS.md). Ghi chú bundle: [`docs/BUNDLE_NOTES.md`](docs/BUNDLE_NOTES.md).

---

## Công nghệ

- React 18, React Router 6, Vite 5  
- Tailwind CSS 3, PostCSS  
- Axios (`src/services/api.js` + `src/services/api/apiClient.js` — xem HTTP_CONVENTIONS)  
- Socket.IO client, mediasoup-client (trang Voice, dynamic import)  
- react-hot-toast, lucide-react, framer-motion (tùy component)  
- ESLint: [`.eslintrc.cjs`](.eslintrc.cjs) (override `no-unused-vars` cho `src/services`, `src/hooks`)

---

## Cài đặt

```bash
cd client
npm install
```

### Biến môi trường

Sao chép [`/.env.example`](./.env.example) → `.env`:

- **`VITE_API_URL`**: mặc định có thể bỏ trống để dùng **`/api`** (Vite proxy → gateway `:3000`).  
- **Socket**: xem comment trong `.env.example` — `VITE_SOCKET_DIRECT_URL` (vd. `http://127.0.0.1:3017`) khi chạy socket-service ngoài Docker; hoặc `VITE_SOCKET_URL` trỏ gateway.

### Scripts

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Vite dev server (mặc định **http://localhost:5173**) |
| `npm run build` | Build production → `dist/` |
| `npm run build:analyze` | Build + treemap `dist/stats.html` (rollup-plugin-visualizer) |
| `npm run preview` | Xem bản build |
| `npm run lint` | ESLint trên `src/` |

---

## Entry và providers

[`src/main.jsx`](src/main.jsx) (thứ tự từ ngoài vào):

1. `BrowserRouter`  
2. `ThemeProvider`  
3. **`LocaleProvider`** (vi/en, `document.documentElement.lang`)  
4. `AuthProvider`  
5. `SocketProvider`  
6. `App` + `VoiceHubToaster`

---

## Định tuyến

[`src/App.jsx`](src/App.jsx): `React.lazy()` cho hầu hết page, `Suspense` + `BrandPageLoader`, `ProtectedRoute` cho vùng cần đăng nhập.

---

## Cấu trúc `src/` (rút gọn)

```
src/
├── App.jsx, main.jsx, index.css
├── context/           # Auth, Socket, Theme, Locale
├── pages/             # Home, Chat, Voice, Organizations, Tasks, …
├── components/
│   ├── Layout/        # NavigationSidebar, ThreeFrameLayout, …
│   ├── Chat/, Organization/, Shared/, Landing/, …
│   └── ui/            # Avatar, Input, …
├── services/
│   ├── api.js
│   ├── userService.js, authService.js, chatService.js, …
│   └── api/           # taskAPI, organizationAPI, apiClient.js, …
├── locales/           # appStrings, homePage (landing)
├── hooks/
└── utils/
```

---

## Tích hợp API

- Token: lưu qua [`tokenStorage`](src/utils/tokenStorage.js), interceptor trong `api.js` gắn `Authorization`.  
- **User**: chỉ dùng [`userService.js`](src/services/userService.js) (không lớp `userAPI` trùng).  
- Phản hồi axios: interceptor trả **body** đã unwrap (không cần `.data.data` thủ công ở nhiều chỗ).

---

## Hiệu năng

- Lazy route trong `App.jsx`.  
- `vite.config.js`: `manualChunks` tách vendor-react, router, lucide, mediasoup, socket, …  
- Chi tiết số liệu: chạy `npm run build:analyze` và đọc [`docs/BUNDLE_NOTES.md`](docs/BUNDLE_NOTES.md).

---

## Xử lý sự cố nhanh

- **CORS / 404 API**: kiểm tra gateway đang chạy `:3000`, Vite proxy `/api`.  
- **Socket không kết nối**: kiểm tra `VITE_SOCKET_*`, socket-service health, JWT đồng bộ với gateway (xem [`SocketContext.jsx`](src/context/SocketContext.jsx)).

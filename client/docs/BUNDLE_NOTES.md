# Ghi nhận bundle (production build)

Phân tích trực quan: chạy `npm run build:analyze`, mở file **`dist/stats.html`** trong trình duyệt (treemap gzip).

## Chunk lớn điển hình (gzip ~)

| Chunk / file | Gzip (kB) | Ghi chú |
|----------------|-----------|---------|
| `appStrings-*.js` | ~38 | Chuỗi i18n VI/EN — chỉ tải khi route cần `useAppStrings`. |
| `vendor-react-*.js` | ~46 | React + react-dom. |
| `mediasoup-*.js` | ~40 | Chỉ cần khi vào Voice; tách khỏi entry nhờ dynamic import + `manualChunks`. |
| `OrganizationsPage-*.js` | ~25 | UI org nặng. |
| `index-*.js` (entry) | ~30 | Phần còn lại của app + deps chưa gom. |
| `vendor-router-*.js` | ~8.6 | react-router-dom. |
| `icons-*.js` (lucide-react) | ~4.5 | Icon pack. |

## Script

- `npm run build` — build production (không tạo `stats.html`).
- `npm run build:analyze` — build + ghi `dist/stats.html` (bật `ANALYZE`).

# Firebase Storage (VoiceHub)

## Checklist Console

1. Tạo project Firebase, bật **Storage**, chọn region (ví dụ `asia-southeast1`).
2. **Service account**: IAM → tạo key JSON → lấy `project_id`, `client_email`, `private_key`.
3. **CORS** (bắt buộc nếu client `PUT` trực tiếp lên signed URL): cấu hình trên **Google Cloud Storage bucket** (Firebase Storage dùng bucket GCS). Nếu thiếu, trình duyệt báo **`Failed to fetch`** / `TypeError: Failed to fetch` khi upload.
4. Không commit file JSON service account; chỉ đặt biến môi trường trên server (xem `services/chat-service/.env.example`).

### CORS cho bucket (khắc phục Failed to fetch khi upload)

1. Cài [Google Cloud SDK](https://cloud.google.com/sdk) (`gcloud`, `gsutil`), đăng nhập đúng project Firebase.
2. Sửa `docs/firebase-storage-cors.json`: thêm **origin production** (HTTPS) của bạn vào mảng `origin` (không dùng `*` nếu có thể).
3. **Tên bucket** phải trùng **100%** với **Project settings → Your apps → `storageBucket`** (ví dụ `myproj.firebasestorage.app`). Project mới Firebase thường dùng hậu tố **`.firebasestorage.app`**; tài liệu cũ hay ghi **`.appspot.com`** — nếu dùng sai tên, `gsutil` báo **`404 The specified bucket does not exist`**. Không đoán tên; copy từ Console.
4. Áp dụng CORS:

```bash
gsutil cors set docs/firebase-storage-cors.json gs://YOUR_STORAGE_BUCKET
```

Ví dụ nếu `storageBucket` là `voicehub-0305.firebasestorage.app`:

```bash
gsutil cors set docs/firebase-storage-cors.json gs://voicehub-0305.firebasestorage.app
```

5. Kiểm tra: `gsutil cors get gs://YOUR_STORAGE_BUCKET` — hoặc liệt kê bucket: `gcloud storage buckets list --project=YOUR_PROJECT_ID`
6. Dev Vite mặc định `http://localhost:5173` — origin phải khớp **chính xác** (kể cả `127.0.0.1` vs `localhost`).
7. Nếu chạy LAN HTTPS qua Nginx/mkcert (ví dụ `https://voicehub.local`) thì thêm origin HTTPS đó vào `docs/firebase-storage-cors.json` trước khi `gsutil cors set`.

## Biến môi trường

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (chuỗi nhiều dòng, trong Docker thường bọc trong dấu ngoặc kép, `\n` thay newline)
- `FIREBASE_STORAGE_BUCKET` — giá trị trong Firebase **Project settings** (`…appspot.com` hoặc `….firebasestorage.app`, tùy project)

## Luồng

1. Client `POST /api/messages/storage/signed-upload` (JWT) → signed URL (PUT).
2. Client `PUT` file lên URL đó.
3. Client `POST /api/messages` với `fileMeta` + `messageType` image|file (trong DB lưu tên tệp + `fileMeta.storagePath`).
4. Chat-service tạo signed URL đọc **khi trả API** (list/detail/create) và cache Redis ngắn (`chat:signedread:*`), không ghi URL có token vào log.

**Hiệu năng / vận hành:** chọn **region bucket** gần người dùng (ví dụ `asia-southeast1`); CORS production chỉ origin ứng dụng, không `*`.

Task-service worker cần cùng biến Firebase để `copy` / `delete` object.

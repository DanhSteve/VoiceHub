# Kế hoạch cải thiện gửi file/ảnh chat (hiệu năng + UX, giữ bảo mật)

> Mục tiêu: giảm cảm giác “upload lâu”, bớt round-trip thừa, **không** nới lỏng kiểm soát đường dẫn storage, JWT, hay quyền xem tin.  
> Trạng thái: **bản nháp để bạn duyệt** — thực hiện theo thứ tự P0 → P1 → P2.

---

## Nguyên tắc bảo mật (không được phá)

| Nguyên tắc | Hiện trạng trong code | Khi cải thiện phải giữ |
|------------|------------------------|------------------------|
| **Chứng thực người gửi** | `POST /messages` qua gateway + `req.user` | Mọi tạo tin vẫn qua auth; không bỏ middleware. |
| **Ràng buộc `fileMeta.storagePath`** | Chỉ chấp nhận `temp/{senderId}/...` | Giữ validate prefix theo **sender đã auth** — tránh gắn file của user khác. |
| **Upload lên Storage** | Signed URL **write** có TTL, path random + `sanitizeFileName` | Không cho client tự chọn path tùy ý; chỉ dùng path server trả từ signed-upload. |
| **Nội dung hiển thị (URL đọc file)** | Hiện lưu signed **read** URL trong `content` | Nếu đổi sang “ký khi đọc”, chỉ trả URL cho **người được phép xem tin** (DM: 2 bên; room: thành viên). Tránh lộ URL qua API khác. |
| **Realtime** | `emitRealtimeEvent` có token nội bộ khi cấu hình | Song song hóa emit **không** bỏ header `x-realtime-token`. |

Các mục **IDOR / friendship / getMessageById** nằm ở [security-hardening-plan.md](./security-hardening-plan.md) — ưu tiên tách: kế hoạch này **không** thay thế** hardening đó**, có thể làm song song nếu team đủ người.

---

## P0 — Nhanh, rủi ro thấp, gần như không đụng bảo mật

### P0.1 — Client `FriendChatPage`: sau upload **không** gọi `loadMessages` full

- **Việc làm**: Sau `uploadChatFileAndCreateMessage` thành công, **merge** tin từ response JSON vào `messages` (hoặc chỉ tin cậy socket `friend:sent` đã có — cần đảm bảo một nguồn để UI không trống nếu socket chậm).
- **Lợi ích**: Bớt một `GET /messages` + tránh flash “Đang tải tin nhắn…”.
- **Bảo mật**: Không đổi API; dữ liệu vẫn từ backend đã auth.

### P0.2 — Chat-service `createMessage`: **`Promise.all` hai `emitRealtimeEvent`** (DM)

- **Việc làm**: Thay hai `await` nối tiếp bằng `await Promise.all([...])`.
- **Lợi ích**: Giảm latency tới socket-service (~ một round-trip).
- **Bảo mật**: Cùng payload, cùng token — không đổi contract.

### P0.3 — UX: trạng thái “đang gửi file” trên Friend chat

- **Việc làm**: `useState` uploading / disable composer + toast hoặc spinner (tương tự org chat).
- **Bảo mật**: Chỉ UI; không ảnh hưởng policy.

---

## P1 — Giảm tải server/storage (cần thiết kế kỹ URL)

### P1.1 — Trì hoãn **`getSignedReadUrl`** khỏi `createMessage`

- **Vấn đề hiện tại**: Mỗi file = 2 lần gọi Google (write URL + read URL) trong một luồng gửi; user chờ cả hai.
- **Hướng đi** (chọn một, thống nhất với FE):
  - **A)** Lưu DB: `content` = placeholder hoặc rỗng với `messageType` + `fileMeta`; khi **`GET /messages`** (hoặc mapper `toClientMessage`), nếu có `fileMeta.storagePath` thì **mới** gọi `getSignedReadUrl` và gắn vào object trả về.
  - **B)** Giữ `content` là URL nhưng generate trong **background** sau `save()` — phức tạp hơn (race, client cần refresh).
- **Bảo mật bắt buộc**:
  - Trong mọi endpoint trả tin có file: chỉ sign read URL sau khi đã xác nhận **user hiện tại được xem cuộc hội thoại đó** (DM/room) — **gắn với backlog IDOR** trong security plan.
  - TTL read URL: giữ ngắn hơn hoặc bằng retention; không log full URL có token trong log production.
- **Regression**: `ChatMessageAttachmentBody` đang dùng `message.content` là URL — API list phải luôn trả URL đã ký **sau** bước authorize (hoặc FE dùng field mới `displayUrl` để rõ ràng).

### P1.2 — Cache ký read theo `(messageId, storagePath)` ngắn hạn (tùy chọn)

- **Việc làm**: Redis cache URL read vài phút để lặp `GET` list không gọi Google liên tục.
- **Bảo mật**: Key theo message + version hoặc expiresAt; invalidate khi xóa/thu hồi tin.

---

## P2 — Hạ tầng & vận hành

### P2.1 — Vùng bucket Firebase/GCS

- **Việc làm**: Bucket cùng region với đa số user (ví dụ `asia-southeast1`) nếu chưa.
- **Bảo mật**: CORS bucket chỉ origin app (đã nêu trong docs Firebase) — không mở `*`.

### P2.2 — Giám sát

- Log thời gian: `signed-upload`, `PUT storage`, `createMessage`, `emit realtime` (metric hoặc log có cấu trúc, **không** ghi query string chứa token).

---

## Thứ tự đề xuất (để bạn duyệt)

1. **P0** toàn bộ — ít tranh luận, lợi ích rõ.
2. **P1.1** sau khi đã rõ contract API (list/detail message) và có test tay DM + room.
3. **P1.2 / P2** khi P1.1 ổn định.

---

## Checklist trước khi merge (gợi ý)

- [ ] Gửi file DM + room: tin hiển thị đúng, không 403/404 Storage.
- [ ] User A không xem được file trong tin của B↔C (khi đã có kiểm tra thành viên hội thoại).
- [ ] Socket vẫn nhận `friend:new_message` / `room:new_message` như cũ.
- [ ] Không commit secret; không log signed URL đầy đủ.

---

*Tài liệu này bổ sung phân tích luồng upload (signed-upload → PUT → createMessage → emit → loadMessages) và căn chỉnh với [security-hardening-plan.md](./security-hardening-plan.md).*

**Phiên bản:** 1.0 (draft)

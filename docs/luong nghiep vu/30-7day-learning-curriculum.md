# Giáo trình tự học 7 ngày (Architecture + Business Logic)

Lộ trình này dùng trực tiếp bộ tài liệu trong thư mục `docs/luong nghiep vu`, dành cho người mới nhưng muốn lên tư duy System Analyst/Architect nhanh.

## Ngày 1 - Nắm khung hệ thống và tư duy đọc flow

- **Mục tiêu:** hiểu kiến trúc tổng, cách request đi qua gateway -> service -> DB/async.
- **Đọc bắt buộc:** `00-overview.md`, `01-auth-business-flow.md`.
- **Bài tập:**
  - Vẽ lại bằng lời 10 bước đăng ký -> verify -> login.
  - Chỉ ra 3 nơi có business rule quan trọng nhất trong auth.
- **Đầu ra tự chấm:**
  - Trả lời được “ai làm gì, dữ liệu lưu ở đâu, lỗi chính là gì”.

## Ngày 2 - Quyền truy cập và ranh giới trách nhiệm

- **Mục tiêu:** phân biệt auth vs authorization, gateway check vs service check.
- **Đọc bắt buộc:** `03-rbac-permission-flow.md`, `20-endpoint-matrix-auth-rbac-org.md`.
- **Bài tập:**
  - Chọn 5 endpoint private và xác định action permission tương ứng.
  - Viết 5 tình huống bị từ chối quyền (403) đúng theo logic.
- **Đầu ra tự chấm:**
  - Giải thích được vì sao một số route được bypass permission ở gateway.

## Ngày 3 - Organization domain và rule membership

- **Mục tiêu:** nắm state của membership/join application và các exception quản trị.
- **Đọc bắt buộc:** `02-organization-membership-flow.md`, `13-department-channel-flow.md`.
- **Bài tập:**
  - Viết state machine text cho: invite -> pending -> active -> removed.
  - Liệt kê các điều kiện khiến owner không thể leave org.
- **Đầu ra tự chấm:**
  - Tự mô tả được luồng tạo org hoàn chỉnh từ web tới dữ liệu.

## Ngày 4 - Social + Profile + Notification

- **Mục tiêu:** hiểu social graph, user identity/profile, và cơ chế thông báo.
- **Đọc bắt buộc:** `09-friend-flow.md`, `10-notification-flow.md`, `11-user-profile-flow.md`, `21-endpoint-matrix-social-profile-search.md`.
- **Bài tập:**
  - Viết 10 business rule ngắn cho Friend + Profile (Nếu... thì...).
  - Chỉ ra endpoint nào bắt buộc internal token.
- **Đầu ra tự chấm:**
  - Truy vết được luồng friend request -> accept -> notify.

## Ngày 5 - Chat realtime và Dashboard Search orchestration

- **Mục tiêu:** hiểu khác biệt sync HTTP và async queue/socket trong chat/search.
- **Đọc bắt buộc:** `04-chat-message-flow.md`, `12-dashboard-search-flow.md`.
- **Bài tập:**
  - Viết sequence 8 bước cho DM realtime.
  - Liệt kê các context bắt buộc của Dashboard Search (orgId/friendId).
- **Đầu ra tự chấm:**
  - Chỉ ra được 3 điểm dễ lỗi khi nhiều API gọi song song ở search.

## Ngày 6 - Task + AI Task + Voice + Document

- **Mục tiêu:** đọc được các workflow nhiều service và nhận diện blindspots thực chiến.
- **Đọc bắt buộc:** `05-task-flow.md`, `06-ai-task-flow.md`, `07-voice-meeting-flow.md`, `14-document-flow.md`, `22-endpoint-matrix-chat-task-ai-voice-document.md`.
- **Bài tập:**
  - Chỉ ra điểm cần idempotency ở AI Task/Task.
  - Chỉ ra rủi ro cascade purge khi route internal chưa mount đầy đủ.
- **Đầu ra tự chấm:**
  - Nói được ít nhất 5 điểm hardening ưu tiên cao, có lý do.

## Ngày 7 - Tổng hợp tư duy Architect + Agentic Coding

- **Mục tiêu:** chuyển từ “người code” sang “người thiết kế và ra quyết định”.
- **Đọc bắt buộc:** toàn bộ 3 file matrix + `08-next-batch-roadmap.md`.
- **Bài tập capstone:**
  - Chọn 1 feature mới (ví dụ: “Pin message trong channel”).
  - Viết mini-spec gồm:
    - Business rules (>= 12 rule),
    - State/exception,
    - Endpoint matrix,
    - Sequence diagram,
    - Blindspots.
- **Đầu ra tự chấm:**
  - Spec đủ rõ để AI có thể code mà không hỏi lại luật nghiệp vụ.

## Checklist hoàn thành khóa 7 ngày

- Đọc và giải thích lại được tất cả flow theo ngôn ngữ người dùng.
- Không nhầm giữa rule nghiệp vụ và chi tiết implementation.
- Nhìn endpoint là đoán được middleware/exception chính.
- Có thể tự review code AI theo 3 tầng: đúng nghiệp vụ -> đúng kiến trúc -> đúng kỹ thuật.

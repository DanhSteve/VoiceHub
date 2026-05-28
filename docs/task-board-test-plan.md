# Task Boards Test Plan (Trello-like)

## Feature flag / compatibility
- Mặc định hệ thống **không hiển thị board-card** trong endpoint legacy `/api/tasks` (kanban cũ).
- Kỳ vọng:
  - Nếu `TASK_BOARD_CARDS_IN_TASKS_API` **!=** `true`: `/api/tasks?organizationId=...` chỉ trả “plain” tasks cũ.
  - Nếu `TASK_BOARD_CARDS_IN_TASKS_API=true`: board-card có thể xuất hiện trong `/api/tasks` (dùng để debug/rollout).
  - Nếu `RBAC_ASSIGNMENT_ONLY=true`: placement lấy từ `RoleScopeAssignment`, không đọc `Membership.team/department/division`.
  - Nếu `RBAC_EXPLICIT_SCOPE_ONLY=true`: không phát sinh quyền ngầm theo cây, chỉ có quyền khi explicit ACL có hiệu lực.

## Migration helpers
- Backfill assignment: `POST /api/organizations/internal/backfill-role-scope-assignments`
- Verify chain: chạy `node scripts/verify-assignment-chain.js`
- Drop legacy placement fields: chạy `node scripts/migrate-membership-drop-placement.js`

---

## Môi trường kiểm thử
- User có quyền vào org theo placement (team có thể phải có quyền `canReadTeam`).
- Có ít nhất 1 team trong 1 channel thuộc team đó.
- Có 1 message chat chứa `@mention` tới đúng người.

---

## Test kịch bản 1: Tạo Task Board từ right-click team
1. Mở workspace ở tab chat hoặc tasks.
2. Chuột phải vào **một team** trong cây structure.
3. Click **“Tạo Task Board”**.
4. Modal:
   - Chọn `Tiêu đề board` (bắt buộc).
   - Chọn `Phông nền` preset.
   - Chọn quyền xem: `Riêng tư` hoặc `Không gian làm việc`.
5. Nếu thiếu tiêu đề: nút tạo phải disable.
6. Submit:
   - Khi bấm tạo: hiển thị loading trạng thái “Đang tạo...”.
   - Tạo xong: modal đóng và board mới xuất hiện trong UI.

Kết quả mong đợi:
- Board mới có đúng scope đã chọn (`teamId` legacy hoặc `scopeType/scopeId`).
- Không tạo được nếu thiếu tiêu đề.

---

## Test kịch bản 2: Seed list + thêm list
1. Sau khi tạo board xong, UI hiển thị các list mặc định theo thứ tự.
2. Nhập tên list mới (không rỗng) và click **“Thêm danh sách”**.
3. Reload danh sách list (hoặc đợi UI cập nhật).

Kết quả mong đợi:
- List mới xuất hiện ngay trong board.

---

## Test kịch bản 3: Thêm card, sửa card, chuyển card
1. Chọn board (nếu có selector).
2. Ở một list bất kỳ:
   - Nhập title card và click **“Thêm”**.
3. Sửa card:
   - Click **“Sửa”** → đổi title/description → click **“Lưu”**.
4. Chuyển card:
   - Từ dropdown **“Chuyển tới...”** chọn list khác → click **“Lưu”**.

Kết quả mong đợi:
- Card tạo thành công và nằm đúng list.
- Sửa cập nhật title/description.
- Chuyển card chuyển sang list mới.

---

## Test kịch bản 4: AI auto-task chọn đúng Board + List theo team của kênh chat
1. Mở channel thuộc team X (kênh chat của team đó).
2. Gửi message có `@mention` một thành viên trong team X (để đảm bảo assignee resolve).
3. Chuột phải vào message → chọn hành động “Tạo Task bằng AI”.
4. Ở phase “ready”:
   - Modal hiển thị selector **Task Board** (chỉ các board trong team X).
   - Selector **Danh sách** (chỉ các list thuộc board đã chọn).
   - Nếu chưa có board/list hoặc chưa chọn đủ thì nút confirm phải disable/khóa.
5. Click confirm **“Tạo task”**.

Kết quả mong đợi:
- Task/card được tạo nằm đúng board và đúng list đã chọn.
- Assignee trong card (và department/team hiển thị liên thông từ AI enrich) trỏ đúng người được `@mention`.

---

## Test kịch bản 5: Private/Workspace visibility (quyền xem)
1. Tạo board ở chế độ `Riêng tư`.
2. Đăng nhập bằng một user khác (thuộc cùng team vẫn chưa được add quyền riêng).
3. Kiểm tra:
   - User không thấy board.
   - User không thể thêm/sửa card.
4. Tạo board ở chế độ `Không gian làm việc`.
5. Kiểm tra:
   - User trong team đó thấy board.
   - User trong team có thể thêm/sửa card.

---

## Known checks / logging gợi ý
- Nếu AI tạo card sai list:
  - Kiểm tra `boardId/listId` trong payload confirm của modal.
  - Kiểm tra task-service route `/api/tasks/boards/:boardId/cards` trả về `data._id`.


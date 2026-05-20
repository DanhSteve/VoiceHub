# Roadmap hoàn thiện và checklist nghiệm thu tài liệu luồng nghiệp vụ

## 1) Các flow đã hoàn tất

- Batch 1: Auth, Organization Membership, RBAC Permission.
- Batch 2: Friend, Notification, User Profile, Dashboard Search, Department/Channel.
- Batch 3: Chat Message, Task, AI Task, Voice Meeting, Document.

## 2) Checklist đối chiếu “chuẩn vàng” cho từng flow

- Có route vào từ gateway và service đích rõ ràng.
- Có middleware auth/permission/validate nêu cụ thể.
- Có controller/service/model và nơi lưu dữ liệu.
- Có nhánh async (queue/webhook/socket/cache) nếu tồn tại.
- Có giải thích nghiệp vụ theo góc nhìn user thao tác thật.
- Có sequence diagram `alt/else` thành công/thất bại.
- Có phần review điểm mù để hardening.

## 3) Điểm mù hệ thống cần ưu tiên hardening (ưu tiên cao)

- Cascade purge liên service cần chắc chắn route nội bộ được mount đầy đủ ở tất cả service liên quan.
- Một số endpoint chat/document cần siết authorization theo ownership/membership chi tiết hơn.
- Đồng tồn tại controller/route legacy ở vài service cần chuẩn hóa dần để tránh drift hành vi.
- Theo dõi cache staleness ở gateway permission và đồng bộ role thay đổi.

## 4) Cách dùng bộ tài liệu để học nhanh

1. Đọc `00-overview.md` để nắm bản đồ tổng.
2. Đọc Batch 1 trước để hiểu “cửa vào và luật quyền”.
3. Sang Batch 2 để hiểu social/profile/search/cấu trúc tổ chức.
4. Sang Batch 3 để hiểu phần giao tiếp-công việc-vận hành realtime/async.
5. Mỗi flow nên đối chiếu trực tiếp file code được nêu trong Bước 1.

# Endpoint Matrix - Social / Profile / Dashboard Search

## 1) Friend

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| POST | `/api/friends/request` | Gateway auth -> friend `protect` | `friend.controller.sendFriendRequest` | `Friend`, Redis friends cache | `400` self-friend, `409` duplicate relation |
| POST | `/api/friends/:friendId/accept` | Gateway auth -> friend `protect` | `friend.controller.acceptFriendRequest` | `Friend` | `404` request not found, `409` invalid state |
| POST | `/api/friends/:friendId/reject` | Gateway auth -> friend `protect` | `friend.controller.rejectFriendRequest` | `Friend` | `404` not found |
| GET | `/api/friends` | Gateway auth -> friend `protect` | `friend.controller.getFriends` | `Friend`, user-service internal profile | `503` mongo unavailable |
| GET | `/api/friends/requests` | Gateway auth -> friend `protect` | `friend.controller.getFriendRequests` | `Friend` | `401` unauthorized |
| POST | `/api/friends/:friendId/block` | Gateway auth -> friend `protect` | `friend.controller.blockFriend` | `Friend` | `404/409` |
| POST | `/api/friends/:friendId/unblock` | Gateway auth -> friend `protect` | `friend.controller.unblockFriend` | `Friend` | `404` relation not found |
| DELETE | `/api/friends/:friendId` | Gateway auth -> friend `protect` | `friend.controller.removeFriend` | `Friend`, chat-service internal purge DM | `404` not found |

## 2) Notification

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| POST | `/api/notifications` | `internalNotificationAuth` | `notification.controller.createNotification` | `Notification` | `401/403` invalid internal token |
| POST | `/api/notifications/bulk` | `internalNotificationAuth` | `notification.controller.createBulkNotifications` | `Notification` | `400` invalid list |
| GET | `/api/notifications` | Gateway auth + `gatewayUserMiddleware` | `notification.controller.getMyNotifications` | `Notification` | `401` missing user context |
| PATCH | `/api/notifications/:notificationId/read` | Gateway auth + `gatewayUserMiddleware` | `notification.controller.markAsRead` | `Notification` | `404` notification not found |
| PATCH | `/api/notifications/read-all` | Gateway auth + `gatewayUserMiddleware` | `notification.controller.markAllAsRead` | `Notification` | `401` unauthorized |
| PATCH | `/api/notifications/read-friend-related` | Gateway auth + `gatewayUserMiddleware` | `notification.controller.markFriendRelatedRead` | `Notification` | `400` invalid filter |
| DELETE | `/api/notifications/:notificationId` | Gateway auth + `gatewayUserMiddleware` | `notification.controller.deleteNotification` | `Notification` | `404` not found |

## 3) User Profile

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| GET | `/api/users/me` | Gateway auth -> `protect` | `user.controller.getCurrentUser` | `UserProfile`, Redis `user:<id>` | `401` unauthorized |
| PATCH/PUT | `/api/users/:userId` | Gateway auth -> `protect` | `user.controller.updateUserProfile` | `UserProfile` | `403` only self-update, `404` profile not found |
| DELETE | `/api/users/:userId` | Gateway auth -> `protect` | `user.controller.deleteUserProfile` | `UserProfile` (soft delete) | `403` only self-delete |
| PATCH | `/api/users/me/status` | Gateway auth -> `protect` | `user.controller.updateMyStatus` | `UserProfile` | `400` invalid status enum |
| GET | `/api/users/search` | Gateway auth -> `protect` | `user.controller.searchUsers` | `UserProfile` | `400` bad query |
| GET | `/api/users/internal/profile/:userId` | `internalServiceAuth` | `user.controller.getInternalProfile` | `UserProfile` | `401` invalid internal token |
| POST | `/api/users/internal/presence/batch` | `internalServiceAuth` | `user.controller.getPresenceBatch` | Redis presence keys | `401/400` |

## 4) Dashboard Search (client orchestration)

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| GET | `/api/organizations/my` | Gateway auth -> org `protect` | `organizationController.getMyOrganizations` | `Organization`, `Membership` | `401` |
| GET | `/api/friends` | Gateway auth -> friend `protect` | `friend.controller.getFriends` | `Friend` | `503` DB unavailable |
| GET | `/api/messages/search` | Gateway auth + chat policy | `message.controller.searchMessages` | `Message` | `403` channel access denied |
| GET | `/api/messages` (DM filter) | Gateway auth | `message.controller.getMessages` | `Message` | `400` missing receiver context |
| GET | `/api/tasks` | Gateway auth -> task middleware | `task.controller.getTasks` | `Task` | `403` org mismatch |
| GET | `/api/meetings` | Gateway auth -> voice middleware | `meeting.controller.getMeetings` | `Meeting` | `403/404` |
| GET | `/api/notifications` | Gateway auth + notification user context | `notification.controller.getMyNotifications` | `Notification` | `401` |
| GET | `/api/documents` | Gateway auth -> document middleware | `document.controller.getDocuments` | `Document` | `403` forbidden scope |

## 5) Lưu ý nghiệp vụ cho Search

- `Dashboard Search` không phải một endpoint backend duy nhất; đây là lớp tổng hợp ở client.
- Các lỗi context (`orgId`, `friendId`) được xử lý theo từng subfilter trước khi gọi API.
- Mỗi nhánh API có thể lỗi độc lập; UI hiển thị theo kiểu partial-result thay vì fail toàn bộ.

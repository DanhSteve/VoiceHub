# Endpoint Matrix - Chat / Task / AI Task / Voice / Document

## 1) Chat Message

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| POST | `/api/messages` | Gateway auth (+ permission theo ngữ cảnh route) | `message.controller.createMessage` | `Message` | `400` invalid payload |
| GET | `/api/messages` | Gateway auth | `message.controller.getMessages` | `Message` | `400` missing `receiverId`/`roomId` |
| GET | `/api/messages/search` | Gateway auth + org channel access policy | `message.controller.searchMessages` | `Message` + org accessible channels | `403` forbidden channel scope |
| PATCH | `/api/messages/:id/read` | Gateway auth | `message.controller.markAsRead` | `Message` | `404` not found, potential authorize gap |
| PATCH | `/api/messages/:id` | Gateway auth | `message.controller.updateMessage` | `Message` | `403` not owner, `404` not found |
| DELETE | `/api/messages/:id` | Gateway auth | `message.controller.deleteMessage` | `Message` (soft delete) | `403/404` |
| Socket Emit | `friend:send`, `friend:new_message` | Socket namespace middleware | `chat.namespace/friend.socket` | RabbitMQ + `Message` | payload validation errors |

## 2) Task

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| POST | `/api/tasks` | Gateway auth -> `gatewayUser` middleware | `task.controller.createTask` | `Task` | `400` invalid payload, `403` forbidden org |
| GET | `/api/tasks` | Gateway auth -> `gatewayUser` middleware | `task.controller.getTasks` | `Task` | `401/403` |
| PATCH/PUT | `/api/tasks/:id` | Gateway auth -> `gatewayUser` middleware | `task.controller.updateTask` | `Task` | `404` not found, `403` unauthorized update |
| DELETE | `/api/tasks/:id` | Gateway auth -> `gatewayUser` middleware | `task.controller.deleteTask` | `Task` (soft delete) | `404` not found |
| POST | `/api/tasks/:id/comments` | Gateway auth -> `gatewayUser` middleware | `task.controller.addComment` | `Task` | `404` task not found |
| POST | `/api/tasks/from-chat-file` | Gateway auth -> `gatewayUser` middleware | `task.controller.createTaskFromChatFile` | RabbitMQ job + `Task` | `202` accepted, worker failure -> retry/DLQ |

## 3) AI Task

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| POST | `/api/ai-tasks/extract` | Gateway auth -> ai-task auth middleware | `aiTask.controller.extract` | `AiTaskExtraction` + RabbitMQ | `400` invalid source message |
| GET | `/api/ai-tasks/:id` | Gateway auth | `aiTask.controller.getExtraction` | `AiTaskExtraction` | `404` extraction not found |
| POST | `/api/ai-tasks/confirm` | Gateway auth + idempotency key | `aiTask.controller.confirm` | `AiTaskExtraction`, `Task` | `409` duplicate confirm, `5xx` task create fail |
| POST | `/api/ai-tasks/sync` (internal/worker) | internal auth | `aiTask.controller.syncSuggestion` | `SyncSuggestion` | `401` internal auth fail |
| Worker Queue | `task-ai.extract`, `task-ai.sync` | Rabbit consumer | `ai-task-worker` | `AiTaskExtraction`, `SyncSuggestion` | LLM timeout, parse fail, DLQ fallback |

## 4) Voice Meeting

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| POST | `/api/meetings` | Gateway auth -> voice `gatewayUser` | `meeting.controller.createMeeting` | `Meeting` | `400` invalid context |
| GET | `/api/meetings` | Gateway auth -> voice `gatewayUser` | `meeting.controller.getMeetings` | `Meeting` | `403` no access |
| POST | `/api/meetings/:id/start` | Gateway auth -> voice `gatewayUser` | `meeting.controller.startMeeting` | `Meeting`, mediasoup room init | `404` not found, `403` forbidden |
| POST | `/api/meetings/:id/end` | Gateway auth -> voice `gatewayUser` | `meeting.controller.endMeeting` | `Meeting`, mediasoup room close | `404/403` |
| POST | `/api/meetings/:id/participants` | Gateway auth -> voice `gatewayUser` | `meeting.controller.addParticipant` | `Meeting` | `400` not active meeting |
| Socket Namespace | `/voice` | voice namespace auth | `voice.namespace` | mediasoup transports | join rejected (forbidden/ended room) |

## 5) Document

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| POST | `/api/documents` | Gateway auth -> document auth middleware | `document.controller.createDocument` | `Document` | `400` invalid payload |
| GET | `/api/documents` | Gateway auth -> document auth middleware | `document.controller.getDocuments` | `Document` | `403` scope/access issue |
| GET | `/api/documents/:id` | Gateway auth -> document auth middleware | `document.controller.getDocumentById` | `Document` | `403/404` |
| PUT/PATCH | `/api/documents/:id` | Gateway auth -> document auth middleware | `document.controller.updateDocument` | `Document` | `403` owner only |
| POST | `/api/documents/:id/versions` | Gateway auth -> document auth middleware | `document.controller.uploadVersion` | `Document.previousVersions` | `403/404` |
| DELETE | `/api/documents/:id` | Gateway auth -> document auth middleware | `document.controller.deleteDocument` | `Document` (soft delete) | `403/404` |
| Internal purge | `/internal/documents/purge-organization/:id` | internal token middleware (phải mount) | internal route handler | `Document` | `401/404`, missing route mount risk |

## 6) Tín hiệu lỗi/hardening ưu tiên cao

- Chat: cần siết thêm authorization cho một số endpoint read-state theo user context.
- AI Task/Document: route internal purge phải được mount đầy đủ để cascade delete không bị rò dữ liệu.
- Voice: xác minh liên dịch vụ phải có trusted header đúng để tránh false-not-found.

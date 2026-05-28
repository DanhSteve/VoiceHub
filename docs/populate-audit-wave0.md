# Populate audit — Wave 0 (2026-05)

> Rà soát `.populate()` cross-service (ref `User` / model không đăng ký) — nguyên nhân `MissingSchemaError` hoặc query chậm.

## Kết luận nhanh

| Service | Hot path | Rủi ro | Wave 0 |
|---------|----------|--------|--------|
| **document-service** | `GET /documents`, `getDocumentById` | populate `uploadedBy` → User không có trong service | **Đã sửa** — profile qua `fetchUserProfileByIdInternal` |
| **chat-service** | messages | Không populate User | OK |
| **notification-service** | list | Không populate | OK |
| **task-service** | `task.service.js` | Đã comment không populate | OK |
| **task-service** | `taskController.js` (legacy) | populate `assignedTo` — field sai schema | Không mount route — backlog xóa file |
| **friend-service** | pending requests | populate Friend subdocs | Model Friend local — OK nếu ref đúng collection |
| **organization-service** | server/org list | populate owner/members | Model nội bộ org — theo dõi |
| **voice-service** | meetings | populate host/participants | Theo dõi — không hot path org documents |
| **role-permission-service** | roles | populate roleId | Nội bộ service |

## Chi tiết document-service (đã xử lý)

**Trước:**

```js
Document.find(filter).populate('uploadedBy', 'username displayName avatar')
```

**Sau:** `.lean()` + gắn `uploadedBy: { _id, username, displayName, avatar }` từ user-service internal API.

File: `services/document-service/src/services/document.service.js`, helper `services/document-service/src/utils/attachUploaderProfiles.js`.

## Các populate còn lại (không sửa Wave 0)

### organization-service

- `server.service.js`, `organization.service.js` — populate `ownerId`, `members.userId`
- **Ghi chú:** Cần xác nhận có đăng ký schema User tối thiểu trong org-service hoặc chỉ trả ObjectId + hydrate gateway sau.

### friend-service

- `friendController.js` — `.populate('requester'|'recipient')`
- **Ghi chú:** Friend model trong cùng service; không chặn org documents.

### voice-service

- `meeting.service.js` — populate host/participants

### role-permission-service

- `permission.service.js`, `role.service.js` — populate `roleId` (cùng DB role)

## Checklist regression

- [ ] `GET /api/documents?organizationId=` trả `uploadedBy.displayName` (object hoặc fallback id)
- [ ] `GET /api/documents/:id` không 500
- [ ] Org documents UI (`mapLibraryDocumentToOrgFile`) hiển thị owner đúng

## Tham chiếu rule repo

`.cursor/rules/voicehub-constraints.mdc` — populate ref model chưa đăng ký → 500.

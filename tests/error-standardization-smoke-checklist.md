# Smoke checklist - Error Standardization

## Muc tieu

Dam bao cac luong chinh tra ve thong diep than thien va ma loi on dinh.

## Case bat buoc

- `401` Auth: token het han -> co `errorCode` va thong diep dang nhap lai.
- `403` Permission: truy cap tai nguyen khong du quyen -> message user-facing.
- `404` Not found: profile/task/board khong ton tai -> ma loi theo domain.
- `409` Conflict: du lieu trung (email/role/invite) -> thong diep khong ky thuat.
- `5xx` Internal: khong lo stack trace/noi dung he thong.

## Kiem tra frontend

- Toast/banner hien thi qua resolver (`resolveApiErrorMessage`).
- Khong con callsite dung truc tiep `err.response?.data?.message || err.message` tai cac trang traffic cao.

## Security regression (sau hardening)

- User thuong `POST /api/roles` -> `403`; org admin -> `200`.
- `POST /api/messages/internal/*` qua gateway (co/khong token) -> `403`/`401`.
- User A khong doc notification user B qua gateway.
- Friend call: chi caller/callee join duoc room `friend-1on1-*`.
- `GET /uploads/*` khong JWT -> `401`; co JWT -> `200`.
- Socket `room:join` org channel: member hop le -> joined; user ngoai org -> `room:error`.

## Kiem tra backend

- Response loi co `messageUser` va `errorCode` o domain da migrate.
- Middleware/controller khong tra raw error tu DB/JWT/Redis.

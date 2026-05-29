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

## Kiem tra backend

- Response loi co `messageUser` va `errorCode` o domain da migrate.
- Middleware/controller khong tra raw error tu DB/JWT/Redis.

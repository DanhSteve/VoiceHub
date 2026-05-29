# Error Catalog (User-facing)

Tai lieu nay quy dinh ma loi va thong diep hien thi toi nguoi dung theo domain.

## Quy uoc

- Giu nguyen HTTP status hien co, chi bo sung truong `errorCode` va `messageUser`.
- `message` phai la noi dung da sanitize, khong chua stack trace/token/query raw.
- Frontend uu tien hien thi: `messageUser` -> map theo `errorCode` -> `message` -> fallback chung.

## Auth/Profile

- `AUTH_NO_TOKEN`: Vui long dang nhap lai.
- `AUTH_TOKEN_EXPIRED`: Phien dang nhap da het han.
- `AUTH_TOKEN_INVALID`: Phien dang nhap khong hop le.
- `AUTH_INVALID_CREDENTIALS`: Email hoac mat khau khong dung.
- `AUTH_EMAIL_NOT_VERIFIED`: Vui long xac thuc email truoc khi dang nhap.
- `USER_PROFILE_NOT_FOUND`: Chua tim thay ho so nguoi dung.

## Org/RBAC

- `ORG_ACCESS_DENIED`: Ban khong co quyen truy cap to chuc nay.
- `ROLE_NAME_EXISTS`: Ten vai tro da ton tai trong to chuc.
- `ROLE_NOT_FOUND`: Khong tim thay vai tro.
- `PERMISSION_CHECK_FAILED`: Khong the kiem tra quyen truy cap.

## Chat/Task/AI

- `TASK_CREATE_FAILED`: Khong the tao task.
- `TASK_BOARD_CARD_UPDATE_FAILED`: Khong the cap nhat card.
- `AI_DUE_DATE_REQUIRED`: Tin nhan chua co deadline ro ngay/gio.
- `AI_CONFIRM_CREATE_TASK_FAILED`: Khong the tao task tu goi y AI.

## Voice/Document/Notification/Socket

- `VOICE_INTERNAL_ERROR`: Khong the xu ly thao tac thoai luc nay.
- `DOCUMENT_INTERNAL_ERROR`: Dich vu tai lieu dang ban.
- `NOTIFICATION_INTERNAL_ERROR`: He thong thong bao dang ban.
- `SOCKET_PRESENCE_SUBSCRIBE_FAILED`: Khong the theo doi trang thai hien dien luc nay.

## Checklist review endpoint moi

- Co `errorCode` cho moi nhanh loi quan trong (401/403/404/409/5xx).
- Co `messageUser` va message da sanitize.
- Khong tra truc tiep `error.message` tu exception he thong.
- Frontend callsite dung `resolveApiErrorMessage`.

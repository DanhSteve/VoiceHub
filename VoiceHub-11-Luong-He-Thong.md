# VoiceHub - 11 luồng hoạt động chính (chi tiết + rút gọn)

Tài liệu này tổng hợp 11 luồng cốt lõi của hệ thống VoiceHub.
Mỗi luồng gồm:
- **Sơ đồ chi tiết** (sequenceDiagram)
- **Sơ đồ rút gọn** (flowchart)

---

## Luồng 1 - Xác thực người dùng (Auth)

### 1.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Client (React)
    participant GW as API Gateway
    participant AU as auth-service
    participant US as user-service
    participant DB as MongoDB
    participant R as Redis
    participant M as Mail

    U->>FE: Nhập email/mật khẩu
    FE->>GW: POST /api/auth/login hoặc /register
    GW->>GW: Rate limit + validate + middleware bảo mật
    GW->>AU: Forward request

    alt Login
        AU->>DB: Tìm user auth
        AU->>AU: Verify password (bcrypt)
        alt Hợp lệ
            AU->>AU: Tạo JWT
            AU->>R: Lưu metadata session (nếu bật)
            AU-->>GW: 200 + token + user summary
            GW-->>FE: Trả kết quả
            FE->>FE: Lưu token
        else Không hợp lệ
            AU-->>GW: 401
            GW-->>FE: 401 + message
        end
    else Register
        AU->>DB: Check trùng email
        AU->>DB: Tạo user auth
        AU->>US: Tạo hồ sơ user ban đầu
        AU->>M: Gửi email xác thực
        AU-->>GW: 201
        GW-->>FE: Đăng ký thành công
    end
```

### 1.2 Rút gọn
```mermaid
flowchart LR
A[User Login/Register] --> B[Client]
B --> C[API Gateway]
C --> D[auth-service]
D --> E[(MongoDB)]
D --> F[(Redis optional)]
D --> G[user-service]
D --> H[Email verify]
H --> B
```

---

## Luồng 2 - Bootstrap dữ liệu sau đăng nhập

### 2.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant FE as Client
    participant GW as API Gateway (BFF)
    participant R as Redis Cache
    participant US as user-service
    participant OS as organization-service
    participant NS as notification-service

    FE->>GW: GET /api/bootstrap
    GW->>R: Check cache bootstrap theo user
    alt Cache hit
        R-->>GW: Payload cache
        GW-->>FE: Trả nhanh
    else Cache miss
        GW->>US: Lấy profile
        GW->>OS: Lấy organizations/member context
        GW->>NS: Lấy unread notifications
        GW->>GW: Gom và chuẩn hóa payload
        GW->>R: Ghi cache TTL
        GW-->>FE: Trả payload bootstrap
    end
```

### 2.2 Rút gọn
```mermaid
flowchart LR
A[Client gọi Bootstrap] --> B[API Gateway BFF]
B --> C{Redis cache?}
C -- Hit --> D[Trả payload]
C -- Miss --> E[user-service]
C -- Miss --> F[organization-service]
C -- Miss --> G[notification-service]
E --> H[Gom dữ liệu]
F --> H
G --> H
H --> I[Lưu cache]
I --> D
```

---

## Luồng 3 - RBAC và kiểm soát truy cập theo tổ chức

### 3.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant FE as Client
    participant GW as API Gateway
    participant RP as role-permission-service
    participant OS as organization-service
    participant DB as MongoDB

    FE->>GW: Request protected (kèm JWT)
    GW->>GW: Verify JWT
    GW->>GW: Extract serverId/organizationId context
    GW->>RP: checkPermission(userId, serverId, action)
    RP->>DB: Đọc role + permission mapping
    RP-->>GW: allowed/denied
    alt allowed
        GW->>OS: Forward request nghiệp vụ
        OS->>DB: Kiểm tra membership thực tế (nếu cần)
        OS-->>GW: Data
        GW-->>FE: 200
    else denied
        GW-->>FE: 403 Permission denied
    end
```

### 3.2 Rút gọn
```mermaid
flowchart LR
A[Client request protected] --> B[Gateway verify JWT]
B --> C[Extract org/server context]
C --> D[role-permission-service]
D --> E{Allowed?}
E -- Yes --> F[Forward service đích]
E -- No --> G[403]
F --> H[200/Data]
```

---

## Luồng 4 - Quản trị cấu trúc tổ chức (branch/division/department/team/channel)

### 4.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant FE as Client
    participant GW as API Gateway
    participant OS as organization-service
    participant DB as MongoDB
    participant NS as notification-service

    FE->>GW: Tạo/Sửa/Xóa cấu trúc tổ chức
    GW->>GW: Auth + permission middleware
    GW->>OS: Forward request
    OS->>DB: Validate scope + ghi dữ liệu cấu trúc
    OS->>NS: Phát event thông báo nội bộ (tuỳ case)
    OS-->>GW: Kết quả cập nhật
    GW-->>FE: Trả dữ liệu mới
```

### 4.2 Rút gọn
```mermaid
flowchart LR
A[Client quản trị cấu trúc] --> B[Gateway]
B --> C[organization-service]
C --> D[(MongoDB)]
C --> E[notification-service optional]
D --> F[Trả cấu trúc mới]
F --> A
```

---

## Luồng 5 - Chat realtime (DM + Organization chat)

### 5.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant FE as Client
    participant GW as API Gateway
    participant CS as chat-service
    participant SS as socket-service
    participant DB as MongoDB
    participant MS as Meilisearch

    FE->>GW: POST /api/messages
    GW->>CS: Forward create message
    CS->>DB: Lưu message
    CS->>MS: Index message search
    CS->>SS: Publish realtime event
    SS-->>FE: Push message tới recipient/room
    CS-->>GW: ACK saved
    GW-->>FE: 201 created
```

### 5.2 Rút gọn
```mermaid
flowchart LR
A[Client gửi tin nhắn] --> B[Gateway]
B --> C[chat-service]
C --> D[(MongoDB)]
C --> E[(Meilisearch)]
C --> F[socket-service]
F --> G[Realtime tới client khác]
```

---

## Luồng 6 - Voice/Meeting realtime (WebRTC + SFU)

### 6.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant FE as Client
    participant GW as API Gateway
    participant VS as voice-service
    participant SS as socket-service
    participant DB as MongoDB

    FE->>GW: Join voice room / signaling request
    GW->>VS: Forward voice API
    VS->>VS: Tạo room/transport mediasoup
    VS->>SS: Broadcast participant state
    SS-->>FE: Realtime participant updates
    VS->>DB: Lưu metadata room/session (nếu cần)
    VS-->>GW: Thông tin transport/producer/consumer
    GW-->>FE: Client thiết lập media stream
```

### 6.2 Rút gọn
```mermaid
flowchart LR
A[Client join room] --> B[Gateway]
B --> C[voice-service mediasoup]
C --> D[socket-service]
D --> E[Realtime trạng thái phòng]
C --> F[(MongoDB optional metadata)]
```

---

## Luồng 7 - Quản lý công việc (Task)

### 7.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant FE as Client
    participant GW as API Gateway
    participant TS as task-service
    participant DB as MongoDB
    participant MQ as RabbitMQ
    participant NS as notification-service

    FE->>GW: CRUD task / board / status
    GW->>TS: Forward request
    TS->>DB: Ghi/đọc task data
    TS->>MQ: Publish task events (tuỳ case)
    MQ->>NS: Consume để tạo thông báo (tuỳ case)
    TS-->>GW: Kết quả
    GW-->>FE: Cập nhật giao diện
```

### 7.2 Rút gọn
```mermaid
flowchart LR
A[Client thao tác task] --> B[Gateway]
B --> C[task-service]
C --> D[(MongoDB)]
C --> E[(RabbitMQ optional)]
E --> F[notification-service optional]
```

---

## Luồng 8 - AI Task/OCR xử lý nền

### 8.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant FE as Client
    participant GW as API Gateway
    participant AIS as ai-task-service
    participant MQ as RabbitMQ
    participant AIW as ai-task-worker
    participant OL as Ollama
    participant OCR as PaddleOCR
    participant DB as MongoDB

    FE->>GW: Request AI extract/confirm
    GW->>AIS: Forward
    AIS->>MQ: Publish job
    AIS-->>GW: Accepted/queued
    GW-->>FE: Job đã nhận

    MQ->>AIW: Worker consume job
    AIW->>OL: Gọi model AI
    AIW->>OCR: OCR khi có ảnh/tài liệu
    AIW->>DB: Lưu kết quả
    AIW->>MQ: Publish completion event (tuỳ case)
```

### 8.2 Rút gọn
```mermaid
flowchart LR
A[Client request AI] --> B[Gateway]
B --> C[ai-task-service]
C --> D[(RabbitMQ)]
D --> E[ai-task-worker]
E --> F[Ollama]
E --> G[PaddleOCR]
E --> H[(MongoDB kết quả)]
```

---

## Luồng 9 - Tài liệu và file (upload/download)

### 9.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant FE as Client
    participant GW as API Gateway
    participant DS as document-service
    participant S3 as S3 Storage
    participant DB as MongoDB

    FE->>GW: Xin signed URL upload/download
    GW->>DS: Forward request
    DS->>S3: Tạo presigned URL
    DS->>DB: Lưu metadata tài liệu
    DS-->>GW: URL + metadata
    GW-->>FE: Trả signed URL
    FE->>S3: Upload/Download trực tiếp
```

### 9.2 Rút gọn
```mermaid
flowchart LR
A[Client file action] --> B[Gateway]
B --> C[document-service]
C --> D[S3 presigned URL]
C --> E[(MongoDB metadata)]
D --> A
```

---

## Luồng 10 - Thông báo tập trung

### 10.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant SRV as Services (chat/task/org/...)
    participant MQ as RabbitMQ
    participant NS as notification-service
    participant DB as MongoDB
    participant GW as API Gateway
    participant FE as Client

    SRV->>MQ: Publish notification event
    MQ->>NS: Consume event
    NS->>DB: Lưu notification
    FE->>GW: GET /api/notifications
    GW->>NS: Forward
    NS->>DB: Query list unread/read
    NS-->>GW: Payload notifications
    GW-->>FE: Hiển thị cho user
```

### 10.2 Rút gọn
```mermaid
flowchart LR
A[Service phát event] --> B[(RabbitMQ)]
B --> C[notification-service]
C --> D[(MongoDB)]
E[Client] --> F[Gateway]
F --> C
C --> E
```

---

## Luồng 11 - Bảo mật và điều phối request tại Gateway (cross-cutting)

### 11.1 Chi tiết
```mermaid
sequenceDiagram
    autonumber
    participant FE as Client
    participant GW as API Gateway
    participant RP as role-permission-service
    participant SV as Target Service

    FE->>GW: Request /api/*
    GW->>GW: CORS + Helmet + Rate Limit
    GW->>GW: Auth middleware (JWT)
    alt Route cần permission
        GW->>GW: Extract action + org/server context
        GW->>RP: Check permission
        RP-->>GW: allowed/denied
    end

    alt Allowed
        GW->>SV: Proxy request
        SV-->>GW: Response
        GW-->>FE: 2xx/4xx từ service
    else Denied hoặc thiếu context
        GW-->>FE: 401/403/400
    end
```

### 11.2 Rút gọn
```mermaid
flowchart LR
A[Client request] --> B[Gateway security layers]
B --> C[JWT Auth]
C --> D{Need permission?}
D -- Yes --> E[Check role-permission]
D -- No --> G[Proxy service]
E --> F{Allowed?}
F -- Yes --> G
F -- No --> H[Reject 403/400]
G --> I[Response]
```

---

## Gợi ý dùng tài liệu cho thuyết trình 15 phút

- Dùng bản **rút gọn** cho slide chính.
- Chỉ mở bản **chi tiết** khi bị hỏi sâu ở Q&A.
- Nên ưu tiên trình bày các luồng: **1, 3, 5, 6, 8, 11** (nổi bật nhất về kiến trúc và giá trị hệ thống).


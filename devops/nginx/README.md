# VoiceHub LAN HTTPS (Nginx + mkcert)

This setup adds HTTPS entrypoint for LAN/dev without changing internal service-to-service HTTP.

## 1) Prerequisites

- `mkcert` installed on dev host machine
- `nginx` installed (or Docker image with mounted config)
- VoiceHub stack running as usual (`vite` on `5173`, API Gateway on `3000`)

## 2) Generate internal certificates

PowerShell (run as Administrator on dev host):

```powershell
cd D:\VoiceHub
powershell -ExecutionPolicy Bypass -File .\devops\nginx\mkcert-setup.ps1 -HostName "voicehub.local"
```

Expected output cert location:

- `devops/nginx/certs/<something>.pem`
- `devops/nginx/certs/<something>-key.pem`

Update certificate filenames in `devops/nginx/dev-https.conf` if they differ from:

- `certs/voicehub.local+2.pem`
- `certs/voicehub.local+2-key.pem`

## 3) Hostname mapping (LAN clients)

On each client machine in LAN, add hosts entry:

```text
<IP-may-dev> voicehub.local
```

Use your actual dev host LAN IP (DHCP có thể đổi IP — nên đặt IP tĩnh/reservation trên router).

```powershell
powershell -ExecutionPolicy Bypass -File .\devops\nginx\print-lan-hosts-hint.ps1
```

Chi tiết checklist + xử lý lỗi: [docs/lan-https-voicehub-local.md](../../docs/lan-https-voicehub-local.md).

## 4) Run Nginx with HTTPS config

Windows — Nginx + Vite cùng lúc (double-click hoặc từ repo):

```bat
devops\nginx\start-lan-https-dev.bat
```

Chỉ Nginx (local):

```bash
nginx -p D:/VoiceHub/devops/nginx -c dev-https.conf
```

If using Dockerized Nginx, mount:

- `devops/nginx/dev-https.conf` -> `/etc/nginx/nginx.conf`
- `devops/nginx/certs` -> `/etc/nginx/certs`

## 5) Access

- Open `https://voicehub.local`
- Browser mic/camera now runs in secure context
- Requests are routed:
  - `/` -> `127.0.0.1:5173`
  - `/api` -> `127.0.0.1:3000`
  - `/socket.io` -> `127.0.0.1:3000`
  - `/voice-socket` -> `127.0.0.1:3000`

## 6) No-conflict guarantees

- No change to `docker-compose.core.yml` service ports
- No change to internal service URLs (`http://service-name:port`)
- Only browser-facing entrypoint is upgraded to HTTPS

## 7) Quick verify checklist

- Login works via `https://voicehub.local`
- DM/org chat realtime works
- Voice join can request microphone permission
- File upload works (ensure Storage CORS includes HTTPS origin)

Or run automated checks:

```powershell
cd D:\VoiceHub
powershell -ExecutionPolicy Bypass -File .\devops\nginx\verify-lan-https.ps1 -BaseUrl "https://voicehub.local"
```

## 8) Voice WebRTC (không nghe được / Console: "Không có RTP")

Signaling (`/voice-socket`, `/api`) chạy qua HTTPS — **không** đủ cho tiếng. Media đi **UDP/TCP cổng 40000–40100** tới máy chạy Docker.

1. `services/voice-service/.env` (Docker — **không** dùng `127.0.0.1`):
   ```env
   MEDIASOUP_ANNOUNCED_IP=172.16.1.29
   MEDIASOUP_PREFER_TCP=true
   ```
   (`172.16.1.29` = IP WiFi máy dev từ `ipconfig`; đổi theo mạng thật.)

2. Mở firewall Windows (PowerShell **Administrator**):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\devops\scripts\open-voice-webrtc-firewall.ps1
   ```

3. `docker compose restart voice-service` — log phải có `mediasoup listenIps` với cả `127.0.0.1` và IP LAN.

4. Máy client LAN: file `hosts` trỏ `voicehub.local` → IP máy dev (không dùng `127.0.0.1` trên máy khác).

5. Thử nhanh: **hai tab Chrome trên cùng máy dev** — nếu nghe được thì lỗi là firewall/LAN UDP, không phải code signaling.

## 9) Đổi IP WiFi / nhiều dòng hosts

**Không** ghi nhiều IP cho cùng `voicehub.local` (Windows dùng dòng **đầu tiên**):

```text
# SAI — gây 503 / xhr poll / không nghe voice
127.0.0.1 voicehub.local
172.16.1.13 voicehub.local
192.168.1.3 voicehub.local
```

| Máy | hosts (một dòng) |
|-----|------------------|
| Máy dev (Nginx + Docker) | `127.0.0.1 voicehub.local` |
| Máy khác trong LAN | `<IP-WiFi-máy-dev> voicehub.local` |

Sau khi đổi mạng DHCP:

```powershell
powershell -ExecutionPolicy Bypass -File .\devops\scripts\sync-lan-dev-ip.ps1
docker compose up -d voice-service --force-recreate
```

Rồi sửa **một dòng** hosts trên từng máy client.

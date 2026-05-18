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
172.16.1.29 voicehub.local
```

Use your actual dev host LAN IP.

## 4) Run Nginx with HTTPS config

If using local Nginx:

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

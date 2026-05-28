# Đồng bộ IP LAN vào voice-service (WebRTC) + client Vite (allowedHosts).
# Chạy sau khi đổi WiFi / DHCP — rồi: docker compose up -d voice-service --force-recreate
#
# Usage (PowerShell):
#   powershell -ExecutionPolicy Bypass -File devops\scripts\sync-lan-dev-ip.ps1

Param(
  [switch]$SkipDockerHint
)

$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root "docker-compose.yml"))) {
  $root = (Get-Location).Path
}

function Get-LanIPv4List {
  $ips = @()
  try {
    $ips = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.IPAddress -notmatch "^127\." -and
        $_.IPAddress -notmatch "^169\.254\." -and
        $_.PrefixOrigin -ne "WellKnown" -and
        $_.AddressState -eq "Preferred"
      } |
      Select-Object -ExpandProperty IPAddress -Unique
  } catch {
    Write-Host "[sync-lan] Get-NetIPAddress failed — kiểm tra IP thủ công (ipconfig)." -ForegroundColor Yellow
  }
  return @($ips)
}

function Set-EnvLine {
  Param(
    [string]$FilePath,
    [string]$Key,
    [string]$Value
  )
  if (-not (Test-Path $FilePath)) {
    New-Item -ItemType File -Path $FilePath -Force | Out-Null
  }
  $lines = Get-Content $FilePath -ErrorAction SilentlyContinue
  if (-not $lines) { $lines = @() }
  $pattern = "^\s*$([regex]::Escape($Key))\s*="
  $newLine = "$Key=$Value"
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match $pattern) {
      $found = $true
      $newLine
    } else {
      $line
    }
  }
  if (-not $found) {
    $out += $newLine
  }
  Set-Content -Path $FilePath -Value $out -Encoding utf8
}

$ips = Get-LanIPv4List
if ($ips.Count -eq 0) {
  Write-Host "[sync-lan] Không tìm thấy IPv4 LAN. Kết nối WiFi/Ethernet rồi chạy lại." -ForegroundColor Red
  exit 1
}

$ipCsv = ($ips -join ",")
$primary = $ips[0]

Write-Host "=== VoiceHub sync LAN IP ===" -ForegroundColor Cyan
Write-Host "IP LAN (mediasoup): $ipCsv"
Write-Host ""

$voiceEnv = Join-Path $root "services\voice-service\.env"
Set-EnvLine -FilePath $voiceEnv -Key "MEDIASOUP_ANNOUNCED_IP" -Value $ipCsv
Write-Host "[OK] $voiceEnv -> MEDIASOUP_ANNOUNCED_IP=$ipCsv" -ForegroundColor Green

$clientEnv = Join-Path $root "client\.env"
$allowedHosts = "voicehub.local,voicehub_vite,localhost,127.0.0.1," + ($ips -join ",")
Set-EnvLine -FilePath $clientEnv -Key "VITE_ALLOWED_HOSTS" -Value $allowedHosts
Write-Host "[OK] $clientEnv -> VITE_ALLOWED_HOSTS" -ForegroundColor Green

Write-Host ""
Write-Host "=== File hosts (QUAN TRONG) ===" -ForegroundColor Yellow
Write-Host "Chi 1 dong cho voicehub.local tren MOI may — xoa cac dong trung ten cu."
Write-Host ""
Write-Host "  May DEV (Chrome tren may chay Docker + Nginx):" -ForegroundColor Green
Write-Host "    127.0.0.1 voicehub.local"
Write-Host ""
Write-Host "  May CLIENT khac trong WiFi (khong dung 127.0.0.1):" -ForegroundColor Green
Write-Host "    $primary voicehub.local"
if ($ips.Count -gt 1) {
  Write-Host "  (Neu may dev co nhieu mang, client chi can IP mang dang dung chung voi ban.)"
}
Write-Host ""
Write-Host "Truy cap: https://voicehub.local  (khong mo bang http://IP:5173 tren may LAN)"
Write-Host ""

Write-Host "GATEWAY_INTERNAL_TOKEN: dat trong .env goc + api-gateway/.env (dev-gateway-internal-token-change-me)" -ForegroundColor DarkGray
Write-Host ""

if (-not $SkipDockerHint) {
  Write-Host "Tiep theo:" -ForegroundColor Cyan
  Write-Host "  docker compose build voice-service --no-cache"
  Write-Host "  docker compose up -d voice-service --force-recreate"
  Write-Host "  docker compose up -d api-gateway organization-service chat-service"
  Write-Host "  (restart Vite neu dang chay)"
}

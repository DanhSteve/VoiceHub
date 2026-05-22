# Mở UDP/TCP cho mediasoup WebRTC trên máy dev (Docker publish 40000-40100).
# Chạy PowerShell **Administrator** trên máy chạy Docker + Nginx.

Param(
  [int]$MinPort = 40000,
  [int]$MaxPort = 40100,
  [string]$RuleName = "VoiceHub Mediasoup WebRTC"
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Chay PowerShell **Run as Administrator**." -ForegroundColor Red
  exit 1
}

$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
  Remove-NetFirewallRule -DisplayName $RuleName
}

New-NetFirewallRule -DisplayName $RuleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol UDP `
  -LocalPort $MinPort..$MaxPort `
  -Profile Any | Out-Null

New-NetFirewallRule -DisplayName "$RuleName (TCP)" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $MinPort..$MaxPort `
  -Profile Any | Out-Null

Write-Host "Da mo firewall UDP+TCP $MinPort-$MaxPort ($RuleName)." -ForegroundColor Green
Write-Host "Kiem tra MEDIASOUP_ANNOUNCED_IP = IP WiFi LAN (KHONG 127.0.0.1 khi chay trong Docker)." -ForegroundColor Cyan
Write-Host "Restart: docker compose restart voice-service" -ForegroundColor Cyan

Param(
  [string]$HostName = "voicehub.local",
  [string]$CertDir = "D:\VoiceHub\devops\nginx\certs"
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command: $Name. Install it first."
  }
}

Require-Command "mkcert"

if (-not (Test-Path $CertDir)) {
  New-Item -Path $CertDir -ItemType Directory | Out-Null
}

Push-Location $CertDir
try {
  Write-Host "[mkcert] Install local CA to trust store..." -ForegroundColor Cyan
  mkcert -install

  Write-Host "[mkcert] Generate cert for hostname + localhost + LAN IPs..." -ForegroundColor Cyan
  $ips = @()
  try {
    $ips = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object { $_.IPAddress -notmatch "^127\." -and $_.PrefixOrigin -ne "WellKnown" } |
      Select-Object -ExpandProperty IPAddress -Unique
  } catch {
    # Fallback: only hostname + localhost when network cmd unavailable.
    $ips = @()
  }

  $names = @($HostName, "localhost", "127.0.0.1")
  if ($ips.Count -gt 0) {
    $names += $ips
  }

  mkcert @names

  Write-Host "[mkcert] Done. Cert files are in: $CertDir" -ForegroundColor Green
  Write-Host "Use the generated *.pem and *-key.pem in Nginx SSL config." -ForegroundColor Green
} finally {
  Pop-Location
}

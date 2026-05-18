Param(
  [string]$BaseUrl = "https://voicehub.local",
  [switch]$SkipCertCheck
)

$ErrorActionPreference = "Stop"

function Test-Endpoint($Name, $Url, $ExpectedStatus = 200) {
  Write-Host "[check] $Name -> $Url"
  try {
    if ($SkipCertCheck) {
      add-type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint srvPoint, X509Certificate certificate, WebRequest request, int certificateProblem) {
    return true;
  }
}
"@
      [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
    }

    $resp = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 20
    if ($resp.StatusCode -ne $ExpectedStatus) {
      throw "Expected $ExpectedStatus, got $($resp.StatusCode)"
    }
    Write-Host "  OK ($($resp.StatusCode))" -ForegroundColor Green
  } catch {
    Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
    throw
  }
}

function Test-SocketPolling($Base, $Path) {
  $url = "$Base$Path/?EIO=4&transport=polling"
  Write-Host "[check] Socket polling -> $url"
  $resp = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 20
  if ($resp.StatusCode -ne 200) {
    throw "Socket polling failed with status $($resp.StatusCode)"
  }
  if ($resp.Content -notmatch '"sid"') {
    throw "Socket polling body does not contain sid"
  }
  Write-Host "  OK (sid found)" -ForegroundColor Green
}

Write-Host "=== VoiceHub LAN HTTPS Verify ===" -ForegroundColor Cyan
Write-Host "BaseUrl: $BaseUrl"

Test-Endpoint "Frontend" "$BaseUrl/"
Test-Endpoint "Gateway health" "$BaseUrl/api/health/gateway-trust"
Test-SocketPolling $BaseUrl "/socket.io"
Test-SocketPolling $BaseUrl "/voice-socket"

Write-Host "All checks passed." -ForegroundColor Green

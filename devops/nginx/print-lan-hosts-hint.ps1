# In IP LAN và dòng hosts gợi ý cho máy client.

$ErrorActionPreference = "Continue"



Write-Host "=== VoiceHub LAN hosts hint ===" -ForegroundColor Cyan

Write-Host ""

Write-Host "CANH BAO: Chi 1 dong 'voicehub.local' tren moi may." -ForegroundColor Red

Write-Host "  Khong ghi 127.0.0.1 + 172.16.x + 192.168.x cung luc — Windows dung dong DAU TIEN." -ForegroundColor Red

Write-Host "  May client LAN: chi IP may dev. May dev: chi 127.0.0.1 (hoac chi IP LAN neu test tu may khac)." -ForegroundColor Red

Write-Host ""



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

  Write-Host "Khong doc duoc IP (Get-NetIPAddress). Thu ipconfig thu cong." -ForegroundColor Yellow

}



if ($ips.Count -eq 0) {

  Write-Host "Khong tim thay IPv4 LAN. Kiem tra WiFi/Ethernet dang ket noi." -ForegroundColor Yellow

} else {

  $primary = $ips[0]

  Write-Host "May CLIENT (trong cung WiFi voi may dev) — them DUY NHAT:" -ForegroundColor Green

  Write-Host "  $primary voicehub.local"

  if ($ips.Count -gt 1) {

    Write-Host ""

    Write-Host "May dev dang co nhieu IP: $($ips -join ', ')"

    Write-Host "Chay: powershell -File devops\scripts\sync-lan-dev-ip.ps1"

  }

}



Write-Host ""

Write-Host "May DEV (trinh duyet tren may chay Docker + Nginx):" -ForegroundColor Green

Write-Host "  127.0.0.1 voicehub.local"

Write-Host ""

Write-Host "Truy cap: https://voicehub.local" -ForegroundColor Cyan

Write-Host "Dong bo IP WebRTC: powershell -File devops\scripts\sync-lan-dev-ip.ps1"

Write-Host "Verify: powershell -File devops\nginx\verify-lan-https.ps1 -BaseUrl https://voicehub.local"


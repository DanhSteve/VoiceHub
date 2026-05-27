#!/usr/bin/env bash
# Chẩn đoán 401 trên GET /api/organizations/:orgId/documents-overview
set -euo pipefail

BASE="${1:-http://127.0.0.1:3000}"
ORG_ID="${2:-69f32b00ba0fcc8c79e19aaf}"
TOKEN="${3:-}"

PATH_URL="${BASE}/api/organizations/${ORG_ID}/documents-overview"

echo "=== VoiceHub documents-overview auth diagnose ==="
echo "URL: ${PATH_URL}"
echo ""

code_no_auth=$(curl -s -o /tmp/vh-doc-body.json -w "%{http_code}" "${PATH_URL}" || true)
msg_no_auth=$(node -e "try{const j=require('/tmp/vh-doc-body.json');console.log(j.message||j.error||JSON.stringify(j))}catch(e){console.log('(parse fail)')}" 2>/dev/null || cat /tmp/vh-doc-body.json)
echo "[1] Không gửi Authorization → HTTP ${code_no_auth}"
echo "    message: ${msg_no_auth}"

if [ -n "${TOKEN}" ]; then
  code_auth=$(curl -s -o /tmp/vh-doc-body2.json -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" "${PATH_URL}" || true)
  msg_auth=$(node -e "try{const j=require('/tmp/vh-doc-body2.json');console.log(j.message||j.status||'ok')}catch(e){console.log('(parse fail)')}" 2>/dev/null || true)
  echo "[2] Có Bearer token      → HTTP ${code_auth}"
  echo "    body hint: ${msg_auth}"
else
  echo "[2] Bỏ qua — truyền JWT làm tham số thứ 3 để test có token"
fi

echo ""
echo "Kết luận nhanh:"
echo "  - 401 + 'No token provided' = gateway auth.middleware (thiếu header Bearer)."
echo "  - 401 + 'Invalid token' / 'Token expired' = JWT sai hoặc hết hạn."
echo "  - 200/403 = đã qua gateway; 403 thường là org-service (không phải thiếu JWT)."

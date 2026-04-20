# SPEC PACK - BO TAI LIEU DAC TA TU CHUA

Tong quan van hanh va danh sach service (cap nhat): [`../../README.md`](../../README.md).

Muc tieu: bo tai lieu nay duoc bien soan tu ma nguon hien tai de ban co the viet dac ta day du ma KHONG can doc them file nao khac trong repo.

Ngay cap nhat: 2026-03-20
Pham vi: Toan bo he thong VoiceHub dang co trong ma nguon.

## Ban can doc cac file nao

1. 01-SYSTEM-SPEC.md
2. 02-SERVICE-API-SPEC.md
3. 03-BUSINESS-FLOWS-SRS-CHECKLIST.md
4. 04-SRS-FULL.md

Neu chi co 30 phut:
- Doc nhanh muc 1, 2, 3, 4 cua 01-SYSTEM-SPEC.md
- Doc bang endpoint va model chinh trong 02-SERVICE-API-SPEC.md
- Doc 5 luong nghiep vu trong 03-BUSINESS-FLOWS-SRS-CHECKLIST.md

Neu can tai lieu de nop ngay:
- Doc truc tiep 04-SRS-FULL.md

## Quy uoc tai lieu

- Source of truth: ma nguon thuc te, khong theo tai lieu cu neu xung dot.
- Dung tu "server" trong he thong: workspace/chat-space trong organization.
- Dung tu "organization": cap don vi cao hon server.

## Dau ra ban co the viet ngay

- SRS tong the
- SDD (thiet ke he thong)
- API contract catalog
- Data dictionary
- Permission matrix
- BPMN/sequence cho luong nghiep vu

## Danh sach service dang ton tai

- api-gateway: 3000
- auth-service: 3001
- notification-service: 3003
- user-service: 3004
- voice-service: 3005
- chat-service: 3006
- task-service: 3009
- document-service: 3010
- organization-service: 3013
- friend-service: 3014
- role-permission-service: 3015
- webhook-service (Python FastAPI): 3016
- socket-service: 3017

## Luu y quan trong

- Tai lieu cu trong repo co phan khong con dong bo voi ma nguon (nhat la chat split 3 service). Bo spec-pack nay da chuan hoa theo code hien tai.

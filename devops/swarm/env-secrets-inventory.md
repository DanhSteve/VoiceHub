# Swarm Env & Secrets Inventory

## Core shared
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `MONGO_URI` or `MONGO_*`
- `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`
- `RABBITMQ_URL`, `RABBITMQ_USER`, `RABBITMQ_PASS`
- `GATEWAY_INTERNAL_TOKEN`

## Internal service tokens
- `USER_SERVICE_INTERNAL_TOKEN`
- `CHAT_INTERNAL_TOKEN`
- `REALTIME_INTERNAL_TOKEN`
- `NOTIFICATION_INTERNAL_TOKEN`

## Firebase / file processing
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`

## AI / OCR
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`
- `PADDLEOCR_BASE_URL`
- `LLM_PROVIDER`

## Webhook
- `WEBHOOK_SECRET`
- `NOTIFICATION_SERVICE_URL`

## Swarm secret recommendation
Move sensitive values into Docker secrets/configs:
- JWT secrets
- Internal tokens
- Firebase private key
- Any SMTP/API key

Use naming:
- `voicehub_jwt_secret`
- `voicehub_internal_token_chat`
- `voicehub_firebase_private_key`

Mount secrets as files and map into env at process start when possible.

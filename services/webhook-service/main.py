from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import os
from dotenv import load_dotenv
import logging
from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict
from src.dispatcher import dispatch_domain_event
from src.utils.webhook_queue import queue_enabled, publish_webhook_job

load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Webhook Service",
    description="Webhook service for handling events from microservices",
    version="1.0.0"
)

# Webhook server-to-server — không cần CORS trình duyệt; tránh wildcard + credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


class WebhookPayload(BaseModel):
    """Payload tối thiểu; cho phép field thêm theo từng event."""

    event_type: Optional[str] = None
    model_config = ConfigDict(extra="allow")

    def as_dict(self) -> Dict[str, Any]:
        return self.model_dump(exclude_none=False)

# Webhook secret for authentication — phải trùng WEBHOOK_SECRET trên friend-service / các service gọi webhook
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "your-webhook-secret-key-change-this-in-production")
NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:3003")


async def verify_webhook_secret(x_webhook_secret: Optional[str] = Header(None)):
    """Verify webhook secret"""
    if not x_webhook_secret or x_webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    return True


async def handle_domain_webhook(domain: str, data: Dict[str, Any]):
    if queue_enabled():
        await publish_webhook_job({"domain": domain, "data": data})
        return JSONResponse({"success": True, "queued": True, "domain": domain}, status_code=202)
    await dispatch_domain_event(domain, data)
    return JSONResponse({"success": True, "message": "Webhook processed"})


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "webhook-service"}


@app.post("/webhook/friend")
async def handle_friend_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle friend-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        return await handle_domain_webhook("friend", body.as_dict())
    except Exception as e:
        logger.error(f"Error processing friend webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/task")
async def handle_task_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle task-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        return await handle_domain_webhook("task", body.as_dict())
    except Exception as e:
        logger.error(f"Error processing task webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/meeting")
async def handle_meeting_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle meeting-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        return await handle_domain_webhook("meeting", body.as_dict())
    except Exception as e:
        logger.error(f"Error processing meeting webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/document")
async def handle_document_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle document-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        return await handle_domain_webhook("document", body.as_dict())
    except Exception as e:
        logger.error(f"Error processing document webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/chat")
async def handle_chat_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle chat-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        return await handle_domain_webhook("chat", body.as_dict())
    except Exception as e:
        logger.error(f"Error processing chat webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/role")
async def handle_role_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle role-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        return await handle_domain_webhook("role", body.as_dict())
    except Exception as e:
        logger.error(f"Error processing role webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/webhook/organization")
async def handle_organization_webhook(body: WebhookPayload, x_webhook_secret: str = Header(...)):
    """Handle organization-related webhooks"""
    await verify_webhook_secret(x_webhook_secret)
    try:
        return await handle_domain_webhook("organization", body.as_dict())
    except Exception as e:
        logger.error(f"Error processing organization webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3016))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True if os.getenv("NODE_ENV") == "development" else False
    )




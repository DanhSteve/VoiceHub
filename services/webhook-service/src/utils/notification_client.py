import httpx
import os
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:3003")
NOTIFICATION_INTERNAL_TOKEN = (
    os.getenv("NOTIFICATION_INTERNAL_TOKEN") or os.getenv("GATEWAY_INTERNAL_TOKEN") or ""
).strip()


def _internal_headers():
    h = {"Content-Type": "application/json"}
    if NOTIFICATION_INTERNAL_TOKEN:
        h["x-internal-notification-token"] = NOTIFICATION_INTERNAL_TOKEN
    return h


async def send_notification(
    user_id: str,
    notification_type: str,
    title: str,
    content: str,
    data: Optional[Dict] = None,
    action_url: Optional[str] = None
) -> bool:  
    """Send notification to a single user"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{NOTIFICATION_SERVICE_URL}/api/notifications",
                json={
                    "userId": user_id,
                    "type": notification_type,
                    "title": title,
                    "content": content,
                    "data": data or {},
                    "actionUrl": action_url
                },
                headers=_internal_headers(),
            )
            response.raise_for_status()
            logger.info(f"Notification sent to user {user_id}: {title}")
            return True
    except Exception as e:
        logger.error(f"Error sending notification to user {user_id}: {str(e)}")
        return False


async def send_bulk_notifications(
    user_ids: List[str],
    notification_type: str,
    title: str,
    content: str,
    data: Optional[Dict] = None,
    action_url: Optional[str] = None
) -> bool:
    """Send notification to multiple users"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{NOTIFICATION_SERVICE_URL}/api/notifications/bulk",
                json={
                    "userIds": user_ids,
                    "type": notification_type,
                    "title": title,
                    "content": content,
                    "data": data or {},
                    "actionUrl": action_url
                },
                headers=_internal_headers(),
            )
            response.raise_for_status()
            logger.info(f"Bulk notifications sent to {len(user_ids)} users: {title}")
            return True
    except Exception as e:
        logger.error(f"Error sending bulk notifications: {str(e)}")
        return False




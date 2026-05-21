import logging
from typing import Dict, List
from src.utils.notification_client import send_notification, send_bulk_notifications

logger = logging.getLogger(__name__)


def _org_context_from_event(data: Dict) -> Dict:
    """Gắn organizationId/workspace vào data để lọc scope=organization trên client."""
    organization_id = data.get("organizationId") or data.get("workspaceId")
    if not organization_id:
        return {}
    ctx = {
        "organizationId": organization_id,
        "workspaceId": data.get("workspaceId") or organization_id,
    }
    if data.get("organizationName"):
        ctx["organizationName"] = data.get("organizationName")
    if data.get("workspaceName"):
        ctx["workspaceName"] = data.get("workspaceName")
    if data.get("organizationSlug"):
        ctx["organizationSlug"] = data.get("organizationSlug")
    if data.get("workspaceSlug"):
        ctx["workspaceSlug"] = data.get("workspaceSlug")
    return ctx


async def handle_message_created(data: Dict):
    """Handle message created event"""
    try:
        message_id = data.get("messageId")
        sender_id = data.get("senderId")
        sender_name = data.get("senderName", "Someone")
        room_id = data.get("roomId")
        room_name = data.get("roomName", "Room")
        content = data.get("content", "")
        mentioned_user_ids = data.get("mentionedUserIds", [])
        recipient_ids = data.get("recipientIds", [])
        org_ctx = _org_context_from_event(data)

        # Notify mentioned users
        if mentioned_user_ids:
            await send_bulk_notifications(
                user_ids=mentioned_user_ids,
                notification_type="message",
                title="You were mentioned",
                content=f"{sender_name} mentioned you in {room_name}: {content[:50]}...",
                data={
                    "messageId": message_id,
                    "senderId": sender_id,
                    "senderName": sender_name,
                    "roomId": room_id,
                    "roomName": room_name,
                    "content": content,
                    **org_ctx,
                },
                action_url=f"/chat/{room_id}"
            )

        # Notify other recipients (if direct message)
        if recipient_ids:
            notify_user_ids = [rid for rid in recipient_ids if rid != sender_id and rid not in mentioned_user_ids]
            if notify_user_ids:
                await send_bulk_notifications(
                    user_ids=notify_user_ids,
                    notification_type="message",
                    title="New Message",
                    content=f"{sender_name}: {content[:50]}...",
                    data={
                        "messageId": message_id,
                        "senderId": sender_id,
                        "senderName": sender_name,
                        "roomId": room_id,
                        "roomName": room_name,
                        "content": content,
                        **org_ctx,
                    },
                    action_url=f"/chat/{room_id}"
                )
        
        logger.info(f"Message created notification sent: {message_id}")
    except Exception as e:
        logger.error(f"Error handling message created: {str(e)}")
        raise


async def handle_message_mentioned(data: Dict):
    """Handle message mentioned event (specific handler for mentions)"""
    try:
        message_id = data.get("messageId")
        sender_id = data.get("senderId")
        sender_name = data.get("senderName", "Someone")
        room_id = data.get("roomId")
        room_name = data.get("roomName", "Room")
        content = data.get("content", "")
        mentioned_user_ids = data.get("mentionedUserIds", [])
        org_ctx = _org_context_from_event(data)

        # Notify mentioned users
        if mentioned_user_ids:
            await send_bulk_notifications(
                user_ids=mentioned_user_ids,
                notification_type="message",
                title="You were mentioned",
                content=f"{sender_name} mentioned you in {room_name}",
                data={
                    "messageId": message_id,
                    "senderId": sender_id,
                    "senderName": sender_name,
                    "roomId": room_id,
                    "roomName": room_name,
                    "content": content,
                    **org_ctx,
                },
                action_url=f"/chat/{room_id}"
            )
        
        logger.info(f"Message mentioned notification sent: {message_id}")
    except Exception as e:
        logger.error(f"Error handling message mentioned: {str(e)}")
        raise




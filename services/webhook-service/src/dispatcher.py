import logging
from typing import Dict, Callable, Awaitable

from src.handlers import (
    friend_handler,
    task_handler,
    meeting_handler,
    document_handler,
    chat_handler,
    role_handler,
    organization_handler,
)

logger = logging.getLogger(__name__)


async def _friend(data: Dict):
    event_type = data.get("event_type")
    if event_type == "friend_request_accepted":
        await friend_handler.handle_friend_request_accepted(data)
    elif event_type == "friend_request_sent":
        await friend_handler.handle_friend_request_sent(data)
    elif event_type == "friend_removed":
        await friend_handler.handle_friend_removed(data)
    else:
        logger.warning("Unknown friend event type: %s", event_type)


async def _task(data: Dict):
    event_type = data.get("event_type")
    if event_type == "task_created":
        await task_handler.handle_task_created(data)
    elif event_type == "task_assigned":
        await task_handler.handle_task_assigned(data)
    elif event_type == "task_completed":
        await task_handler.handle_task_completed(data)
    elif event_type == "task_updated":
        await task_handler.handle_task_updated(data)
    else:
        logger.warning("Unknown task event type: %s", event_type)


async def _meeting(data: Dict):
    event_type = data.get("event_type")
    if event_type == "meeting_created":
        await meeting_handler.handle_meeting_created(data)
    elif event_type == "meeting_started":
        await meeting_handler.handle_meeting_started(data)
    elif event_type == "meeting_ended":
        await meeting_handler.handle_meeting_ended(data)
    elif event_type == "participant_joined":
        await meeting_handler.handle_participant_joined(data)
    else:
        logger.warning("Unknown meeting event type: %s", event_type)


async def _document(data: Dict):
    event_type = data.get("event_type")
    if event_type == "document_uploaded":
        await document_handler.handle_document_uploaded(data)
    elif event_type == "document_updated":
        await document_handler.handle_document_updated(data)
    elif event_type == "document_shared":
        await document_handler.handle_document_shared(data)
    else:
        logger.warning("Unknown document event type: %s", event_type)


async def _chat(data: Dict):
    event_type = data.get("event_type")
    if event_type == "message_created":
        await chat_handler.handle_message_created(data)
    elif event_type == "message_mentioned":
        await chat_handler.handle_message_mentioned(data)
    else:
        logger.warning("Unknown chat event type: %s", event_type)


async def _role(data: Dict):
    event_type = data.get("event_type")
    if event_type == "role_assigned":
        await role_handler.handle_role_assigned(data)
    elif event_type == "role_removed":
        await role_handler.handle_role_removed(data)
    else:
        logger.warning("Unknown role event type: %s", event_type)


async def _organization(data: Dict):
    event_type = data.get("event_type")
    if event_type == "server_member_added":
        await organization_handler.handle_server_member_added(data)
    elif event_type == "server_member_removed":
        await organization_handler.handle_server_member_removed(data)
    elif event_type == "organization_created":
        await organization_handler.handle_organization_created(data)
    else:
        logger.warning("Unknown organization event type: %s", event_type)


HANDLERS: Dict[str, Callable[[Dict], Awaitable[None]]] = {
    "friend": _friend,
    "task": _task,
    "meeting": _meeting,
    "document": _document,
    "chat": _chat,
    "role": _role,
    "organization": _organization,
}


async def dispatch_domain_event(domain: str, data: Dict):
    handler = HANDLERS.get(domain)
    if not handler:
        raise ValueError(f"Unknown webhook domain: {domain}")
    await handler(data)

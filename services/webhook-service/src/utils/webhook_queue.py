import json
import os
from typing import Any, Awaitable, Callable

QUEUE_NAME = os.getenv("WEBHOOK_DELIVERY_QUEUE", "voicehub.webhook.delivery")
DLQ_NAME = os.getenv("WEBHOOK_DELIVERY_DLQ", f"{QUEUE_NAME}.dlq")
MAX_RETRIES = int(os.getenv("WEBHOOK_DELIVERY_MAX_RETRIES", "6"))
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "")

_AIO_PIKA: Any = None


def _get_aio_pika() -> Any:
    global _AIO_PIKA
    if _AIO_PIKA is None:
        try:
            import aio_pika as aio_pika_module
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "aio-pika is required when WEBHOOK_ASYNC_QUEUE=true; install the webhook-service dependencies or disable queue mode."
            ) from exc
        _AIO_PIKA = aio_pika_module
    return _AIO_PIKA


def _require_rabbitmq_url(context: str) -> str:
    if not RABBITMQ_URL:
        raise RuntimeError(f"RABBITMQ_URL is required for {context}")
    return RABBITMQ_URL


def queue_enabled() -> bool:
    return os.getenv("WEBHOOK_ASYNC_QUEUE", "false").lower() == "true"


async def publish_webhook_job(payload: dict) -> None:
    rabbitmq_url = _require_rabbitmq_url("webhook queue publishing")
    aio_pika = _get_aio_pika()
    conn = await aio_pika.connect_robust(rabbitmq_url)
    try:
        ch = await conn.channel()
        await ch.declare_queue(QUEUE_NAME, durable=True)
        body = json.dumps(payload).encode("utf-8")
        await ch.default_exchange.publish(
            aio_pika.Message(body=body, content_type="application/json", delivery_mode=2),
            routing_key=QUEUE_NAME,
        )
    finally:
        await conn.close()


async def consume_webhook_jobs(handler: Callable[[dict], Awaitable[None]]) -> None:
    rabbitmq_url = _require_rabbitmq_url("webhook worker")
    aio_pika = _get_aio_pika()
    conn = await aio_pika.connect_robust(rabbitmq_url)
    ch = await conn.channel()
    queue = await ch.declare_queue(QUEUE_NAME, durable=True)
    dlq = await ch.declare_queue(DLQ_NAME, durable=True)
    async with queue.iterator() as q:
        async for message in q:
            payload = json.loads(message.body.decode("utf-8"))
            retries = int(message.headers.get("x-retry-count", 0)) if message.headers else 0
            try:
                await handler(payload)
                await message.ack()
            except Exception as exc:
                if retries < MAX_RETRIES:
                    headers = dict(message.headers or {})
                    headers["x-retry-count"] = retries + 1
                    await ch.default_exchange.publish(
                        aio_pika.Message(
                            body=message.body,
                            content_type="application/json",
                            delivery_mode=2,
                            headers=headers,
                        ),
                        routing_key=QUEUE_NAME,
                    )
                else:
                    await ch.default_exchange.publish(
                        aio_pika.Message(
                            body=json.dumps(
                                {
                                    "error": str(exc),
                                    "original": payload,
                                }
                            ).encode("utf-8"),
                            content_type="application/json",
                            delivery_mode=2,
                        ),
                        routing_key=dlq.name,
                    )
                await message.ack()

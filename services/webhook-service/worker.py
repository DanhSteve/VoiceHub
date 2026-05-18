import asyncio
import logging
from dotenv import load_dotenv

from src.dispatcher import dispatch_domain_event
from src.utils.webhook_queue import consume_webhook_jobs

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


async def _handle(payload: dict):
    domain = payload.get("domain")
    body = payload.get("data") or {}
    await dispatch_domain_event(domain, body)


async def main():
    logger.info("[webhook-delivery-worker] consuming queue ...")
    await consume_webhook_jobs(_handle)


if __name__ == "__main__":
    asyncio.run(main())

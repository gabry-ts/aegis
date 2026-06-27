"""Event bus that fans out audit events to live SSE subscribers.

Two interchangeable implementations sharing one interface:

  * InMemoryBus (default): a set of per-subscriber asyncio.Queue objects, fed
    cross-thread from the worker threadpool via loop.call_soon_threadsafe.
  * RedisBus: publishes/consumes a redis pub/sub channel so multiple AEGIS
    processes (or replicas) share a single live feed.

Degrade gracefully: RedisBus is only selected when REDIS_URL is configured and
both `redis` and `redis.asyncio` import cleanly. Any failure falls back to the
in-memory bus so the app keeps running fully offline with nothing configured.

publish() is SYNC-callable from FastAPI worker threads; subscribe() is an async
generator consumed by the SSE endpoint. subscribe() yields None as a keepalive
sentinel roughly every 15s of silence so the endpoint can emit an SSE comment
and keep the connection (and any proxies) alive.
"""

import asyncio
import json

from .. import config

# Channel name shared by every AEGIS process when Redis is the backend.
_CHANNEL = "aegis:events"
# Idle period after which subscribe() yields a keepalive sentinel.
_KEEPALIVE_SECONDS = 15.0


class InMemoryBus:
    """Single-process bus backed by per-subscriber asyncio queues."""

    def __init__(self):
        self._subscribers = set()
        self._loop = None

    def set_loop(self, loop):
        """Capture the running asyncio loop used for cross-thread delivery."""
        self._loop = loop

    def publish(self, event):
        """Deliver an event to every current subscriber.

        Safe to call from a worker thread: the actual queue mutation is
        scheduled onto the captured loop via call_soon_threadsafe. No-op when
        no loop has been captured yet (nothing can be listening anyway).
        """
        loop = self._loop
        if loop is None:
            return
        for queue in tuple(self._subscribers):
            try:
                loop.call_soon_threadsafe(queue.put_nowait, event)
            except RuntimeError:
                # Loop is closing/closed; drop silently.
                pass

    async def subscribe(self):
        """Yield events for one subscriber; yield None on idle keepalive."""
        queue = asyncio.Queue()
        self._subscribers.add(queue)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), _KEEPALIVE_SECONDS)
                    yield event
                except asyncio.TimeoutError:
                    yield None
        finally:
            self._subscribers.discard(queue)


class RedisBus:
    """Multi-process bus backed by a redis pub/sub channel."""

    def __init__(self, redis_sync, redis_async, url):
        self._redis_sync = redis_sync
        self._redis_async = redis_async
        self._url = url
        # Lazily-created sync client reused across publish() calls.
        self._publisher = None

    def set_loop(self, loop):
        """No-op: Redis delivery does not need the asyncio loop."""

    def publish(self, event):
        """Publish a JSON-encoded event to the shared channel (sync)."""
        try:
            if self._publisher is None:
                self._publisher = self._redis_sync.Redis.from_url(self._url)
            self._publisher.publish(_CHANNEL, json.dumps(event, ensure_ascii=False))
        except Exception:
            # A transient Redis outage must never break a guardrail decision.
            self._publisher = None

    async def subscribe(self):
        """Yield events from the channel; yield None on idle keepalive."""
        client = self._redis_async.Redis.from_url(self._url)
        pubsub = client.pubsub()
        try:
            await pubsub.subscribe(_CHANNEL)
            while True:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=_KEEPALIVE_SECONDS,
                )
                if message is None:
                    yield None
                    continue
                data = message.get("data")
                if data is None:
                    continue
                if isinstance(data, (bytes, bytearray)):
                    data = data.decode("utf-8")
                try:
                    yield json.loads(data)
                except (ValueError, TypeError):
                    continue
        finally:
            try:
                await pubsub.unsubscribe(_CHANNEL)
                await pubsub.aclose()
            except Exception:
                pass
            try:
                await client.aclose()
            except Exception:
                pass


def make_bus():
    """Pick RedisBus when configured and importable, else InMemoryBus."""
    if config.use_redis():
        try:
            import redis
            import redis.asyncio as redis_async

            return RedisBus(redis, redis_async, config.REDIS_URL)
        except Exception:
            # Missing/broken redis lib must not be fatal: fall back to memory.
            pass
    return InMemoryBus()


# Module-level singleton shared by the API layer.
bus = make_bus()

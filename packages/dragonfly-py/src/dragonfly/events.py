"""Messaging: events (publish, and `listener` kinds whose @consumer methods receive each message) and the Redis
cache. Without a Kafka connection, publish() delivers to the listeners of this process (development, tests); with
one, the events go through its topics. The connections come from the configuration."""

from __future__ import annotations

import inspect
import json
import typing
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from .app import connection, connections
from .config import Kafka, Redis

__all__ = ["consumer", "publish", "consume", "cache_get", "cache_set", "Listener"]

_listeners: list[Listener] = []


class Listener:
    """A `listener` kind: each method with @consumer("topic") receives the messages of that topic. An instance
    receives the events of this process from the moment it exists."""

    def __new__(cls, *args: Any, **kwargs: Any) -> Listener:
        self = super().__new__(cls)
        _listeners.append(self)
        return self


def _handlers(listener: object) -> dict[str, Callable[..., Any]]:
    out: dict[str, Callable[..., Any]] = {}
    for name in dir(type(listener)):
        topic = getattr(getattr(type(listener), name, None), "__dragonfly_topic__", None)
        if topic:
            out[topic] = getattr(listener, name)
    return out


def consumer[F: Callable[..., Any]](topic: str) -> Callable[[F], F]:
    def mark(fn: F) -> F:
        fn.__dragonfly_topic__ = topic  # type: ignore[attr-defined]
        return fn

    return mark


def _encode(value: Any) -> bytes:
    if isinstance(value, BaseModel):
        return value.model_dump_json().encode()
    return json.dumps(value, default=str).encode()


async def publish(topic: str, value: Any, connection_name: str = "default") -> None:
    """Sends `value` (a model, a dict, a text) to the topic: the Kafka connection, or the listeners of this process."""
    kafka = next((c for c in connections() if isinstance(c, Kafka) and c.name == connection_name), None)
    if kafka is None:
        raw = _encode(value)
        for listener in _listeners:
            handler = _handlers(listener).get(topic)
            if handler is not None:
                await deliver(handler, raw)
        return
    await kafka.producer.send_and_wait(topic, _encode(value))


async def consume(listener: object) -> None:
    """Calls the @consumer methods of `listener` with every message of their Kafka topics (runs until cancelled);
    nothing to do without a Kafka connection (the events of the process reach the listener by themselves)."""
    from aiokafka import AIOKafkaConsumer

    handlers = _handlers(listener)
    if not handlers or not any(isinstance(c, Kafka) for c in connections()):
        return
    kafka = connection(Kafka)
    # a topic nobody published to yet does not exist: create the ones this listener consumes
    from aiokafka.admin import AIOKafkaAdminClient, NewTopic
    from aiokafka.errors import TopicAlreadyExistsError

    admin = AIOKafkaAdminClient(bootstrap_servers=kafka.servers)
    await admin.start()
    try:
        existing = set(await admin.list_topics())
        missing = [NewTopic(t, num_partitions=1, replication_factor=1) for t in handlers if t not in existing]
        if missing:
            try:
                await admin.create_topics(missing)
            except TopicAlreadyExistsError:
                pass
    finally:
        await admin.close()
    client = AIOKafkaConsumer(*handlers, bootstrap_servers=kafka.servers, group_id=kafka.group)
    await client.start()
    try:
        async for msg in client:
            await deliver(handlers[msg.topic], msg.value)
    finally:
        await client.stop()


async def deliver(handler: Callable[..., Any], raw: bytes) -> None:
    """One message to its handler: parsed as the type of its parameter (a pydantic model, or JSON)."""
    hints = typing.get_type_hints(handler)
    params = [p for p in inspect.signature(handler).parameters if p != "return"]
    kind = hints.get(params[0]) if params else None
    if isinstance(kind, type) and issubclass(kind, BaseModel):
        value: Any = kind.model_validate_json(raw)
    else:
        value = json.loads(raw)
    out = handler(value)
    if inspect.isawaitable(out):
        await out


async def cache_get(key: str, connection_name: str = "default") -> Any:
    """The JSON value cached under `key`, or None."""
    raw = await connection(Redis, connection_name).client.get(key)
    return None if raw is None else json.loads(raw)


async def cache_set(key: str, value: Any, seconds: int | None = None, connection_name: str = "default") -> None:
    """Caches `value` as JSON under `key`, for `seconds` (None: forever)."""
    await connection(Redis, connection_name).client.set(key, _encode(value), ex=seconds)

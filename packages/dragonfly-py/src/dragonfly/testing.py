"""Helpers for the tests of an app: an in-memory database, fake models, an HTTP client."""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import Any, cast

import httpx
from fastapi import FastAPI

from .inject import inject, reset
from .app import start, stop
from .config import AppConfig, ChatModel, Connection, Database, SQLite

__all__ = ["FakeModel", "memory_database", "running", "client"]


def _fake_class() -> type:
    from langchain_core.language_models.fake_chat_models import GenericFakeChatModel

    class _Fake(GenericFakeChatModel):
        def bind_tools(self, tools: Any, **kwargs: Any) -> Any:
            # the answers are fixed, but each tool must be describable to a real model (its JSON schema)
            from langchain_core.utils.function_calling import convert_to_openai_tool

            for t in tools:
                convert_to_openai_tool(t)
            return self

    return _Fake


class FakeModel(ChatModel):
    """A chat model that answers `answers` in order (no network), for tests of agents and graphs."""

    def __init__(self, answers: list[str], name: str = "default") -> None:
        super().__init__(model="fake", name=name)
        self.answers = answers

    async def open(self) -> None:
        from langchain_core.messages import AIMessage

        self.client = _fake_class()(messages=iter([AIMessage(content=a) for a in self.answers]))


def memory_database() -> SQLite:
    """A fresh SQLite database in memory, with the tables of every entity."""
    return SQLite(":memory:", create_tables=True)


def _family(c: Connection) -> type:
    """The class right under Connection: Database for Postgres, ChatModel for OpenAI."""
    mro = type(c).__mro__
    return mro[mro.index(Connection) - 1]


def _swap(config: AppConfig, replace: tuple[Connection, ...]) -> AppConfig:
    """`config` with each database in memory and the connections of `replace` instead of those of their type and name."""
    out: list[Connection] = []
    for c in config.connections:
        same = next((r for r in replace if isinstance(r, _family(c)) and r.name == c.name), None)
        if same is None and isinstance(c, Database):
            same = SQLite(":memory:", name=c.name, create_tables=True)
        out.append(same or c)
    out += [r for r in replace if r not in out]
    swapped = AppConfig()
    swapped.connections = out
    return swapped


@asynccontextmanager
async def running(
    config: AppConfig, *replace: Connection, listeners: Sequence[type] = (), entities: Sequence[type] = ()
) -> AsyncIterator[None]:
    """The app's connections open for a test: databases in memory, `replace` (FakeModel([...])) swapped in, and the
    `listeners` of the project created, so a published event reaches them. `entities`: the project's tables, listed so
    every one is imported before the relations between them are resolved."""
    del entities
    reset()
    await start(_swap(config, replace))
    for l in listeners:
        inject(cast(type[Any], l))
    try:
        yield
    finally:
        await stop()


@asynccontextmanager
async def client(app: FastAPI, config: AppConfig, *replace: Connection) -> AsyncIterator[httpx.AsyncClient]:
    """An HTTP client of `app` with the connections of `config` (as in `running`)."""
    async with running(config, *replace):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
            yield c

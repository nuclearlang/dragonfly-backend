"""The app: opens the connections of the configuration, mounts the controllers and starts the listeners."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import AppConfig, ComponentConfig, Connection
from .inject import inject
from .web import router_of

__all__ = ["create_app", "connection", "connections"]

_open: list[Connection] = []


def connections() -> list[Connection]:
    """The open connections."""
    return list(_open)


def connection[C: Connection](kind: type[C], name: str = "default") -> C:
    """The open connection of that type and name: connection(Database), connection(Redis, "cache")."""
    for c in _open:
        if isinstance(c, kind) and c.name == name:
            return c
    for c in _open:
        if isinstance(c, kind) and name == "default":
            return c
    raise LookupError(f"no {kind.__name__} connection named '{name}' in the configuration")


def create_app(
    config: AppConfig,
    components: Sequence[type[ComponentConfig]] = (),
    controllers: Sequence[type] = (),
    listeners: Sequence[type] = (),
    title: str = "app",
    entities: Sequence[type] = (),
) -> FastAPI:
    """The FastAPI app of the project (main.py calls it with every declaration). `entities`: the project's tables,
    listed so every one is imported before the relations between them are resolved."""
    del entities

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await start(config, components)
        from .events import consume

        # a listener receives the events of this process once it exists; `consume` adds Kafka when it is configured
        tasks = [asyncio.create_task(consume(inject(cast(type[Any], l)))) for l in listeners]
        try:
            yield
        finally:
            for t in tasks:
                t.cancel()
            await stop()

    app = FastAPI(title=title, lifespan=lifespan)
    # what `python -m dragonfly.migrate` reads to find the database
    app.state.dragonfly_config = config
    app.state.dragonfly_components = components

    @app.exception_handler(RequestValidationError)
    async def invalid(_: Request, e: RequestValidationError) -> JSONResponse:
        # the platform's answer to an invalid body or parameter: 400 with the reasons (FastAPI's default is 422)
        return JSONResponse(status_code=400, content={"detail": jsonable_encoder(e.errors())})

    for c in controllers:
        app.include_router(router_of(inject(cast(type[Any], c))))
    _serve_contract(app)
    return app


def _serve_contract(app: FastAPI) -> None:
    """GET /.nuclear/contract.json and /.nuclear/openapi.json: what the transpiler wrote next to the app (ADR-0098),
    so a client project (`contracts(name = "https://...")`) and the editors' HTTP tools read the API as built."""
    for name in ("contract", "openapi"):
        path = Path(".nuclear") / f"{name}.json"
        if not path.is_file():
            continue

        def read(p: Path = path) -> JSONResponse:
            return JSONResponse(content=json.loads(p.read_text()))

        app.add_api_route(f"/.nuclear/{name}.json", read, methods=["GET"], include_in_schema=False)


async def start(config: AppConfig, components: Sequence[type[ComponentConfig]] = ()) -> None:
    """Opens every connection (also used by tests and scripts without HTTP)."""
    for c in [*config.connections, *(c for comp in components for c in comp.connections)]:
        await c.open()
        _open.append(c)


async def stop() -> None:
    for c in reversed(_open):
        await c.close()
    _open.clear()

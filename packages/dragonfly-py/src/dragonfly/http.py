"""HTTP repositories (ADR-0103): a repository whose methods carry `@get`, `@post`, `@put`, `@patch` or `@delete` and no
body calls an `Http(baseUrl)` connection, with the mobile platform's words. `:name` in a path takes the parameter of
that name; the other parameters go to the query (GET, DELETE) or to the JSON body (POST, PUT, PATCH: a single model
parameter is the body itself). An answer is validated against the method's declared type; an error status is the
`Err` of a `Result` (404 `NotFound`, 400/422 `Invalid`, 401 `Unauthorized`, 403 `Forbidden`, 409 `Conflict`)."""

from __future__ import annotations

import re
from typing import Any

import httpx
from pydantic import BaseModel, TypeAdapter

from .config import Connection
from .errors import AppError, Conflict, Forbidden, Invalid, NotFound, Unauthorized
from .result import Err, Ok, Result

_ERRORS: dict[int, type[AppError]] = {400: Invalid, 401: Unauthorized, 403: Forbidden, 404: NotFound, 409: Conflict, 422: Invalid}


class Http(Connection):
    """An HTTP API the app calls: `base_url`, the headers every request sends and the timeout in seconds."""

    def __init__(self, base_url: str, name: str = "default", headers: dict[str, str] | None = None, timeout: float = 10.0) -> None:
        self.base_url = base_url
        self.name = name
        self.headers = headers or {}
        self.timeout = timeout
        self.client: httpx.AsyncClient | None = None

    async def open(self) -> None:
        self.client = httpx.AsyncClient(base_url=self.base_url, headers=self.headers, timeout=self.timeout)

    async def close(self) -> None:
        if self.client is not None:
            await self.client.aclose()
            self.client = None


def _plain(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [_plain(v) for v in value]  # pyright: ignore[reportUnknownVariableType]
    return value


def join(base: str, path: str) -> str:
    """`character` under `id/:id` → `character/:id`: the repository's path, then the method's (no doubled slashes)."""
    parts = [p.strip("/") for p in (base, path) if p and p.strip("/")]
    return "/".join(parts)


def split(path: str, method: str, params: dict[str, Any]) -> tuple[str, dict[str, Any], Any]:
    """The URL path with its `:name` parameters put in, the query and the JSON body."""
    used: set[str] = set()

    def put(m: re.Match[str]) -> str:
        used.add(m.group(1))
        return str(params[m.group(1)])

    url = re.sub(r":(\w+)", put, path)
    rest = {k: _plain(v) for k, v in params.items() if k not in used and v is not None}
    if method in ("GET", "DELETE"):
        return url, rest, None
    models = [v for k, v in params.items() if k not in used and isinstance(v, BaseModel)]
    body = models[0].model_dump(mode="json") if len(models) == 1 and len(rest) == 1 else rest
    return url, {}, body or None


class HttpRepository:
    """The base of an HTTP repository: `path` is `@repository(path = "...")`, `connection_name` its connection."""

    path: str = ""
    connection_name: str = "default"

    def http(self) -> httpx.AsyncClient:
        from .app import connection

        client = connection(Http, self.connection_name).client
        if client is None:
            raise RuntimeError(f"the Http connection '{self.connection_name}' is not open (is it in the app's connections?)")
        return client

    async def send(self, method: str, path: str, params: dict[str, Any], decode: Any = None) -> Result[AppError, Any]:
        url, query, body = split(join(self.path, path), method, params)
        try:
            r = await self.http().request(method, url, params=query or None, json=body)
        except httpx.HTTPError as e:
            return Err(AppError(f"{method} {url}: {e}", 503))
        if r.status_code >= 400:
            try:
                message = str(r.json().get("error") or r.json().get("message") or r.text)
            except ValueError:
                message = r.text or r.reason_phrase
            error = _ERRORS.get(r.status_code)
            return Err(error(message) if error else AppError(message, r.status_code))
        if decode is None or r.status_code == 204 or not r.content:
            return Ok(None)
        return Ok(TypeAdapter(decode).validate_python(r.json()))

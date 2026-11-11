"""Controllers: REST endpoints over FastAPI, declared like NestJS (@controller, @get, @post...).

An endpoint that returns `Result[E, T]` answers T with its status, or the error's `status` with its message.
An entity in the body or the answer is read and written through its pydantic schema (orm.schema_of).
"""

from __future__ import annotations

import functools
import inspect
import typing
from collections.abc import Callable
from typing import Any, get_args, get_origin

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, create_model

from .errors import AppError
from .orm import Entity, schema_of
from .repository import Page
from .result import Result

__all__ = ["controller", "get", "post", "put", "patch", "delete", "status", "router_of"]


def _segment(path: str) -> str:
    """Routes are segments without a leading slash (`"tasks"`, `"{id}"`): the slash is added here; `""` stays empty."""
    path = path.strip("/")
    return f"/{path}" if path else ""


def controller[C: type](prefix: str = "", tags: list[str] | None = None) -> Callable[[C], C]:
    """@controller("characters"): the routes of the class start with the prefix."""

    def mark(cls: C) -> C:
        cls.__dragonfly_prefix__ = _segment(prefix)  # type: ignore[attr-defined]
        cls.__dragonfly_tags__ = tags or [prefix.strip("/").split("/")[0] or cls.__name__]  # type: ignore[attr-defined]
        return cls

    return mark


def _route(method: str, path: str, status: int | None) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    def mark(fn: Callable[..., Any]) -> Callable[..., Any]:
        fn.__dragonfly_route__ = (method, _segment(path), status)  # type: ignore[attr-defined]
        return fn

    return mark


def get(path: str = "", status: int | None = None) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    return _route("GET", path, status)


def post(path: str = "", status: int | None = 201) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    return _route("POST", path, status)


def put(path: str = "", status: int | None = None) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    return _route("PUT", path, status)


def patch(path: str = "", status: int | None = None) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    return _route("PATCH", path, status)


def delete(path: str = "", status: int | None = None) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    return _route("DELETE", path, status)


def status(code: int) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """@status(201): the status of a successful answer (the platform's; @post answers 201 by itself)."""

    def mark(fn: Callable[..., Any]) -> Callable[..., Any]:
        fn.__dragonfly_status__ = code  # type: ignore[attr-defined]
        return fn

    return mark


def _answer_type(t: Any) -> Any:
    """The type of the answer: T of Result[E, T]; an entity becomes its schema."""
    if get_origin(t) is Result or (isinstance(t, type) and issubclass(t, Result)):
        args = get_args(t)
        t = args[1] if len(args) == 2 else Any
    if get_origin(t) is list and get_args(t) and _is_entity(get_args(t)[0]):
        return list[schema_of(get_args(t)[0])]  # type: ignore[misc]
    if get_origin(t) is Page and get_args(t):
        return _page_schema(_answer_type(get_args(t)[0]))
    return schema_of(t) if _is_entity(t) else t


_pages: dict[Any, type[BaseModel]] = {}


def _page_schema(item: Any) -> type[BaseModel]:
    """The pydantic model of a Page of `item` (what the answer of a paged route looks like)."""
    if item not in _pages:
        name = f"Page{getattr(item, '__name__', 'Item')}"
        items: Any = list[item]  # pyright: ignore[reportInvalidTypeForm]
        _pages[item] = create_model(name, items=(items, ...), page=(int, ...), size=(int, ...), total=(int, ...), pages=(int, ...))
    return _pages[item]


def _is_entity(t: Any) -> bool:
    return isinstance(t, type) and issubclass(t, Entity)


def _out(value: Any) -> Any:
    if isinstance(value, Entity):
        # only the loaded relations are read (an unloaded one is left out, never fetched)
        return schema_of(type(value)).model_validate(value.to_dict())
    if isinstance(value, Page):
        p = typing.cast(Page[Any], value)
        items = [_out(i) for i in p.items]
        return {"items": items, "page": p.page, "size": p.size, "total": p.total, "pages": p.pages}
    if isinstance(value, list):
        return [_out(v) for v in typing.cast(list[Any], value)]
    return value


def _endpoint(fn: Callable[..., Any]) -> Callable[..., Any]:
    """The bound method as FastAPI sees it: real types (not strings), entities as schemas, Result unwrapped."""
    hints = typing.get_type_hints(fn)
    sig = inspect.signature(fn)
    entities: dict[str, type[Entity]] = {}
    params = []
    for p in sig.parameters.values():
        t = hints.get(p.name, p.annotation)
        if _is_entity(t):
            entities[p.name] = t
            t = schema_of(t, create=True)
        params.append(p.replace(annotation=t))

    @functools.wraps(fn)
    async def call(**kwargs: Any) -> Any:
        for name, cls in entities.items():
            kwargs[name] = cls(**kwargs[name].model_dump())
        value = fn(**kwargs)
        if inspect.isawaitable(value):
            value = await value
        if isinstance(value, Result):
            r = typing.cast(Result[Any, Any], value)
            if r.is_err:
                e = r.error
                status = e.status if isinstance(e, AppError) else 500
                raise HTTPException(status, getattr(e, "message", str(e)))
            value = r.value
        return _out(value)

    call.__signature__ = sig.replace(parameters=params, return_annotation=_answer_type(hints.get("return")))  # type: ignore[attr-defined]
    return call


def router_of(instance: object) -> APIRouter:
    """The FastAPI router of a controller instance."""
    cls = type(instance)
    router = APIRouter(prefix=getattr(cls, "__dragonfly_prefix__", ""), tags=getattr(cls, "__dragonfly_tags__", None))
    for name in dir(cls):
        route = getattr(getattr(cls, name, None), "__dragonfly_route__", None)
        if route is None:
            continue
        method, path, route_status = route
        status = getattr(getattr(cls, name, None), "__dragonfly_status__", None) or route_status
        endpoint = _endpoint(getattr(instance, name))
        kw: dict[str, Any] = {"status_code": status} if status else {}
        router.add_api_route(path, endpoint, methods=[method], name=f"{cls.__name__}.{name}", **kw)
    return router

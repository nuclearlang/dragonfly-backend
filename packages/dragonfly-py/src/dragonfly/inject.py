"""The injector: one instance per class, built with its constructor's dependencies (resolved by type)."""

from __future__ import annotations

import inspect
import typing
from typing import Any, cast

_instances: dict[type, object] = {}
_bindings: dict[type, type] = {}


def inject[T](cls: type[T]) -> T:
    """The instance of `cls` (created on first use, with its dependencies injected)."""
    found = _instances.get(cls)
    if found is None:
        target = _bindings.get(cls, cls)
        found = _instances.get(target) or _build(target)
        _instances[cls] = found
    return cast(T, found)


def provide[T](cls: type[T], instance: T) -> None:
    """Uses `instance` wherever `cls` is injected (configuration objects, test doubles)."""
    _instances[cls] = instance


def bind(cls: type, implementation: type) -> None:
    """Injects `implementation` where `cls` is asked for (an interface and its class)."""
    _bindings[cls] = implementation


def reset() -> None:
    """Forgets every instance (tests)."""
    _instances.clear()
    _bindings.clear()


def _build(cls: type) -> object:
    init = cls.__init__
    if init is object.__init__:
        return cls()
    try:
        hints = typing.get_type_hints(init)
    except Exception:
        hints = {}
    args: dict[str, Any] = {}
    for name, p in inspect.signature(init).parameters.items():
        if name == "self" or p.kind in (p.VAR_POSITIONAL, p.VAR_KEYWORD):
            continue
        dep = hints.get(name)
        if isinstance(dep, type) and dep.__module__ not in ("builtins", "typing"):
            args[name] = inject(dep)
        elif p.default is p.empty:
            raise TypeError(f"{cls.__name__}: cannot inject parameter '{name}' ({dep})")
    return cls(**args)

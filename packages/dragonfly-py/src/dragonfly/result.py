from __future__ import annotations

from collections.abc import Callable
from typing import Generic, Never, TypeVar, cast

_E = TypeVar("_E", covariant=True)
_T = TypeVar("_T", covariant=True)
_F = TypeVar("_F")
_U = TypeVar("_U")


class Result(Generic[_E, _T]):
    """An operation that fails with an error _E (Err) or succeeds with a value _T (Ok)."""

    __slots__ = ("is_ok", "_value", "_error")

    def __init__(self, is_ok: bool, value: _T | None = None, error: _E | None = None) -> None:
        self.is_ok = is_ok
        self._value = value
        self._error = error

    def __repr__(self) -> str:
        return f"Ok({self._value!r})" if self.is_ok else f"Err({self._error!r})"

    @property
    def is_err(self) -> bool:
        return not self.is_ok

    @property
    def value(self) -> _T:
        if not self.is_ok:
            raise ValueError("Err has no value")
        return cast(_T, self._value)

    @property
    def error(self) -> _E:
        if self.is_ok:
            raise ValueError("Ok has no error")
        return cast(_E, self._error)

    def and_then(self, f: Callable[[_T], Result[_F, _U]]) -> Result[_E | _F, _U]:
        return f(self.value) if self.is_ok else Result[_E | _F, _U](False, None, self._error)

    def or_else(self, f: Callable[[_E], Result[_F, _U]]) -> Result[_F, _T | _U]:
        return Result[_F, _T | _U](True, self._value) if self.is_ok else f(self.error)

    def map(self, f: Callable[[_T], _U]) -> Result[_E, _U]:
        return Result[_E, _U](True, f(self.value)) if self.is_ok else Result[_E, _U](False, None, self._error)

    def get_or_else(self, f: Callable[[_E], _U]) -> _T | _U:
        return self.value if self.is_ok else f(self.error)

    def inspect(self, f: Callable[[_T], object]) -> Result[_E, _T]:
        if self.is_ok:
            f(self.value)
        return self

    def inspect_err(self, f: Callable[[_E], object]) -> Result[_E, _T]:
        if not self.is_ok:
            f(self.error)
        return self


def Ok(value: _U) -> Result[Never, _U]:
    return Result[Never, _U](True, value)


def Err(error: _F) -> Result[_F, Never]:
    return Result[_F, Never](False, None, error)

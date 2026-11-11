"""The errors of a use case: each one is an HTTP status when a controller returns it."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AppError:
    """A failure the caller can handle. `status` is the HTTP status a controller answers with."""

    message: str = "error"
    status: int = 500


@dataclass(frozen=True)
class Invalid(AppError):
    message: str = "invalid"
    status: int = 400


@dataclass(frozen=True)
class Unauthorized(AppError):
    message: str = "unauthorized"
    status: int = 401


@dataclass(frozen=True)
class Forbidden(AppError):
    message: str = "forbidden"
    status: int = 403


@dataclass(frozen=True)
class NotFound(AppError):
    message: str = "not found"
    status: int = 404


@dataclass(frozen=True)
class Conflict(AppError):
    message: str = "conflict"
    status: int = 409

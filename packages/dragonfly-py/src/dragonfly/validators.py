"""Checks of the rule decorators of a model (@email, @url): pydantic runs them after the type."""

from __future__ import annotations

import re

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URL = re.compile(r"^https?://[^\s/$.?#].[^\s]*$", re.IGNORECASE)


def is_email(value: str | None) -> str | None:
    """The value, if it is an e-mail address (None passes: the field is optional)."""
    if value is not None and not _EMAIL.match(value):
        raise ValueError("must be an e-mail address")
    return value


def is_url(value: str | None) -> str | None:
    """The value, if it is an http(s) URL (None passes: the field is optional)."""
    if value is not None and not _URL.match(value):
        raise ValueError("must be a URL")
    return value

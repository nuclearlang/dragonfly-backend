from __future__ import annotations

from pydantic import BaseModel


class ReviewState(BaseModel):
    """The state of the review graph."""

    question: str = ""
    answer: str = ""
    verdict: str = ""

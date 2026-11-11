from __future__ import annotations

from dragonfly import Entity, Mapped, column, primary


class Character(Entity):
    """A character of the show (table characters)."""

    __tablename__ = "characters"

    id: Mapped[int] = primary(generated=True)
    name: Mapped[str] = column(length=100, unique=True)
    status: Mapped[str] = column(length=20, default="alive")
    species: Mapped[str | None] = column(nullable=True)

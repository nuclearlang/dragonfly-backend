from __future__ import annotations

from app.components.characters.data.entities.character import Character
from dragonfly import AppError, Repository, Result
from typing import Awaitable


class CharacterRepository(Repository[Character]):
    """The characters table: find, findAll, save and remove come with the kind."""

    def by_name(self, name: str) -> Awaitable[Result[AppError, Character]]:
        q = self.query()
        q.where({"name": name})
        return q.get_one()

    def alive(self, max: int = 20) -> Awaitable[list[Character]]:
        q = self.query()
        q.where({"status": "alive"})
        q.order_by("name")
        q.limit(max)
        return q.get_many()

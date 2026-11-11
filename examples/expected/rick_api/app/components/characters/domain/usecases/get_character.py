from __future__ import annotations

from app.components.characters.data.entities.character import Character
from app.components.characters.data.repositories.character_repository import CharacterRepository
from dragonfly import AppError, Result


class GetCharacter:
    def __init__(self, characters: CharacterRepository) -> None:
        self.characters = characters

    async def exec(self, id: int) -> Result[AppError, Character]:
        return await self.characters.find(id)

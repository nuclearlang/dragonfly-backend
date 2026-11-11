from __future__ import annotations

from app.components.characters.data.entities.character import Character
from app.components.characters.data.repositories.character_repository import CharacterRepository
from dragonfly import AppError, Ok, Result


class AliveCharacters:
    def __init__(self, characters: CharacterRepository) -> None:
        self.characters = characters

    async def exec(self) -> Result[AppError, list[Character]]:
        return Ok(await self.characters.alive())

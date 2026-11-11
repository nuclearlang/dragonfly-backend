from __future__ import annotations

from app.components.characters.data.entities.character import Character
from app.components.characters.domain.models.new_character import NewCharacter
from app.components.characters.domain.usecases.alive_characters import AliveCharacters
from app.components.characters.domain.usecases.create_character import CreateCharacter
from app.components.characters.domain.usecases.get_character import GetCharacter
from dragonfly import AppError, Result, inject


class CharactersAppComponent:
    """What other components and the API see of characters."""

    async def character(self, id: int) -> Result[AppError, Character]:
        return await inject(GetCharacter).exec(id)

    async def create(self, input: NewCharacter) -> Result[AppError, Character]:
        return await inject(CreateCharacter).exec(input)

    async def alive(self) -> Result[AppError, list[Character]]:
        return await inject(AliveCharacters).exec()

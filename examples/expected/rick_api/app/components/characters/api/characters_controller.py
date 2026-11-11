from __future__ import annotations

from app.components.characters.characters_appcomponent import CharactersAppComponent
from app.components.characters.data.entities.character import Character
from app.components.characters.domain.models.new_character import NewCharacter
from dragonfly import AppError, Result, controller, get, post


@controller("characters")
class CharactersController:
    def __init__(self, characters: CharactersAppComponent) -> None:
        self.characters = characters

    @get()
    async def alive(self) -> Result[AppError, list[Character]]:
        return await self.characters.alive()

    @get("{id}")
    async def one(self, id: int) -> Result[AppError, Character]:
        return await self.characters.character(id)

    @post()
    async def create(self, input: NewCharacter) -> Result[AppError, Character]:
        return await self.characters.create(input)

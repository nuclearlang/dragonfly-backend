from __future__ import annotations

from app.components.characters.data.entities.character import Character
from app.components.characters.data.repositories.character_repository import CharacterRepository
from app.components.characters.domain.models.new_character import NewCharacter
from dragonfly import AppError, Conflict, Err, Ok, Result


class CreateCharacter:
    """Creates a character; the name must be new."""

    def __init__(self, characters: CharacterRepository) -> None:
        self.characters = characters

    async def exec(self, input: NewCharacter) -> Result[AppError, Character]:
        taken = await self.characters.where({"name": input.name}).exists()
        if taken:
            return Err(Conflict(f"{input.name} already exists"))
        saved = await self.characters.save(Character(name=input.name, status=input.status, species=input.species))
        return Ok(saved)

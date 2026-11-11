from __future__ import annotations

from app.components.characters.data.repositories.character_repository import CharacterRepository
from dragonfly.ai import Tools


class CharacterTools(Tools):
    def __init__(self, characters: CharacterRepository) -> None:
        self.characters = characters

    async def status(self, name: str) -> str:
        """Tells whether a character of the show is alive, by its name."""
        by_name_result = await self.characters.by_name(name)
        if by_name_result.is_ok:
            return f"{by_name_result.value.name} is {by_name_result.value.status}"
        else:
            return f"nobody is called {name}"

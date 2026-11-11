from __future__ import annotations

from app.components.characters.characters_appcomponent import CharactersAppComponent
from app.components.characters.domain.models.new_character import NewCharacter
from dragonfly import inject


class TestCharacters:
    async def test_creates_and_finds(self) -> None:
        "creates a character and finds it"
        app = inject(CharactersAppComponent)
        made = await app.create(NewCharacter(name="Rick"))
        assert made.is_ok
        found = await app.character(made.value.id)
        assert found.value.name == "Rick"

    async def test_repeated_name(self) -> None:
        "a repeated name is a conflict"
        app = inject(CharactersAppComponent)
        await app.create(NewCharacter(name="Morty"))
        again = await app.create(NewCharacter(name="Morty"))
        assert again.is_err
        assert again.error.status == 409

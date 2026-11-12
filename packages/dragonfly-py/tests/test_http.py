"""HTTP repositories (ADR-0103): paths, query and body, the answer validated by its type, an error status as Err."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI
from pydantic import BaseModel

from dragonfly import Http, HttpRepository, NotFound
from dragonfly.http import join, split


class Character(BaseModel):
    id: int
    name: str


class NewCharacter(BaseModel):
    name: str


api = FastAPI()


@api.get("/api/character/{id}")
async def one(id: int) -> dict[str, object]:
    if id == 404:
        from fastapi import HTTPException

        raise HTTPException(404, "Character not found")
    return {"id": id, "name": "Rick"}


@api.get("/api/character")
async def page(page: int = 1) -> list[dict[str, object]]:
    return [{"id": page, "name": "Morty"}]


@api.post("/api/character")
async def add(c: NewCharacter) -> dict[str, object]:
    return {"id": 7, "name": c.name}


class Characters(HttpRepository):
    path = "character"


def test_paths_query_and_body_are_split():
    assert join("character", ":id") == "character/:id" and join("/character/", "") == "character"
    assert split("character/:id", "GET", {"id": 3, "page": 2}) == ("character/3", {"page": 2}, None)
    assert split("character", "POST", {"c": NewCharacter(name="Summer")}) == ("character", {}, {"name": "Summer"})


@pytest.mark.asyncio
async def test_a_repository_calls_the_api_and_answers_its_type(monkeypatch: pytest.MonkeyPatch):
    http = Http("http://api.test/api")
    http.client = AsyncClient(transport=ASGITransport(app=api), base_url="http://api.test/api")
    monkeypatch.setattr(Characters, "http", lambda self: http.client)
    repo = Characters()
    one = await repo.send("GET", ":id", {"id": 1}, decode=Character)
    assert one.is_ok and one.value == Character(id=1, name="Rick")
    many = await repo.send("GET", "", {"page": 2}, decode=list[Character])
    assert many.value == [Character(id=2, name="Morty")]
    made = await repo.send("POST", "", {"c": NewCharacter(name="Summer")}, decode=Character)
    assert made.value.name == "Summer"
    missing = await repo.send("GET", ":id", {"id": 404}, decode=Character)
    assert missing.is_err and isinstance(missing.error, NotFound) and "not found" in missing.error.message
    await http.client.aclose()

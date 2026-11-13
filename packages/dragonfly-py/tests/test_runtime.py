from __future__ import annotations

from typing import TypedDict

from dragonfly import (
    AppConfig, AppError, Entity, Mapped, Ok, Repository, Result, SQLite, column, controller, create_app,
    get, gt, inject, one_of, post, primary,
)
from dragonfly.ai import Agent, Graph, Messages, Tools, next, start, text_of
from dragonfly.testing import FakeModel, client, memory_database


class Hero(Entity):
    __tablename__ = "heroes"
    id: Mapped[int] = primary(generated=True)
    name: Mapped[str] = column(length=50)
    power: Mapped[int] = column(default=1)


class HeroRepository(Repository[Hero]):
    def strong(self, minimum: int):
        q = self.query()
        q.where({"power": gt(minimum)})
        q.order_by("name")
        return q.get_many()


@controller("/heroes")
class HeroController:
    def __init__(self, repo: HeroRepository) -> None:
        self.repo = repo

    @post("")
    async def create(self, hero: Hero) -> Hero:
        return await self.repo.save(hero)

    @get("/{id}")
    async def one(self, id: int) -> Result[AppError, Hero]:
        return await self.repo.find(id)

    @get("/strong/{minimum}")
    async def strong(self, minimum: int) -> list[Hero]:
        return await self.repo.strong(minimum)

    @get("/total")
    async def total(self) -> int:
        return await self.repo.count()


class Config(AppConfig):
    connections = [SQLite("unused.db")]


async def test_crud_query_and_controller() -> None:
    app = create_app(Config(), controllers=[HeroController])
    async with client(app, Config(), memory_database()) as http:
        a = await http.post("/heroes", json={"name": "Rick", "power": 9})
        assert a.status_code == 201, a.text
        await http.post("/heroes", json={"name": "Morty", "power": 2})
        assert (await http.get(f"/heroes/{a.json()['id']}")).json()["name"] == "Rick"
        assert (await http.get("/heroes/99")).status_code == 404
        assert [h["name"] for h in (await http.get("/heroes/strong/1")).json()] == ["Morty", "Rick"]
        # a fixed segment wins over `{id}`, though its method comes after `one`
        assert (await http.get("/heroes/total")).json() == 2
        repo = inject(HeroRepository)
        assert await repo.where({"name": "Rick"}).count() == 1
        one = await repo.where(name="Morty").get_one()
        assert one.is_ok and one.value.power == 2
        assert (await repo.where(name="Nobody").get_one()).is_err
        assert await repo.where({"name": one_of(["Rick", "Morty"])}).count() == 2


class WeatherTools(Tools):
    def weather(self, city: str) -> str:
        """The weather of a city."""
        return self.describe([city])

    def describe(self, cities: list[Hero]) -> str:  # a helper: no doc comment, so not a tool
        return f"sunny in {cities[0]}"


class Helper(Agent):
    prompt = "Be brief."

    def __init__(self, tools: WeatherTools) -> None:
        self.tools_ = tools


async def test_agent_and_graph_with_a_fake_model() -> None:
    app = create_app(Config())
    async with client(app, Config(), memory_database(), FakeModel(["hello there"])):
        assert [t.name for t in WeatherTools().tools()] == ["weather"]
        assert await inject(Helper).ask("hi") == "hello there"

    class State(TypedDict):
        messages: Messages
        steps: int

    class Flow(Graph[State]):
        state = State

        @start
        @next("second")
        def first(self, s: State) -> dict[str, int]:
            return {"steps": s["steps"] + 1}

        @next("end")
        def second(self, s: State) -> dict[str, int]:
            return {"steps": s["steps"] * 10}

    out = await Flow().run({"messages": [], "steps": 1})
    assert out["steps"] == 20
    assert text_of(Ok("x").value) == "x"

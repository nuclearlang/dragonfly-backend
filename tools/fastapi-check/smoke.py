"""End-to-end check of a built fastapi project (examples/examples-fastapi/rick_api): the REST API over an
in-memory database, the agent with its tools and the graph, with a fake chat model (no network).
Run from the build folder: python smoke.py"""

import asyncio

from app.components.characters.ai.review import Review
from app.config.project_config import ProjectConfig
from app.main import app
from dragonfly import inject
from dragonfly.testing import FakeModel, client


async def main() -> None:
    async with client(app, ProjectConfig(), FakeModel(["Rick is alive", "Morty is alive"])) as http:
        made = await http.post("/characters", json={"name": "Rick", "species": "Human"})
        assert made.status_code == 201, made.text
        rick = made.json()
        assert rick["name"] == "Rick" and rick["status"] == "alive" and rick["id"] == 1, rick
        assert (await http.post("/characters", json={"name": "Rick"})).status_code == 409
        assert (await http.post("/characters", json={"name": ""})).status_code == 400
        assert (await http.get("/characters/1")).json()["species"] == "Human"
        assert (await http.get("/characters/7")).status_code == 404
        assert [c["name"] for c in (await http.get("/characters")).json()] == ["Rick"]
        answer = await http.post("/guide/ask", json={"text": "Is Rick alive?"})
        assert answer.json() == {"text": "Rick is alive"}, answer.text
        tools = [t.name for t in inject(Review).guide.tools.tools()]
        assert tools == ["status"], tools
        assert await inject(Review).guide.tools.status("Rick") == "Rick is alive"
        state = await inject(Review).run({"question": "And Morty?", "answer": "", "verdict": ""})
        assert state["verdict"] == "answered" and state["answer"] == "Morty is alive", state
        schema = (await http.get("/openapi.json")).json()
        assert "/characters/{id}" in schema["paths"], schema["paths"].keys()
    print("smoke: REST API, agent, tools and graph ok")


asyncio.run(main())

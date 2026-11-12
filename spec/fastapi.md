# Dialect `fastapi` (→ `fastapi`): the `backend` platform in Python

> The Python dialect of the [backend platform](backend.md) (ADR-0093), extending [python.md](https://github.com/nuclearlang/nuclear/blob/main/spec/python.md). The
> platform's rules, kinds and Nuclear are in `backend.md`; this document holds only how this dialect writes them:
> REST controllers on **FastAPI**, repositories over tables with **SQLAlchemy 2 async**, **pydantic** models, and
> **LangChain / LangGraph** tools, agents and graphs. Files: `dialects/backend/fastapi/` (renamed `fastapi` in phase B1,
> `STATUS.md`); runtime: `packages/dragonfly-py` (import name `dragonfly`).

## 1. Project

A folder with `config.nuc` (`dragonfly(platform = "backend", dialect = "fastapi")`, [backend.md](backend.md) §1);
`nuclear build .` writes `build/` (the Python package `app/`, `tests/` from the platform's `test/`, `pyproject.toml`
with the `app(...)` name, version and description). Run it with
`uvicorn app.main:app` from `build/`; test it with `pytest`.

```
rick_api/
├── config.nuc                         dragonfly(platform = "backend", dialect = "fastapi"), app(...), plugins(...)
├── config/project_config.nuc          appConfig: the connections of the app
├── components/characters/
│   ├── characters_appcomponent.nuc    appcomponent: what the rest of the app sees
│   ├── config/characters_config.nuc   config: connections only this component uses
│   ├── data/entities/*.nuc            entities (tables), by folder
│   ├── data/repositories/*.nuc        repository
│   ├── domain/models/*.nuc            pydantic models, by folder
│   ├── domain/usecases/*.nuc          usecase
│   ├── api/*.nuc                      controller
│   ├── ai/*.nuc                       tools, agent, graph; ai/states/ = state by folder
│   └── events/*.nuc                   listener
├── shared/entities, shared/models     the same kinds, visible to every component
└── test/*_test.nuc                    tests (pytest, written to tests/), by folder
```

Generated once per project: `app/main.py` (the FastAPI `app`: config, component configs, controllers, listeners),
`tests/conftest.py` (each test with the connections open, databases in memory) and `pyproject.toml`.

**Architecture** (N0301, N0302): a use case is called only by its `appcomponent`; a repository by use cases,
aggregates and tools; a service by use cases and aggregates. Another component sees only the `appcomponent`,
models, entities, tools, agents, states and graphs.

**Libraries** (one per need, the most used): FastAPI (HTTP), pydantic (validation), SQLAlchemy 2 async with asyncpg /
aiomysql / aiosqlite (SQL), redis.asyncio (cache), aiokafka (Kafka), LangChain `init_chat_model` /
`init_embeddings` (OpenAI and Ollama behind one API), LangGraph (graphs, checkpoints), Chroma (vectors). Their type
definitions come with the dialect: `nuclear defs search <text> --dialect fastapi`.

### Plugins (`config.nuc`)

The optional parts are plugins ([projects.md](https://github.com/nuclearlang/nuclear/blob/main/spec/projects.md) §3.3): `plugins(sqlite = true, postgres = true, mysql =
true, redis = true, kafka = true, ai = true, openai = true, ollama = true, chroma = true)`. Only the enabled ones go to
`pyproject.toml`, and the runtime imports them only then (`dragonfly.ai`, `dragonfly.events`). A kind or a name of a
plugin not enabled is N0304: `tools`, `agent`, `state`, `graph` need `ai`; `listener` needs `kafka`; `Redis` needs
`redis`.

## 2. Kinds

### 2.1 Entity

A table. In `components/<c>/data/entities/` the kind is given by the folder; elsewhere write `entity`. `@entity("table")` names the table (default: the name in snake_case). Each field is a column: `@primary(generated = true)` (a key the database gives: auto increment for an `int`, a uuid for a `string`), `@primary()` (a key the app gives), `@column(length = 100, unique = true, index = true, nullable = true, name = "x")`, `@created()`, `@updated()`; without a decorator it is a column too. Its SQL type comes from the field type; `name?: T` is nullable; a default goes to the column.

```nuclear
@entity("characters")
entity Character()
  @primary(generated = true)
  id: int
  @column(length = 100, unique = true)
  name: string
  @column(length = 20)
  status: string = "alive"
  species?: string
```

```python
from __future__ import annotations

from dragonfly import Entity, Mapped, column, primary


class Character(Entity):
    __tablename__ = "characters"

    id: Mapped[int] = primary(generated=True)
    name: Mapped[str] = column(length=100, unique=True)
    status: Mapped[str] = column(length=20, default="alive")
    species: Mapped[str | None] = column(nullable=True)
```

#### Relations (ADR-0100)

TypeORM's decorators; the related entity is the field's type. `@manyToOne x?: T` keeps its column in the field `xId`
(its own field, set without loading the row); `@oneToMany(inverse)` is the other side; `@manyToMany(inverse)` with
`@joinTable()` on one side makes the table `<table>_<field>` (columns `<entity>_id`); `@oneToOne` with `@joinColumn()`
on the side that keeps `xId`. `onDelete`: `"cascade"`, `"set null"`, `"restrict"`. A relation field is optional and
loaded only when a query asks for it (`relations("tasks")`); an unloaded one is absent from the JSON answer. N0308 when
a rule is not met. Setting a relation (`Task(projectId = id)`, `task.tags = [a, b]`) and saving writes it.

```nuclear
@entity("projects")
entity Project()
  @primary(generated = true)
  id: int
  name: string
  @oneToMany(inverse = "project")
  tasks?: Task[]

@entity("tasks")
entity Task()
  @primary(generated = true)
  id: int
  title: string
  @manyToOne(inverse = "tasks", onDelete = "cascade")
  project?: Project
  projectId?: int
  @manyToMany(inverse = "tasks")
  @joinTable()
  tags?: Tag[]

@entity("tags")
entity Tag()
  @primary(generated = true)
  id: int
  label: string
  @manyToMany(inverse = "tags")
  tasks?: Task[]
```

```python
from __future__ import annotations

from dragonfly import Entity, Mapped, column, many_to_many, many_to_one, one_to_many, primary


class Project(Entity):
    __tablename__ = "projects"

    id: Mapped[int] = primary(generated=True)
    name: Mapped[str] = column()
    tasks: Mapped[list[Task]] = one_to_many("Task", "project")


class Task(Entity):
    __tablename__ = "tasks"

    id: Mapped[int] = primary(generated=True)
    title: Mapped[str] = column()
    project: Mapped[Project | None] = many_to_one("Task", "project_id", "projects.id", inverse="tasks", on_delete="cascade")
    project_id: Mapped[int | None] = column(nullable=True)
    tags: Mapped[list[Tag]] = many_to_many("Task", "tags", "Tag", inverse="tasks", join=True)


class Tag(Entity):
    __tablename__ = "tags"

    id: Mapped[int] = primary(generated=True)
    label: Mapped[str] = column()
    tasks: Mapped[list[Task]] = many_to_many("Tag", "tasks", "Task", inverse="tags")
```

### 2.2 Repository

The data of one entity: `NameRepository` works on `Name` (or `@repository(Entity)`). It brings `find(id)` (`Ok(entity)` / `Err(NotFound)`), `findAll()`, `save(entity)` and `remove(id)`. Each method's lines build ONE query, created for that call (`q`): `where({...})` (equality, or `gt`, `gte`, `lt`, `lte`, `ne`, `like`, `ilike`, `oneOf`, `isNull`, `between`), `orderBy(field, desc = true)`, `limit(n)`, `offset(n)`, `relations("tasks", "tasks.tags")` (the relations to load); the last line runs it: `getOne()` (`Result`), `getMany()`, `paginate(page, size)` (`Page<T>`: `items`, `page` from 1, `size`, `total`, `pages`), `count()`, `exists()`, `update({...})`, `delete()`. The caller awaits it: `~characters.byName(name)`.

```nuclear
repository CharacterRepository
  byName(name: string) Result<Error, Character>
    where({ "name": name })
    getOne()

  aliveSince(year: int, max: int = 20) Character[]
    where({ "status": "alive", "year": gte(year) })
    orderBy("name")
    limit(max)
    getMany()
```

```python
from __future__ import annotations

from dragonfly import AppError, Repository, Result, gte
from typing import Awaitable


class CharacterRepository(Repository[Character]):
    def by_name(self, name: str) -> Awaitable[Result[AppError, Character]]:
        q = self.query()
        q.where({"name": name})
        return q.get_one()

    def alive_since(self, year: int, max: int = 20) -> Awaitable[list[Character]]:
        q = self.query()
        q.where({"status": "alive", "year": gte(year)})
        q.order_by("name")
        q.limit(max)
        return q.get_many()
```

A page and a relation:

```nuclear
repository ProjectRepository
  withTasks(id: int) Result<Error, Project>
    where({ "id": id })
    relations("tasks.tags")
    getOne()

repository TaskRepository
  page(page: int, size: int = 20) Page<Task>
    orderBy("id")
    paginate(page, size)
```

```python
from __future__ import annotations

from dragonfly import AppError, Page, Repository, Result
from typing import Awaitable


class ProjectRepository(Repository[Project]):
    def with_tasks(self, id: int) -> Awaitable[Result[AppError, Project]]:
        q = self.query()
        q.where({"id": id})
        q.relations("tasks.tags")
        return q.get_one()


class TaskRepository(Repository[Task]):
    def page(self, page: int, size: int = 20) -> Awaitable[Page[Task]]:
        q = self.query()
        q.order_by("id")
        return q.paginate(page, size)
```

An HTTP repository (another API, ADR-0103; spec/backend.md §2.2): an `HttpRepository` that sends each call through
the `Http` connection (httpx) and validates the answer against the declared type (pydantic):

```nuclear
@repository(path = "character")
repository CharacterRepository
  @get(path = ":id")
  one(id: int) Result<Error, Character>
```

```python
from __future__ import annotations

from dragonfly import AppError, HttpRepository, Result


class CharacterRepository(HttpRepository):
    path = "character"

    async def one(self, id: int) -> Result[AppError, Character]:
        return await self.send("GET", ":id", { "id": id }, Character)
```

### 2.3 Model

What the API reads and answers: a pydantic model (in `domain/models/` by folder). The same rule decorators as the nestjs dialect and Dragonfly's forms become pydantic constraints: `@required`, `@minLength(n)`, `@maxLength(n)`, `@min(n)`, `@max(n)`, `@pattern(r"...")`, `@email`, `@url`. An invalid body is a 422.

```nuclear
model NewCharacter
  @minLength(1)
  @maxLength(100)
  name: string
  status: string = "alive"
  @email
  contact?: string
```

```python
from __future__ import annotations

from annotated_types import MaxLen, MinLen
from dragonfly.validators import is_email
from pydantic import AfterValidator, BaseModel
from typing import Annotated


class NewCharacter(BaseModel):
    name: Annotated[str, MinLen(1), MaxLen(100)]
    status: str = "alive"
    contact: Annotated[str | None, AfterValidator(is_email)] = None
```

### 2.4 Use case

One business operation: its dependencies are injected by type; `exec` returns `Result<E, T>`. `Error` is `AppError`; the runtime has `NotFound` (404), `Invalid` (400), `Unauthorized` (401), `Forbidden` (403) and `Conflict` (409).

```nuclear
model NewCharacter
  name: string
  status: string = "alive"

entity Character()
  @primary(generated = true)
  id: int
  name: string
  status: string

usecase CreateCharacter(characters: CharacterRepository)
  exec(input: NewCharacter) Result<Error, Character>
    taken = ~characters.where({ "name": input.name }).exists()
    if taken
      return Err(Conflict("${input.name} already exists"))
    Ok(~characters.save(Character(name = input.name, status = input.status)))
```

```python
from __future__ import annotations

from dragonfly import AppError, Conflict, Entity, Err, Mapped, Ok, Result, column, primary
from pydantic import BaseModel


class NewCharacter(BaseModel):
    name: str
    status: str = "alive"


class Character(Entity):
    __tablename__ = "character"

    id: Mapped[int] = primary(generated=True)
    name: Mapped[str] = column()
    status: Mapped[str] = column()


class CreateCharacter:
    def __init__(self, characters: CharacterRepository) -> None:
        self.characters = characters

    async def exec(self, input: NewCharacter) -> Result[AppError, Character]:
        taken = await self.characters.where({"name": input.name}).exists()
        if taken:
            return Err(Conflict(f"{input.name} already exists"))
        return Ok(await self.characters.save(Character(name=input.name, status=input.status)))
```

`@transactional` on `exec`: every repository call inside shares one transaction of the default database; an `Err`
or an error rolls it back, an `Ok` commits it.

```nuclear
usecase CloseProject(tasks: TaskRepository, projects: ProjectRepository)
  @transactional
  exec(id: int, into: int) Result<Error, int>
    ~projects.find(into)
    moved = ~tasks.where({ "projectId": id }).update({ "projectId": into })
    ~projects.remove(id)
    Ok(moved)
```

```python
from __future__ import annotations

from dragonfly import AppError, Ok, Result, transactional


class CloseProject:
    def __init__(self, tasks: TaskRepository, projects: ProjectRepository) -> None:
        self.tasks = tasks
        self.projects = projects

    @transactional
    async def exec(self, id: int, into: int) -> Result[AppError, int]:
        await self.projects.find(into)
        moved = await self.tasks.where({"projectId": id}).update({"projectId": into})
        await self.projects.remove(id)
        return Ok(moved)
```

### 2.5 Appcomponent

The facade of a component: aliases to the use cases. Other components and the controllers use only this.

```nuclear
appcomponent CharactersAppComponent
  character() = GetCharacter.exec
  create() = CreateCharacter.exec
```

```python
from __future__ import annotations


class CharactersAppComponent:
    def character(self):
        return GetCharacter.exec

    def create(self):
        return CreateCharacter.exec
```

### 2.6 Controller

REST routes over FastAPI, like NestJS: `@controller("path")` and `@get`, `@post` (201), `@put`, `@patch`, `@delete` with the route of the platform (`"{id}"`: a path parameter; segments without a leading slash: the runtime's decorators add it). A parameter that is a model is the JSON body; an entity is read and answered through its pydantic schema. A `Result` answers its value, or the error's status and message; an invalid body or parameter answers 400 with the reasons.

```nuclear
@controller("characters")
controller CharactersController(characters: CharactersAppComponent)
  @get("{id}")
  one(id: int) Result<Error, Character>
    ~characters.character(id)

  @post()
  create(input: NewCharacter) Result<Error, Character>
    ~characters.create(input)
```

```python
from __future__ import annotations

from dragonfly import AppError, Result, controller, get, post


@controller("characters")
class CharactersController:
    def __init__(self, characters: CharactersAppComponent) -> None:
        self.characters = characters

    @get("{id}")
    async def one(self, id: int) -> Result[AppError, Character]:
        return await self.characters.character(id)

    @post()
    async def create(self, input: NewCharacter) -> Result[AppError, Character]:
        return await self.characters.create(input)
```

### 2.7 Configuration

The connections of the app (`appConfig`, `config/project_config.nuc`) and of a component (`config`): opened at start and closed at stop. Databases: `Postgres`, `MySQL`, `SQLite` (`url` picks the async driver, `createTables = true` creates the tables); `Redis`; `Kafka(servers, group)`; models: `OpenAI(model)`, `Ollama(model, baseUrl)`, `Embeddings(model)`; `Chroma(collection, embeddings, path)`. Each has a `name` (default `"default"`). `env("VAR", "default")` reads the environment.

```nuclear
appConfig ProjectConfig
  connections: Connection[] = [
    Postgres(url = env("DATABASE_URL", "postgres://localhost/rick")),
    Redis(url = env("REDIS_URL", "redis://localhost:6379/0")),
    Kafka(servers = env("KAFKA", "localhost:9092"), group = "rick"),
    OpenAI(model = "gpt-4o-mini"),
  ]
```

```python
from __future__ import annotations

from dragonfly import AppConfig, Connection, Kafka, OpenAI, Postgres, Redis, env


class ProjectConfig(AppConfig):
    connections: list[Connection] = [
        Postgres(url=env("DATABASE_URL", "postgres://localhost/rick")),
        Redis(url=env("REDIS_URL", "redis://localhost:6379/0")),
        Kafka(servers=env("KAFKA", "localhost:9092"), group="rick"),
        OpenAI(model="gpt-4o-mini"),
    ]
```

### 2.8 Tools

Each public method with a doc comment is a LangChain tool, and the doc comment is the description the model reads; a method without one is a helper of the others (never offered to the model). A tool can use the component's repositories.

```nuclear
tools CharacterTools(characters: CharacterRepository)
  // Tells whether a character of the show is alive, by its name.
  status(name: string) string
    match ~characters.byName(name)
      Ok(c) -> "${c.name} is ${c.status}"
      Err(_) -> "nobody is called ${name}"
```

```python
from __future__ import annotations

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
```

### 2.9 Agent

A model with tools and a system prompt (LangChain `create_agent`, with memory per thread). Its tools are the `tools` it receives; `model` names the chat model connection. `~guide.ask(text, thread = "user-1")` answers; `stream(text)` gives the answer piece by piece.

```nuclear
agent Guide(tools: CharacterTools)
  model: string = "default"
  prompt: string = "You answer questions about the characters. Use the tools."
```

```python
from __future__ import annotations

from dragonfly.ai import Agent


class Guide(Agent):
    model: str = "default"
    prompt: str = "You answer questions about the characters. Use the tools."

    def __init__(self, tools: CharacterTools) -> None:
        self.tools = tools
```

### 2.10 State and graph

A LangGraph `StateGraph`: `state` is its state, a pydantic model, so a node reads `state.field`; a field without a default gets its type's empty value (`""`, `0`, `[]`, `None` for `T?`), so a graph can start from a partial state; `messages: Messages` keeps a conversation. Each method of the `graph` is a node that receives the state and returns what changes; `@start` marks the first one and `@next("node")` the one after it (`"end"` ends). A node can also return `Command(goto = "node", update = {...})` to choose at run time. `~review.run(state, thread)` runs it.

```nuclear
state ReviewState
  question: string
  answer: string

@state(ReviewState)
graph Review(guide: Guide)
  @start
  @next("end")
  ask(state: ReviewState) <string, string>
    { "answer": ~guide.ask(state.question) }
```

```python
from __future__ import annotations

from dragonfly.ai import Graph, next, start
from pydantic import BaseModel


class ReviewState(BaseModel):
    question: str = ""
    answer: str = ""


class Review(Graph[ReviewState]):
    state = ReviewState

    def __init__(self, guide: Guide) -> None:
        self.guide = guide

    @start
    @next("end")
    async def ask(self, state: ReviewState) -> dict[str, str]:
        return {"answer": await self.guide.ask(state.question)}
```

### 2.11 Listener

A Kafka consumer: each `@consumer("topic")` method receives the messages of the topic, parsed as the type of its parameter (a model). `~publish("topic", value)` sends one. The Redis cache: `~cacheGet(key)`, `~cacheSet(key, value, seconds = 60)`.

```nuclear
listener CharacterEvents(characters: CharactersAppComponent)
  @consumer("characters.created")
  created(input: NewCharacter) void
    ~characters.create(input)
```

```python
from __future__ import annotations

from dragonfly.events import Listener, consumer


class CharacterEvents(Listener):
    def __init__(self, characters: CharactersAppComponent) -> None:
        self.characters = characters

    @consumer("characters.created")
    async def created(self, input: NewCharacter) -> None:
        await self.characters.create(input)
```

### 2.12 Tests

In `test/*_test.nuc` (written to `tests/`, pytest's folder): `tests Name` + `@test("what it checks")` methods → a pytest class. Every test runs with the project's connections, the databases in memory and the project's listeners created (`tests/conftest.py`); `inject<X>()` gives the instances. `expect(condition)` is `assert`. `dragonfly.testing.FakeModel([...])` answers fixed texts.

```nuclear
tests Characters
  @test("an unknown id is not found")
  unknownId() void
    app = inject<CharactersAppComponent>()
    missing = ~app.character(99)
    expect(missing.isErr)
    expect(missing.error.status == 404)
```

```python
from __future__ import annotations

from dragonfly import inject


class TestCharacters:
    async def test_unknown_id(self) -> None:
        "an unknown id is not found"
        app = inject(CharactersAppComponent)
        missing = await app.character(99)
        assert missing.is_err
        assert missing.error.status == 404
```

### Migrations

Migrations of the database schema (ADR-0100 §5): Alembic over `migrations/` (`env.py`, `versions/`), made by
`dragonfly migrate make` against an empty SQLite at the last migration, in batch mode. The commands and the rules:
`spec/backend.md` §2.8.

## 3. What is not there yet

- `dragonfly make` generators for the backend kinds, `dragonfly check` and `watch` (the CLI has `new`, `build`,
  `install`, `run`, `test` and `migrate`).

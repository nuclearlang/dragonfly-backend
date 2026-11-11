# Dragonfly for Python: a backend with FastAPI and LangGraph

The `fastapi` dialect turns Nuclear into a Python 3.12+ backend: **FastAPI** endpoints, **SQLAlchemy 2 async**
repositories, **pydantic** models, and **LangChain / LangGraph** tools, agents and graphs. The generated code passes
`pyright --strict`. This guide walks through the example `examples/examples-fastapi/rick_api`: characters of a
show, a REST API and an agent that answers questions with a tool.

The full rules are in [fastapi.md](../../spec/fastapi.md) (the plain Python dialect: [python.md](https://github.com/nuclearlang/nuclear/blob/main/spec/python.md)).

## 1. The project

```
rick_api/
├── config.nuc                      the platform, the dialect, the app and its plugins
├── config/project_config.nuc       the connections: database, chat model
├── components/characters/
│   ├── characters_appcomponent.nuc what the rest of the app sees
│   ├── data/entities/              tables
│   ├── data/repositories/          queries
│   ├── domain/models/              pydantic models (what the API receives)
│   ├── domain/usecases/            the business rules
│   ├── api/                        controllers (FastAPI routes)
│   └── ai/                         tools, agents, graphs
└── test/                           tests in Nuclear (pytest)
```

`config.nuc` names the platform and the dialect, the app, and the plugins it uses (only those packages go to
`pyproject.toml`). Change `dialect` to `nestjs` and the same project comes out as a NestJS service:

```nuclear
dragonfly(platform = "backend", dialect = "fastapi")
app(name = "rick_api", description = "Characters of the show.", version = "0.1.0")
plugins(sqlite = true, ollama = true)
```

The connections are declared, not opened by hand:

```nuclear
appConfig ProjectConfig
  connections: Connection[] = [
    SQLite(file = env("DATABASE", "rick.sqlite"), createTables = true),
    Ollama(model = env("CHAT_MODEL", "llama3.2")),
  ]
```

Other connections: `Postgres(url = ...)`, `MySQL(url = ...)`, `MariaDB(url = ...)`, `Redis(url = ...)`, `Kafka(servers = ..., group = ...)`,
`OpenAI(model = ...)`, `Chroma(...)`, each with its plugin.

## 2. Names stay Nuclear

The `.nuc` keeps Nuclear's names (`camelCase` methods and fields). The dialect writes PEP 8 names: `getOne()` becomes
`get_one()` and `createdAt` becomes `created_at`. Strings and map keys are data and never change.

## 3. Entity and repository

```nuclear
@entity("characters")
Character()
  @primary(generated = true)
  id: int
  @column(length = 100, unique = true)
  name: string
  @column(length = 20)
  status: string = "alive"
  species?: string
```

A `repository` gets `find`, `findAll`, `save` and `remove` with the kind; queries read like TypeORM:

```nuclear
repository CharacterRepository
  byName(name: string) Result<Error, Character>
    where({ "name": name })
    getOne()
```

`getOne()` answers `Err(NotFound(...))` when nothing matches, so the caller never checks for `None`.

### Relations, pages and transactions

Relations are TypeORM's decorators; the related entity is the field's type. A relation field is optional: it is only
there when a query loads it, so no query is hidden.

```nuclear
@entity("projects")
Project()
  @primary(generated = true)
  id: int
  name: string
  @oneToMany(inverse = "project")
  tasks?: Task[]

@entity("tasks")
Task()
  @primary(generated = true)
  id: int
  title: string
  @manyToOne(inverse = "tasks", onDelete = "cascade")
  project?: Project
  projectId?: int
```

`projectId` is the column of `project`: `Task(title = "paint", projectId = id)` puts a task in a project without
loading it. `@manyToMany(inverse = "tasks")` with `@joinTable()` on one side makes the join table (`tasks_tags`);
`@oneToOne` with `@joinColumn()` is the one-to-one. The compiler checks every rule (N0308).

```nuclear
repository ProjectRepository
  withTasks(id: int) Result<Error, Project>
    where({ "id": id })
    relations("tasks")
    getOne()

repository TaskRepository
  page(page: int, size: int = 20) Page<Task>
    orderBy("id")
    paginate(page, size)
```

`paginate` answers `Page<Task>`: `items`, `page` (from 1), `size`, `total`, `pages`. A use case whose writes must
happen together is `@transactional`: an `Err` (or an error) undoes them all.

```nuclear
usecase CloseProject(tasks: TaskRepository, projects: ProjectRepository)
  @transactional
  exec(id: int, into: int) Result<Error, Moved>
    ~projects.find(into)
    moved = ~tasks.move(id, into)
    ~projects.remove(id)
    Ok(Moved(count = moved))
```

The same Nuclear builds with the other backend dialect, and `paginate` works the same on the mobile local tables.

### Migrations

`createTables = true` makes the tables at start, for development. Once the database keeps data, leave it out and change
the schema with migrations in the project's `migrations/` folder:

```sh
dragonfly migrate make "notes on tasks"   # what the entities changed since the last migration
dragonfly migrate                         # applies the pending ones
dragonfly migrate down                    # reverts the last one
```

They are Alembic migrations (`migrations/versions/*.py`, `alembic_version` in the database), written in batch mode so
SQLite runs them too. A renamed column shows as a drop and an add (`make` warns): edit the file into a rename to keep the data.

## 4. Use cases, models and the API

Models of `domain/models/` are pydantic models with validation decorators (`@minLength`, `@max`, `@email`...). Use
cases hold the rules and answer a `Result`. A `controller` exposes them, NestJS style:

```nuclear
@controller("characters")
controller CharactersController(characters: CharactersAppComponent)
  @get()
  alive() Result<Error, Character[]>
    ~characters.alive()

  @get("{id}")
  one(id: int) Result<Error, Character>
    ~characters.character(id)

  @post()
  create(input: NewCharacter) Result<Error, Character>
    ~characters.create(input)
```

```python
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
    # ...
```

An `Err(NotFound(...))` becomes a 404, `Conflict` a 409, and an invalid body a 400, with no code in the controller.

## 5. AI: tools, agents and graphs (plugin `ai`)

A method of `tools` with a doc comment is a tool the model can call (the comment is its description, the parameters
its schema); a method without one is a helper:

```nuclear
tools CharacterTools(characters: CharacterRepository)
  // Tells whether a character of the show is alive, by its name.
  status(name: string) string
    match ~characters.byName(name)
      Ok(c) -> "${c.name} is ${c.status}"
      Err(_) -> "nobody is called ${name}"
```

An `agent` is a LangChain agent with its tools and a prompt; `~guide.ask(question)` answers:

```nuclear
agent Guide(tools: CharacterTools)
  prompt: string = "You answer questions about Rick and Morty characters. Use the tools; be brief."
```

A `graph` is a LangGraph `StateGraph`: each method is a node, `@start` the first, `@next("node")` the next one:

```nuclear
@state(ReviewState)
graph Review(guide: Guide)
  @start
  @next("judge")
  ask(state: ReviewState) <string, string>
    answer = ~guide.ask(state.question)
    { "answer": answer }

  @next("end")
  judge(state: ReviewState) <string, string>
    verdict = if state.answer.length > 0
      "answered"
    else
      "empty"
    { "verdict": verdict }
```

Kafka listeners (`listener` + `@consumer("topic")`, `~publish(topic, data)`) need the plugin `kafka`.

## 6. Build, run and test

```sh
dragonfly build                    # nuclear build .: writes build/ (the package app/, tests/, pyproject.toml)
dragonfly install                  # a venv in build/ with the runtime and the app's packages
dragonfly run                      # uvicorn app.main:app --reload: http://localhost:8000/docs
dragonfly test                     # pytest: the tests written in Nuclear
```

The same by hand, from `build/`: `python -m venv .venv`, `pip install ~/.local/share/nuclearlang/packages/dragonfly-py`
(the runtime, until it is on PyPI), `pip install -e ".[test]"`, `uvicorn app.main:app --reload`, `pytest`.

In VS Code: while ▷ Serve runs, saving a `.nuc` rebuilds and uvicorn reloads; ◉ Debug (or F5 with
`build/<name>.code-workspace`) runs the server under debugpy (the Python extension) with the venv of `build/`: a
breakpoint in a `.nuc` stops there.

With Ollama: `ollama pull llama3.2` first (or set `CHAT_MODEL`). A complete project outside the repository:
`~/Documents/projects/nuc/python/nuclear_langgraph_agent` (tasks CRUD, an agent with tools and a planner graph).

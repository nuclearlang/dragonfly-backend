# Dialect `fastapi` brief: Dragonfly for Python

A backend and AI project (`nuclear.toml`, `dialect = "fastapi"`): FastAPI controllers, SQLAlchemy 2 async
repositories, pydantic models, LangChain/LangGraph tools, agents and graphs. Write only the business logic; the kinds
write the framework code. Build: `nuclear build .`; run `uvicorn app.main:app` and `pytest` in `build/`. Full rules:
`nuclear help fastapi`; one kind: `nuclear help <kind> --dialect fastapi`.

| Where (`components/<c>/`) | Kind | What it is |
|---|---|---|
| `data/entities/` | entity (by folder) | a table: `@entity("t")`, fields with `@primary(generated = true)`, `@primary()`, `@column(length = 100, unique = true)`, relations `@manyToOne` (+ `<name>Id`) `@oneToMany` `@manyToMany`+`@joinTable` `@oneToOne`+`@joinColumn` (optional fields, loaded by `relations(...)`) |
| `data/repositories/` | `repository NameRepository` | CRUD (`find`, `findAll`, `save`, `remove`) + methods whose lines build one query: `where({...})`, `orderBy`, `limit`, `relations("tasks")`, then `getOne()` / `getMany()` / `paginate(page, size)` (`Page<T>`) / `count()` / `exists()` |
| `domain/models/` | model (by folder) | pydantic: `@minLength(1) name: string`, `@email`, `@min(n)`, `@max(n)` |
| `domain/usecases/` | `usecase Name(deps)` | one `exec(...) Result<Error, T>` (`@transactional`: one transaction, an `Err` rolls it back); errors `NotFound`, `Invalid`, `Conflict`, `Forbidden`, `Unauthorized` |
| root | `appcomponent Name` | aliases `find() = GetThing.exec`: all the rest of the app sees |
| `api/` | `@controller("tasks") controller Name(deps)` | `@get("{id}")`, `@post()`... (segments, no leading slash); a `Result` answers its value or the error's status |
| `ai/` | `tools Name(deps)`, `agent Name(tools: T)`, `@state(S) graph Name` | doc comment = tool description; `prompt`, `model`; `@start`, `@next("node")` |
| `ai/states/` | state (by folder) | the graph's state (`messages: Messages`) |
| `events/` | `listener Name(deps)` | `@consumer("topic")` methods; `~publish("topic", value)` |
| `config/` | `appConfig` / `config` | `connections: Connection[] = [Postgres(url = env("DATABASE_URL", "...")), Redis(...), Kafka(...), OpenAI(model = "...")]` |
| `test/` (`*_test.nuc`) | `tests Name` | `@test("...")` methods, `inject<X>()`, `expect(cond)` |

Dependencies are constructor parameters, injected by type. Repository methods return an awaitable: callers write
`~repo.byName(name)`. Only the `appcomponent` calls use cases; only use cases, aggregates and tools call repositories.

```nuclear
repository CharacterRepository
  byName(name: string) Result<Error, Character>
    where({ "name": name })
    getOne()

usecase FindCharacter(characters: CharacterRepository)
  exec(name: string) Result<Error, Character>
    ~characters.byName(name)
```

`config.nuc` at the root enables the optional parts: `plugins(sqlite = true, ollama = true)` (sqlite, postgres, mysql, redis, kafka, ai, openai, ollama, chroma); only those
go to the project's dependencies, and using a kind or class of one not enabled is N0304 (it says which line to add).


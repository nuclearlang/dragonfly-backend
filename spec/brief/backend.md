# Platform `backend` brief: Dragonfly backends

A backend has only `.nuc` files: HTTP APIs, data, events and AI agents. You write the business logic; the kinds write
the framework code, the dependencies, the JSON, the validation and the routes. The same Nuclear builds with every
backend dialect. Full rules: `nuclear help backend`; one kind: `nuclear help <kind> --platform backend`; where each
file goes: `nuclear help layout --platform backend`.

## Work cycle

1. Read the project's `config.nuc` (`dragonfly(platform = "backend", ...)`, `app(...)`, `plugins(...)`) and the
   doc comments of the declarations you will use: they say what each one is for.
2. Write the tests first (`test/*_test.nuc`), then the pieces, one file at a time.
3. `nuclear check . --json` until `[]`, then `dragonfly test`. Never edit `build/`.

## Kinds (`components/<c>/`; the folder gives the kind of `entity`, `model` and `state`)

| Where | Kind | What it is |
|---|---|---|
| `data/entities/` | entity | a table: `@entity("t")`, fields with `@primary(generated = true)`, `@column(length = 100, unique = true)`, relations `@manyToOne` (+ `<name>Id`), `@oneToMany`, `@manyToMany` + `@joinTable`, `@oneToOne` + `@joinColumn` (optional fields, loaded by `relations(...)`) |
| `data/repositories/` | `repository NameRepository` | CRUD (`find`, `findAll`, `save`, `remove`) + methods whose lines build one query: `where({...})`, `orderBy`, `limit`, `relations("tasks")`, then `getOne()` / `getMany()` / `paginate(page, size)` (`Page<T>`) / `count()` / `exists()` |
| `domain/models/` | model | validated fields: `@minLength(1) name: string`, `@email`, `@min(n)`, `@max(n)`, `@pattern(r"...")` |
| `domain/usecases/` | `usecase Name(deps)` | one `exec(...) Result<Error, T>` (`@transactional`: one transaction, an `Err` rolls it back); errors `NotFound`, `Invalid`, `Conflict`, `Forbidden`, `Unauthorized` |
| `domain/services/` | `service Name(deps)` | rules several use cases share |
| `<c>_appcomponent.nuc` | `appcomponent Name` | only aliases, `find() = GetThing.exec`: all the rest of the app sees |
| `api/` | `@controller("tasks") controller Name(deps)` | `@get("{id}")`, `@post()`, `@status(201)`... (segments, no leading slash); a `Result` answers its value or the error's status |
| `ai/` | `tools Name(deps)`, `agent Name(tools: T)`, `@state(S) graph Name` | doc comment = tool description; `prompt`, `model`; `@start`, `@next("node")` above the node it leaves |
| `ai/states/` | state | the graph's state (`messages: Messages`) |
| `events/` | `listener Name(deps)` | `@consumer("topic")` methods; `~publish("topic", value)` |
| `config/` | `appConfig` / `config` | `connections: Connection[] = [SQLite(file = "app.sqlite"), Postgres(url = env("DATABASE_URL", "...")), Redis(...), Kafka(...), Ollama(model = "...")]` |
| `test/` | `tests Name` | `@test("...")` methods, `inject<X>()`, `expect(cond)` |

Dependencies are constructor parameters, injected by type. Repository methods are awaited: `~repo.byName(name)`.
Only the `appcomponent` calls use cases; only use cases, aggregates and tools call repositories.

```nuclear
// The characters table.
@entity("characters")
Character()
  @primary(generated = true)
  id: int
  @column(length = 80, unique = true)
  name: string

repository CharacterRepository
  byName(name: string) Result<Error, Character>
    where({ "name": name })
    getOne()

usecase FindCharacter(characters: CharacterRepository)
  exec(name: string) Result<Error, Character>
    ~characters.byName(name)

appcomponent CharactersAppComponent
  byName() = FindCharacter.exec

@controller("characters")
controller CharactersController(characters: CharactersAppComponent)
  @get("name/{name}")
  one(name: string) Result<Error, Character>
    ~characters.byName(name)
```

`config.nuc` enables the optional parts: `plugins(sqlite = true, ollama = true)` (sqlite, postgres, mysql, mariadb,
redis, kafka, events, ai, openai, ollama, chroma); a kind or class of one not enabled is N0304 (it says which line to
add).

# Dialect `nestjs` brief: Dragonfly for NestJS

A backend project (`nuclear.toml`, `dialect = "nestjs"`) on NestJS 12 (ES modules): REST controllers, Sequelize
repositories (sequelize-typescript), DTOs validated with class-validator, the Nest modules written for you. The same
kinds and query API as `fastapi`. Build: `nuclear build .`; in `build/`: `npm install`, `npm run dev`, `npm test`.
Full rules: `nuclear help nestjs`; one kind: `nuclear help <kind> --dialect nestjs`.

| Where (`components/<c>/`) | Kind | What it is |
|---|---|---|
| `data/entities/` | entity (by folder) | a table: `@entity("t")`, fields with `@primary(generated = true)`, `@primary()`, `@column(length = 100, unique = true)`, relations `@manyToOne` (+ `<name>Id`) `@oneToMany` `@manyToMany`+`@joinTable` `@oneToOne`+`@joinColumn` (optional fields, loaded by `relations(...)`), `@created()` |
| `data/repositories/` | `repository NameRepository` | CRUD (`find`, `findAll`, `save`, `remove`) + methods whose lines build one query: `where({...})`, `orderBy`, `limit`, `relations("tasks")`, then `getOne()` / `getMany()` / `paginate(page, size)` (`Page<T>`) / `count()` / `exists()` |
| `domain/models/` | model (by folder) | a DTO: `@minLength(1) title: string`, `@email`, `@min(n)`, `@max(n)`; `NewTask(title = "x")` |
| `domain/usecases/` | `usecase Name(deps)` | one `exec(...) Result<Error, T>` (`@transactional`: one transaction, an `Err` rolls it back); errors `NotFound`, `Invalid`, `Conflict`, `Forbidden`, `Unauthorized` |
| root | `appcomponent Name` | aliases `task() = GetTask.exec`: all the rest of the app sees (Nest injects the use cases) |
| `api/` | `@controller("tasks") controller Name(deps)` | `@get("{id}")`, `@post()`, `@patch("{id}")`... (segments, no leading slash); a path parameter, the body (a model) and the query are read by themselves; a `Result` answers its value or the error's status |
| `config/` | `appConfig` | `connections: Connection[] = [Postgres(url = env("DATABASE_URL", "..."))]` (`MySQL`, `MariaDB`, `SQLite(file = ...)`) |
| `test/` | `tests Name` | `@test("...")` methods, `inject<X>()`, `expect(cond)`; the databases are in memory |

Dependencies are constructor parameters (Nest injects them). Repository methods return a promise: callers write
`~repo.byTitle(title)`; `x = ~repo.find(id)` unwraps the `Ok`. `x != null` is written `x != null` (also undefined).

```nuclear
repository TaskRepository
  byTitle(title: string) Result<Error, Task>
    where({ "title": title })
    getOne()

usecase FindTask(tasks: TaskRepository)
  exec(title: string) Result<Error, Task>
    ~tasks.byTitle(title)
```

`config.nuc` at the root enables the optional parts: `plugins(sqlite = true, ollama = true)` (sqlite, postgres, mysql, mariadb, redis, kafka, events, ai, openai, ollama); only those
go to the project's dependencies, and using a kind or class of one not enabled is N0304 (it says which line to add).


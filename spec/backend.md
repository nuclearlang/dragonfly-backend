# The `backend` platform of Dragonfly

> Inherits every rule of [nuclear-base.md](https://github.com/nuclearlang/nuclear/blob/main/spec/nuclear-base.md) and the standard library ([library.md](https://github.com/nuclearlang/nuclear/blob/main/spec/library.md)).
> This document defines the backend platform (ADR-0093): HTTP APIs, data, events and AI agents, written in Nuclear
> only. The same project builds with every backend dialect — `fastapi` (Python: [fastapi.md](fastapi.md),
> renamed `fastapi` in phase B1) and `nestjs` (TypeScript: [nestjs.md](nestjs.md)) — and its Nuclear never changes
> between them. Only a use of a dialect's type definitions ties code to that dialect.

## 1. Project

A backend's build also writes its **contract** (`.nuclear/contract.json`: controllers, routes, models) and its
**OpenAPI document** (`.nuclear/openapi.json`), served by the running app at `/.nuclear/contract.json` and
`/.nuclear/openapi.json`; a mobile or web project generates its models and repositories from it
([projects.md](https://github.com/nuclearlang/nuclear/blob/main/spec/projects.md) §1.2, ADR-0098).


```
tasks_api/
├── config.nuc                         dragonfly(...), app(...), plugins(...), dependencies(...)
├── config/project_config.nuc          appConfig: the connections of the app
├── components/tasks/
│   ├── tasks_appcomponent.nuc         appcomponent: what the rest of the app sees
│   ├── config/tasks_config.nuc        config: connections only this component uses
│   ├── data/entities/*.nuc            entities (tables), by folder
│   ├── data/repositories/*.nuc        repository
│   ├── domain/models/*.nuc            models (what the API reads and answers), by folder
│   ├── domain/usecases/*.nuc          usecase; also service and aggregate
│   ├── api/*.nuc                      controller
│   ├── events/*.nuc                   listener
│   └── ai/*.nuc                       tools, agent, state, graph
├── shared/                            models, tools... used by several components
└── test/*_test.nuc                    tests
```

`config.nuc` is the only manifest ([projects.md](https://github.com/nuclearlang/nuclear/blob/main/spec/projects.md) §1): the platform and dialect, the app and the
plugins it uses, and `dependencies(name = "version")` for a package the framework does not bring (a version that starts
with `.` or `/` is a folder on disk; its type definitions go in the project's `defs/`, projects.md §3.2). `nuclear build
.` (or the `dragonfly` CLI) writes `build/`: the dialect's project, never edited.

```nuclear
dragonfly(platform = "backend", dialect = "fastapi")
app(name = "tasks_api", description = "Tasks and an assistant.", version = "0.1.0")
plugins(sqlite = true, events = true, ollama = true)
```

Kinds by folder: the file's folder gives the kind when the declaration does not name it (`data/entities/` →
entity, `data/repositories/` → repository, `domain/models/` → model, `domain/usecases/` → usecase, `api/` →
controller, `events/` → listener, `ai/` → the header word). Every kind's dependencies are the typed parameters
of its header, injected by type (ADR-0043). Names stay Nuclear's (`camelCase`): the dialect writes its own case.

**Architecture rules** (N0301, N0302): from another component only `appcomponent`, `model`, `entity`, `tools`,
`agent`, `state` and `graph` are visible. A `usecase` is called only from the facade; a `service` from a use case
or an aggregate; an `aggregate` from a use case; a `repository` from a use case, an aggregate or a `tools`.
`test/` is exempt.

### Plugins

The optional parts of the platform ([projects.md](https://github.com/nuclearlang/nuclear/blob/main/spec/projects.md) §3.3), the same list in every dialect:
`sqlite`, `postgres`, `mysql`, `mariadb`, `redis`, `kafka`, `events`, `ai`, `openai`, `ollama`, `chroma`. Only the
enabled ones reach the generated project's dependencies. A kind or a name of a plugin not enabled is N0304, with
the line to add: `tools`, `agent`, `state`, `graph` need `ai`; `listener`, `publish` need `events` (or `kafka`
for a broker); `cacheGet`, `cacheSet` need `redis`; a database connection needs its plugin.

## 2. Kinds

### 2.1 Entity

A table. `@entity("name")` names it (default: the class name in snake_case, plural not added). Fields are
columns: `@primary` (the key; `@primary(generated = true)`: the database gives it, auto increment for an `int`, a
uuid for a `string`; `@primary(length = 8)`: the app gives a code), `@column(length, unique, nullable, name)`,
`@created`, `@updated` (timestamps written by the database). `T?` is a nullable column; a default is the
column's default.

```nuclear
@entity("tasks")
Task()
  @primary(generated = true)
  id: int
  @column(length = 200)
  title: string
  done: boolean = false
  // 1 high, 2 normal, 3 low
  priority: int = 2
  @created()
  createdAt?: DateTime
```

#### Relations (ADR-0100)

Decorators on the relation field; the related entity is the field's type, never repeated:

| Decorator | On | Means |
|---|---|---|
| `@manyToOne(inverse, onDelete)` | `x?: T` + a field `xId` | this row points to one row of T by its column `xId` |
| `@oneToMany(inverse)` | `xs?: T[]` | the rows of T whose `@manyToOne` field `inverse` points here |
| `@manyToMany(inverse)` + `@joinTable()` on one side | `xs?: T[]` | through the table `<table>_<field>` (columns `<entity>_id`) |
| `@oneToOne(inverse, onDelete)` + `@joinColumn()` on one side | `x?: T` | the `@joinColumn` side keeps the column `xId` |

`onDelete`: `"cascade"`, `"set null"`, `"restrict"` (default: the database's). A relation field is optional: it is
there only when a query loads it (`relations("tasks")`, `relations("tasks.tags")`), and an unloaded one is absent from
the JSON answer, never `null` and never a hidden query. The join column is a field of its own: a row is related
without loading the other (`Task(title = t, projectId = id)`); a `@manyToMany` list set on a row is written by `save`.
These rules are checked at compile time (N0308).

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
  @manyToMany(inverse = "tasks")
  @joinTable()
  tags?: Tag[]
```

### 2.2 Repository

The data of one entity: `NameRepository` works on `Name` (or `@repository(Entity)`). It brings `find(id)`
(`Ok(entity)` / `Err(NotFound)`), `findAll()`, `save(entity)` and `remove(id)`. Each method's lines build ONE
query, created for that call: `where({...})` (equality, or `gt`, `gte`, `lt`, `lte`, `ne`, `like`, `ilike`,
`oneOf`, `isNull`, `between`), `orderBy(field, desc = true)`, `limit(n)`, `offset(n)`, `relations(...)` (the
relations to load); the last line runs it: `getOne()` (`Result`), `getMany()`, `paginate(page, size)` (`Page<T>`:
`items`, `page` from 1, `size`, `total`, `pages`; the same on the mobile local tables), `count()`, `exists()`,
`update({...})`, `delete()`. The caller awaits it:
`~tasks.byTitle(title)`. The same chain works outside the repository: `~tasks.where({ "title": t }).exists()`.

```nuclear
repository TaskRepository
  byState(done: boolean) Task[]
    where({ "done": done })
    orderBy("priority")
    getMany()

  byTitle(title: string) Result<Error, Task>
    where({ "title": title })
    getOne()

  page(page: int, size: int = 20) Page<Task>
    orderBy("id")
    paginate(page, size)
```

#### An HTTP repository (ADR-0103)

A repository can also be another API, with the mobile platform's words: `@repository(path = "...")` and methods
without a body that carry `@get`, `@post`, `@put`, `@patch` or `@delete` (`path = ":id"`). They call the `Http(baseUrl)`
connection (§2.8; `connection = "name"` picks another): `:name` in a path takes the parameter of that name, the
other parameters go to the query (GET, DELETE) or to the JSON body (POST, PUT, PATCH: a single model parameter is the
body). The answer is the method's type; an error status is the `Err` of a `Result` (404 `NotFound`, 400/422
`Invalid`, 401 `Unauthorized`, 403 `Forbidden`, 409 `Conflict`, any other an `Error` with that status).

```nuclear
@repository(path = "character")
repository CharacterRepository
  @get(path = ":id")
  one(id: int) Result<Error, Character>

  @get
  page(page: int) Result<Error, CharacterPage>
```

### 2.3 Model

What the API reads and answers, in `domain/models/`. The field decorators of Dragonfly's forms are its validation:
`@required`, `@minLength(n)`, `@maxLength(n)`, `@min(n)`, `@max(n)`, `@pattern(r"...")`, `@email`, `@url`. An
invalid body answers **400** with the reasons. `NewTask(title = "x")` builds one; optional fields (`T?`) may be
left out.

```nuclear
NewTask
  @minLength(1)
  @maxLength(200)
  title: string
  @min(1)
  @max(3)
  priority: int = 2

TaskChanges
  @minLength(1)
  title?: string
  done?: boolean
```

### 2.4 Use case

One business operation: `exec` returns `Result<E, T>`. `Error` is the platform's error, with an HTTP status:
`NotFound` (404), `Invalid` (400), `Unauthorized` (401), `Forbidden` (403), `Conflict` (409). `x = ~repo.find(id)`
unwraps the `Ok` and returns the `Err` by itself ([nuclear-base.md](https://github.com/nuclearlang/nuclear/blob/main/spec/nuclear-base.md) §3.2).

```nuclear
usecase CreateTask(tasks: TaskRepository)
  exec(input: NewTask) Result<Error, Task>
    taken = ~tasks.where({ "title": input.title }).exists()
    if taken
      return Err(Conflict("there is already a task '${input.title}'"))
    task = ~tasks.save(Task(title = input.title, priority = input.priority))
    ~publish("tasks.created", { "id": task.id, "title": task.title })
    Ok(task)
```

`@transactional` on `exec` (ADR-0100): every repository call inside shares one transaction of the default database;
an `Err` or an error rolls it back, an `Ok` commits it. A transactional call inside another joins it.

```nuclear
usecase CloseProject(tasks: TaskRepository, projects: ProjectRepository)
  @transactional
  exec(id: int, into: int) Result<Error, Moved>
    ~projects.find(into)
    moved = ~tasks.move(id, into)
    ~projects.remove(id)
    Ok(Moved(count = moved))
```

### 2.5 Appcomponent

The facade of a component: aliases to its use cases ([nuclear-base.md](https://github.com/nuclearlang/nuclear/blob/main/spec/nuclear-base.md) §4.1.2). Other
components, the controllers, the tools and the listeners use only this.

```nuclear
appcomponent TasksAppComponent
  list() = ListTasks.exec
  task() = GetTask.exec
  create() = CreateTask.exec
```

### 2.6 Service and aggregate

A `service` is logic shared by use cases (an external API, a calculation); an `aggregate` composes several
repositories or services for one use case. Both are plain classes with injected headers.

### 2.7 Controller

HTTP routes. `@controller("tasks")` is the prefix; `@get`, `@post`, `@put`, `@patch`, `@delete` take a path
relative to it: `@get()` is the prefix itself, `@get("{id}")` binds `{id}` to the parameter `id`, `@post("plan")`
adds a segment. Paths are segments: no leading slash. A parameter that is a model is the body; a parameter named
in the path is a path parameter; any other parameter is a query parameter (optional when `T?` or defaulted).
`@status(201)` changes the success status. A `Result` answer becomes the value or its error's status.

```nuclear
@controller("tasks")
controller TasksController(tasks: TasksAppComponent)
  @get()
  all(done?: boolean) Result<Error, Task[]>
    ~tasks.list(done)

  @get("{id}")
  one(id: int) Result<Error, Task>
    ~tasks.task(id)

  @post()
  create(input: NewTask) Result<Error, Task>
    ~tasks.create(input)

  @patch("{id}")
  change(id: int, changes: TaskChanges) Result<Error, Task>
    ~tasks.update(id, changes)
```

### 2.8 Configuration and connections

The connections of the app (`appConfig`, `config/project_config.nuc`) and of a component (`config`,
`components/<c>/config/`): opened at start, closed at stop, never opened by hand. Each has a `name` (default
`"default"`); `connectionName` in a kind picks another. `env("VAR", "default")` reads the environment.

| Connection | Plugin | Parameters |
|---|---|---|
| `SQLite(file)` | `sqlite` | `file` (`":memory:"` in tests), `createTables` |
| `Postgres(url)` `MySQL(url)` `MariaDB(url)` | `postgres` `mysql` `mariadb` | `url` (`"postgres://user:pass@host/db"`, `"mysql://..."`, `"mariadb://..."`: the dialect adds its driver), `createTables` (creates the entities' tables: development) |
| `Redis(url)` | `redis` | `url` |
| `Kafka(servers, group)` | `kafka` | `servers` (`"a:9092,b:9092"`), `group` |
| `Ollama(model, baseUrl)` `OpenAI(model, apiKey)` | `ollama` `openai` (both `ai`) | the chat model; `Embeddings(model)` for vectors (`"ollama:nomic-embed-text"`, `"openai:text-embedding-3-small"`) |
| `Http(baseUrl, headers, timeout)` | — | another API, for the HTTP repositories (§2.2): `baseUrl` (`"https://rickandmortyapi.com/api"`), `headers` (an API key), `timeout` (seconds) |
| `Chroma(collection, embeddings, url)` | `chroma` | a vector store on a Chroma server (`url`, default `http://localhost:8000`); `embeddings` names the `Embeddings` connection |

```nuclear
appConfig ProjectConfig
  connections: Connection[] = [
    SQLite(file = env("DATABASE", "tasks.sqlite"), createTables = true),
    Ollama(model = env("CHAT_MODEL", "qwen3.5:4b"), baseUrl = env("OLLAMA_URL", "http://localhost:11434")),
  ]
```

#### Migrations of the database (ADR-0100 §5)

`createTables` is for development and tests. A database that keeps its data changes by migrations, kept in the
project's `migrations/` folder (with the sources, not in `build/`):

```sh
dragonfly migrate make "notes on tasks"   # one migration: what the entities changed since the last migration
dragonfly migrate                         # applies the pending ones to the default database
dragonfly migrate down                    # reverts the last one applied
```

- `make` compares the entities with the last migration, never with a database; with no change it writes nothing.
- A migration is a file of the dialect's migration tool, written once and then the project's: a renamed table or
  column shows as a drop and an add (`make` warns of every drop), so edit it into a rename to keep the data.
- A field with a default (`done: boolean = false`) is also the column's SQL default, so adding it to a table with rows
  works.
- The migrations belong to the dialect they were made with, like code that uses type definitions (rule 11).
- A project with migrations leaves `createTables` out of its connection.

### 2.9 Listener, events and cache

`~publish("topic", value)` sends an event: in the process (plugin `events`) or to Kafka when a `Kafka`
connection exists (plugin `kafka`). A `listener` receives them: each `@consumer("topic")` method gets the
messages of the topic, parsed as the type of its parameter (a model or a map). The Redis cache: `~cacheGet(key)`,
`~cacheSet(key, value, seconds = 60)`.

```nuclear
listener TaskEvents
  created: string[] = []

  @consumer("tasks.created")
  onCreated(event: <string, any>) void
    created.add(event["title"])
```

### 2.10 Tools

Functions a model can call. A method with a doc comment is a tool: the comment is its description, the
parameters its schema (types and defaults), the return a `string`. A method without a comment is a helper.
`tools.tools()` lists them.

```nuclear
tools TaskTools(tasks: TasksAppComponent)
  // Creates a task with a title and a priority (1 high, 2 normal, 3 low).
  addTask(title: string, priority: int = 2) string
    match ~tasks.create(NewTask(title = title, priority = priority))
      Ok(task) -> "created task ${task.id}: ${task.title}"
      Err(e) -> e.message
```

### 2.11 Agent

A model with tools and a prompt, with memory per conversation: `~agent.ask(text, thread = "default")` answers.
Its `tools` dependencies are its tools; `model` names a chat connection (default `"default"`).

```nuclear
agent AssistantAgent(tools: TaskTools)
  prompt: string = "You are a task assistant. Use the tools to read, add and complete tasks; never invent ids."
```

### 2.12 State and graph

A `state` is the state of a graph (a model; `messages: Messages` keeps a conversation). A `graph` runs nodes over
it: each method receives the state (`state.field`) and returns what changes (a map); `@start` marks the first
node and `@next("node")` the one after it (`"end"` ends). `~chatModel()` is the chat connection; `textOf(reply)`
its text. `~planner.run(input, thread = "default")` runs it and gives the final state.

```nuclear
state PlanState
  goal: string
  titles: string[]
  created: int

@state(PlanState)
graph Planner(tasks: TasksAppComponent)
  @start
  @next("save")
  split(state: PlanState) <string, any>
    reply = ~chatModel().invoke("Split this goal into at most 5 short tasks, one per line: ${state.goal}")
    titles = textOf(reply).split("\n").map((line) => line.trim()).filter((line) => not line.isEmpty)
    { "titles": titles.take(5) }

  @next("end")
  save(state: PlanState) <string, any>
    created = 0
    for title in state.titles
      made = ~tasks.create(NewTask(title = title))
      if made.isOk
        created += 1
    { "created": created }
```

### 2.13 Generators

`dragonfly gen resource <component> <Name>` writes the finished, compiling code of a resource (ADR-0103): its models
(nested objects become models named `<Name><Key>`; a paged answer gives `<Name>Page`), the repository (`--source rest:<base url>`: an HTTP repository over `Http(baseUrl)`, the app's connection added when missing; `--source db`: an entity, a `New<Name>` model and a paged query), one use
case per action (`--actions list,get,search,create,update,delete`), their aliases in the facade, and the controller with the routes; a database resource also gets its tests. The fields
come from an example answer (`--from-json <file|url>`), a spec (`--from-spec <spec.md>`: its example answer, else its
`Key | Type` table; a `GET https://...` line gives the API) or `--fields "id:int name:string"`. A file that exists is
never overwritten (the facade gets only the missing aliases); a name another file declares stops it before it writes.
`dragonfly gen inspect` answers what the project has. The agent writes only what is not standard: a use case with
its own rules, a view's details.

```sh
dragonfly gen resource characters Character --from-json https://rickandmortyapi.com/api/character
```

### 2.14 Tests

In `test/*_test.nuc`: `tests Name` + `@test("what it checks")` methods. Every test runs with the project's
connections and the databases in memory; `inject<X>()` gives the instances; `expect(condition)` asserts;
`FakeModel(["answer"])` is a chat model with fixed answers.

```nuclear
tests Tasks
  @test("a repeated title is a conflict")
  repeatedTitle() void
    tasks = inject<TasksAppComponent>()
    ~tasks.create(NewTask(title = "call mom"))
    again = ~tasks.create(NewTask(title = "call mom"))
    expect(again.error.status == 409)
```

## 3. What the dialect decides

Only how it is written: the language, the framework, the packages, the generated project's files and how to
run it. Each dialect's spec documents that and nothing else: [fastapi.md](fastapi.md) (`fastapi`),
[nestjs.md](nestjs.md). One example project is built with every backend dialect from the same `.nuc` files
(ADR-0093 §9).

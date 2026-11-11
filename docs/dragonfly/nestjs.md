# Dragonfly for NestJS: a TypeScript backend with Sequelize

The `nestjs` dialect turns Nuclear into a **NestJS 12** backend (ES modules): **Sequelize** repositories
(`@nestjs/sequelize` + `sequelize-typescript`), DTOs validated with **class-validator**, Kafka events, Redis cache, and
**LangChain.js / LangGraph.js** tools, agents and graphs. The Nest modules are written for you. The generated code
passes `tsc --strict`. It uses the same kinds and query API as [Dragonfly for Python](python.md), so a project moves
between the two almost line by line.

This guide follows the example `examples/examples-backend/tasks_api`: a tasks CRUD, an event listener and an assistant
that reads and changes tasks. The full rules are in [nestjs.md](../../spec/nestjs.md).

## 1. The project

```
tasks_api/
├── config.nuc                      dragonfly(platform = "backend", dialect = "nestjs"), app(...), plugins(...)
├── config/project_config.nuc       the connections
├── components/tasks/               data/, domain/, api/, events/, tasks_appcomponent.nuc
├── components/assistant/           ai/ (tools, agent, graph), api/
└── test/                           tests in Nuclear (node:test)
```

```nuclear
appConfig ProjectConfig
  connections: Connection[] = [
    SQLite(file = env("DATABASE", "tasks.sqlite"), createTables = true),
    Ollama(model = env("CHAT_MODEL", "qwen3.5:4b"), baseUrl = env("OLLAMA_URL", "http://localhost:11434")),
  ]
```

Each component becomes a Nest module; the database goes to `SequelizeModule`, the other connections open at start
and close at stop.

## 2. Entity, repository, models

```nuclear
@entity("tasks")
Task()
  @primary(generated = true)
  id: int
  @column(length = 200)
  title: string
  done: boolean = false
  priority: int = 2
  @created()
  createdAt?: DateTime
```

```nuclear
repository TaskRepository
  byState(done: boolean) Task[]
    where({ "done": done })
    orderBy("priority")
    getMany()
```

The models of `domain/models/` are DTOs; their decorators become class-validator rules:

```nuclear
NewTask
  @minLength(1)
  @maxLength(200)
  title: string
  @min(1)
  @max(3)
  priority: int = 2
```

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

They are Sequelize migrations (`migrations/<time>_<name>.js` over `queryInterface`, `SequelizeMeta` in the database);
each one also keeps the schema it leaves, which the next `make` compares with. A renamed column shows as a drop and an add (`make` warns): edit the file into a rename to keep the data.

## 3. Use cases and events

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

`~publish` sends the event in the same process (plugin `events`) or to Kafka (plugin `kafka` and a `Kafka(...)`
connection). A `listener` receives it:

```nuclear
listener TaskEvents
  created: string[] = []

  @consumer("tasks.created")
  onCreated(event: <string, any>) void
    created.add(event["title"])
```

## 4. The controller

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
```

```typescript
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksAppComponent) {}

  @Get()
  async all(@Query('done', new ParseBoolPipe({ optional: true })) done?: boolean): Promise<Result<AppError, Task[]>> {
    return await this.tasks.list(done);
  }

  @Get(':id')
  async one(@Param('id', ParseIntPipe) id: number): Promise<Result<AppError, Task>> {
    return await this.tasks.task(id);
  }
  // ...
}
```

Path parameters, query parameters and the body are found from the route and the types; the pipes come out by
themselves. `Err(NotFound(...))` answers 404, `Conflict` 409, an invalid body 400.

## 5. The assistant (plugin `ai`)

```nuclear
tools TaskTools(tasks: TasksAppComponent)
  // Creates a task with a title and a priority (1 high, 2 normal, 3 low).
  addTask(title: string, priority: int = 2) string
    match ~tasks.create(NewTask(title = title, priority = priority))
      Ok(task) -> "created task ${task.id}: ${task.title}"
      Err(e) -> e.message

agent AssistantAgent(tools: TaskTools)
  prompt: string = "You are a task assistant. Use the tools to read, add and complete tasks; never invent ids."
```

A `graph` with `@state(PlanState)`, `@start` and `@next("node")` is a LangGraph.js `StateGraph`; `~chatModel()` is
the model of the config. See `components/assistant/ai/planner.nuc` in the example.

## 6. Build, run and test

```sh
dragonfly build                    # nuclear build .: writes build/ (src/, test/, package.json, tsconfig.json); compiles once installed
dragonfly install                  # npm install with the runtime (copied: build/.npmrc has install-links=true)
dragonfly run                      # npm run dev: http://localhost:3000 (PORT); restarts on every build (node --watch)
dragonfly test                     # npm test: the tests written in Nuclear
```

The same by hand, from `build/`: `npm install ~/.local/share/nuclearlang/packages/dragonfly-nest && npm install`,
`npm run dev`, `npm test`. While `dragonfly run` serves, `dragonfly build` (or saving a `.nuc` in VS Code) restarts the
server with the new code. ◉ Debug in VS Code (or F5 with `build/tasks_api.code-workspace`) runs the server under
the node debugger with its source maps: a breakpoint in a `.nuc` stops there.

```sh
curl -X POST localhost:3000/tasks -H 'content-type: application/json' -d '{"title": "buy milk"}'
curl localhost:3000/tasks?done=false
```

`install-links=true` copies the runtime into `node_modules` (a link would make Node and TypeScript look for its
NestJS packages next to the runtime, not in the app). The generated `package.json` approves the install script of `sqlite3`, the driver of
the tests (npm 12 runs only approved scripts).

# Contracts: one backend, its apps generated

A backend written in Nuclear describes its API once. Every app that calls it (mobile, web) gets the models and
the repositories **generated from that description** instead of writing them by hand, and a change in the API is
caught when the app builds, not on the phone (ADR-0098). Backend and app stay two projects, deployed apart, talking
over HTTP: what travels is a JSON description, as OpenAPI or a `.proto` file would.

## 1. The backend publishes its contract

Nothing to write. Building the backend (`nuclear build .`, `dragonfly build`, or the editor when it checks the
project) writes two files next to the project card:

| File | Holds |
|---|---|
| `.nuclear/contract.json` | the controllers and their routes (verb, path, parameters and where each goes, body, answer, error, status), the models those carry (fields, Nuclear types, defaults, JSON names, validation rules, the key field, doc comments) |
| `.nuclear/openapi.json` | the same as OpenAPI 3.1, for Swagger UI, generators or an HTTP tool |

Both are copied into `build/` and the running API serves them at `GET /.nuclear/contract.json` and
`GET /.nuclear/openapi.json`. The contract is the same whether the backend is built with `fastapi` or `nestjs`.

```nuclear
// tasks_api/components/tasks/api/tasks_controller.nuc
// The CRUD of tasks.
@controller("tasks")
controller TasksController(tasks: TasksAppComponent)
  @get("{id}")
  one(id: int) Result<Error, Task>
    ~tasks.task(id)

  @post()
  create(input: NewTask) Result<Error, Task>
    ~tasks.create(input)
```

## 2. The app declares the backend

One line in the app's `config.nuc`, and a connection with the same name:

```nuclear
// tasks_app/config.nuc
dragonfly(platform = "mobile", dialect = "flutter")
app(name = "tasks_app", version = "1.0.0+1")
contracts(tasks_api = "../tasks_api")              // the backend checked out next to the app

// tasks_app/config/project_config.nuc
appConfig ProjectConfig
  connections: Connection[] = [
    Http(connectionName = "tasks_api", baseUrl = "http://localhost:3000/"),
  ]
```

**Not a monorepo?** Point at the running API instead and fetch the contract when you want to follow a change:

```nuclear
contracts(tasks_api = "https://api.example.com")
```

```sh
nuclear contracts update          # GET https://api.example.com/.nuclear/contract.json → contracts/tasks_api/
nuclear contracts list            # each contract, its source, the version of the copy
```

The copy (`contracts/tasks_api/contract.json`) is committed with the app: a build never needs the network, and the
diff of a commit shows exactly what changed in the API.

## 3. What the build generates

`contracts/tasks_api/` is written at every build (a path) or by `contracts update` (a url); the files say they
are generated. The mobile example `examples/examples-flutter-dialect/tasks_app` gets:

```nuclear
// contracts/tasks_api/models/task.nuc
Task
  @primary
  id: int
  title: string
  done: boolean = false
  // 1 high, 2 normal, 3 low
  priority: int = 2
  createdAt?: DateTime

// contracts/tasks_api/models/new_task.nuc
NewTask
  @maxLength(200)
  @minLength(1)
  title: string
  @max(3)
  @min(1)
  priority: int = 2

// contracts/tasks_api/tasks_repository.nuc
@repository(path = "tasks", connection = "tasks_api")
repository TasksRepository
  @get(local = true)
  all(done?: boolean) Result<TasksApiError, Task[]>

  @get(path = ":id", local = true)
  one(id: int) Result<TasksApiError, Task>

  @post
  create(input: NewTask) Result<TasksApiError, Task>
```

The rules of `NewTask` came from the backend: a form on it refuses what the API refuses. `Task` has its key, so
the GETs get `local = true` and `allAsLocal()` / `oneAsLocal()` answer offline. Only what the app's platform
understands is written (a web app gets no `@primary` and no rules until it has forms and a local database).

## 4. The app writes only its own logic

```nuclear
usecase PendingTasksUseCase
  (tasks: TasksRepository)

  exec() Result<TasksApiError, Task[]>
    ~tasks.all(done = false)

usecase AddTaskUseCase
  (tasks: TasksRepository)

  exec(title: string) Result<TasksApiError, Task>
    ~tasks.create(input = NewTask(title = title))
```

Rename `done` to `completed` in the backend, build it, build the app:

```
error[N0116]: 'done' is not a member of Task
```

## 5. In the editor

The **Nuclear HTTP** view of the VS Code extension lists every project of the workspace by platform, its
components and endpoints (from the contracts), the contracts an app declares with an *Update* action, and OpenAPI
documents of APIs that are not Nuclear. Clicking an endpoint opens a request panel with the active environment's
variables and headers (`.nuclear/http.json`), a sample body built from the model, and the pretty-printed response.

Rules: [projects.md §1.2](https://github.com/nuclearlang/nuclear/blob/main/spec/projects.md); plan and decisions: `specs/003-shared-contracts/plan.md`,
ADR-0098.

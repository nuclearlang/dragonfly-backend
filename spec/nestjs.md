# Dialect `nestjs`: the `backend` platform in TypeScript

> The TypeScript dialect of the [backend platform](backend.md) (ADR-0093), extending [nodejs](https://github.com/nuclearlang/nuclear/blob/main/spec/nodejs.md) →
> [typescript](https://github.com/nuclearlang/nuclear/blob/main/spec/typescript.md). The platform's rules, kinds and Nuclear are in `backend.md`; this document holds only
> how this dialect writes them: **NestJS 12** (ES modules) controllers, repositories over tables with **Sequelize**
> (`@nestjs/sequelize` + `sequelize-typescript`), DTOs validated with **class-validator**, **Kafka** listeners and the
> **Redis** cache, **LangChain.js / LangGraph.js** tools, agents and graphs, and the Nest modules written for you.
> Files: `dialects/backend/nestjs/`; runtime: `packages/dragonfly-nest` (npm `dragonfly-nest`).

## 1. Project

A folder with `config.nuc` (`dragonfly(platform = "backend", dialect = "nestjs")`, [backend.md](backend.md) §1);
`nuclear build .` writes `build/`: `src/` (the app), `test/`, `package.json`, `tsconfig.json`. In `build/`: `npm install`, `npm run dev` (port `PORT`, default 3000), `npm test`.
The output is ES modules (NestJS 12): relative imports name the `.js` file.

```
tasks_api/
├── config.nuc                         dragonfly(platform = "backend", dialect = "nestjs"), app(...), plugins(...)
├── config/project_config.nuc          appConfig: the database and the other connections
├── components/tasks/
│   ├── tasks_appcomponent.nuc         appcomponent: what the rest of the app sees
│   ├── data/entities/*.nuc            entities (tables), by folder
│   ├── data/repositories/*.nuc        repository
│   ├── domain/models/*.nuc            DTOs, by folder
│   ├── domain/usecases/*.nuc          usecase
│   └── api/*.nuc                      controller
├── shared/entities, shared/models     the same kinds, for every component
└── test/*.nuc                         tests (node:test), by folder
```

Generated once per project: `src/app.module.ts` (one global Nest module per component with its entities, providers
and controllers, exporting its appcomponent; the app module with the database and the connections), `src/main.ts`,
`package.json` (the drivers of the databases the config uses) and `tsconfig.json`.

**Architecture** (N0301, N0302): a use case is called only by its `appcomponent`; a repository by use cases and
aggregates; a service by use cases and aggregates. Another component sees only the `appcomponent`, models and
entities. **Type definitions** of every library come with the dialect (`nuclear defs search <text> --dialect
nestjs`): an invented class is N0220.

### Plugins (`config.nuc`)

The optional parts are plugins ([projects.md](https://github.com/nuclearlang/nuclear/blob/main/spec/projects.md) §3.3): `plugins(sqlite = true, postgres = true, mysql =
true, mariadb = true, redis = true, kafka = true, events = true, ai = true, openai = true, ollama = true)`. Only the
enabled ones go to `package.json`, and the runtime loads them only then (`dragonfly-nest/ai`, `dragonfly-nest/events`).
A kind or a name of a plugin not enabled is N0304: `tools`, `agent`, `state`, `graph` need `ai`; `listener` and
`publish` need `events` (Kafka with `kafka`).

## 2. Kinds

### 2.1 Entity

A table (sequelize-typescript). In `components/<c>/data/entities/` the kind is given by the folder; elsewhere write `entity`. `@entity("table")` names the table (default: the name in snake_case); columns are snake_case in the database (`underscored`). Each field is a column: `@primary(generated = true)` (a key the database gives: auto increment for an `int`, a uuid for a `string`), `@primary()` (a key the app gives; `length = 36`), `@column(length = 100, unique = true, name = "x")`, `@created()`, `@updated()`; without a decorator it is a column too. The SQL type comes from the field type; `name?: T` allows null; a default is the column's default.

```nuclear
@entity("tasks")
entity Task()
  @primary(generated = true)
  id: int
  @column(length = 200, unique = true)
  title: string
  done: boolean = false
  @created()
  createdAt?: DateTime
```

```typescript
import { Entity } from 'dragonfly-nest';
import { AutoIncrement, Column, CreatedAt, DataType, PrimaryKey, Table } from 'sequelize-typescript';

@Table({
  tableName: 'tasks',
  underscored: true,
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: false,
})
export class Task extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING(200), allowNull: false, unique: true })
  declare title: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare done: boolean;
  @CreatedAt
  declare createdAt?: Date;
}
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

```typescript
import { Entity, Related, joinTable } from 'dragonfly-nest';
import { AutoIncrement, BelongsTo, BelongsToMany, Column, DataType, HasMany, PrimaryKey, Table } from 'sequelize-typescript';

@Table({
  tableName: 'projects',
  underscored: true,
  timestamps: false,
})
export class Project extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;
  @HasMany(() => Task, { foreignKey: 'projectId', constraints: false })
  declare tasks?: Task[];
}

@Table({
  tableName: 'tasks',
  underscored: true,
  timestamps: false,
})
export class Task extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING, allowNull: false })
  declare title: string;
  @BelongsTo(() => Project, { foreignKey: 'projectId', onDelete: 'cascade' })
  declare project?: Related<Project>;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare projectId?: number;
  @BelongsToMany(() => Tag, joinTable('tasks_tags', 'task_id', 'tag_id'))
  declare tags?: Tag[];
}

@Table({
  tableName: 'tags',
  underscored: true,
  timestamps: false,
})
export class Tag extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING, allowNull: false })
  declare label: string;
  @BelongsToMany(() => Task, joinTable('tasks_tags', 'tag_id', 'task_id'))
  declare tasks?: Task[];
}
```

### 2.2 Repository

The data of one entity: `NameRepository` works on `Name` (or `@repository(Entity)`); Nest injects its Sequelize model. It brings `find(id)` (`Ok(entity)` / `Err(NotFound)`), `findAll()`, `save(entity)` and `remove(id)`. Each method's lines build ONE query, created for that call (`q`): `where({...})` (equality, or `gt`, `gte`, `lt`, `lte`, `ne`, `like`, `iLike`, `oneOf`, `isNull`, `between`), `orderBy(field, true)` (descending), `limit(n)`, `offset(n)`, `relations("tasks", "tasks.tags")` (the relations to load); the last line runs it: `getOne()` (`Result`), `getMany()`, `paginate(page, size)` (`Page<T>`: `items`, `page` from 1, `size`, `total`, `pages`), `count()`, `exists()`, `update({...})`, `delete()`. The caller awaits it: `~tasks.byTitle(title)`.

```nuclear
repository TaskRepository
  byTitle(title: string) Result<Error, Task>
    where({ "title": title })
    getOne()

  pending(max: int = 20) Task[]
    where({ "done": false, "priority": lte(2) })
    orderBy("priority")
    limit(max)
    getMany()
```

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AppError, Repository, Result, lte } from 'dragonfly-nest';

@Injectable()
export class TaskRepository extends Repository<Task> {
  constructor(@InjectModel(Task) model: typeof Task) {
    super(model);
  }

  byTitle(title: string): Promise<Result<AppError, Task>> {
    const q = this.query();
    q.where({ 'title': title });
    return q.getOne();
  }

  pending(max: number = 20): Promise<Task[]> {
    const q = this.query();
    q.where({ 'done': false, 'priority': lte(2) });
    q.orderBy('priority');
    q.limit(max);
    return q.getMany();
  }
}
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

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AppError, Page, Repository, Result } from 'dragonfly-nest';

@Injectable()
export class ProjectRepository extends Repository<Project> {
  constructor(@InjectModel(Project) model: typeof Project) {
    super(model);
  }

  withTasks(id: number): Promise<Result<AppError, Project>> {
    const q = this.query();
    q.where({ 'id': id });
    q.relations('tasks.tags');
    return q.getOne();
  }
}

@Injectable()
export class TaskRepository extends Repository<Task> {
  constructor(@InjectModel(Task) model: typeof Task) {
    super(model);
  }

  page(page: number, size: number = 20): Promise<Page<Task>> {
    const q = this.query();
    q.orderBy('id');
    return q.paginate(page, size);
  }
}
```

### 2.3 Model

What the API reads and answers (a DTO): class-validator checks it (an invalid body is a 400 with the reasons). The type gives the basic check (`IsString`, `IsInt`, `IsNumber`, `IsBoolean`, `IsArray`, a nested model); the same decorators as Dragonfly's forms add rules: `@required`, `@email`, `@url`, `@minLength(n)`, `@maxLength(n)`, `@min(n)`, `@max(n)`, `@pattern(r"...")`. `NewTask(title = "x")` builds one.

```nuclear
model NewTask
  @minLength(1)
  @maxLength(200)
  title: string
  @min(1)
  @max(3)
  priority: int = 2
  @email
  owner?: string
```

```typescript
import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class NewTask {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
  @IsInt()
  @Min(1)
  @Max(3)
  priority: number = 2;
  @IsOptional()
  @IsString()
  @IsEmail()
  owner?: string;

  constructor(values: Partial<NewTask> = {}) {
    Object.assign(this, values);
  }
}
```

### 2.4 Use case

One business operation (`@Injectable`): its dependencies are constructor parameters, injected by Nest; `exec` returns `Result<E, T>`. `Error` is `AppError`; the runtime has `NotFound` (404), `Invalid` (400), `Unauthorized` (401), `Forbidden` (403) and `Conflict` (409). `x = ~repo.find(id)` unwraps the `Ok` and returns the `Err` by itself.

```nuclear
model TaskChanges
  done?: boolean

entity Task()
  @primary(generated = true)
  id: int
  done: boolean = false

repository TaskRepository

usecase CompleteTask(tasks: TaskRepository)
  exec(id: int, changes: TaskChanges) Result<Error, Task>
    task = ~tasks.find(id)
    if changes.done != null
      task.done = changes.done
    Ok(~tasks.save(task))
```

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { IsBoolean, IsOptional } from 'class-validator';
import { AppError, Entity, Err, Ok, Repository, Result } from 'dragonfly-nest';
import { AutoIncrement, Column, DataType, PrimaryKey, Table } from 'sequelize-typescript';

export class TaskChanges {
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  constructor(values: Partial<TaskChanges> = {}) {
    Object.assign(this, values);
  }
}

@Table({
  tableName: 'task',
  underscored: true,
  timestamps: false,
})
export class Task extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare done: boolean;
}

@Injectable()
export class TaskRepository extends Repository<Task> {
  constructor(@InjectModel(Task) model: typeof Task) {
    super(model);
  }
}

@Injectable()
export class CompleteTask {
  constructor(private readonly tasks: TaskRepository) {}

  async exec(id: number, changes: TaskChanges): Promise<Result<AppError, Task>> {
    const taskResult = await this.tasks.find(id);
    if (taskResult.isErr) return Err(taskResult.error);
    const task = taskResult.value;
    if (changes.done != null) {
      task.done = changes.done;
    }
    return Ok(await this.tasks.save(task));
  }
}
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

```typescript
import { Injectable } from '@nestjs/common';
import { AppError, Ok, Result, transactional } from 'dragonfly-nest';

@Injectable()
export class CloseProject {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly projects: ProjectRepository,
  ) {}

  @transactional
  async exec(id: number, into: number): Promise<Result<AppError, number>> {
    await this.projects.find(into);
    const moved = await this.tasks.where({ 'projectId': id }).update({ 'projectId': into });
    await this.projects.remove(id);
    return Ok(moved);
  }
}
```

### 2.5 Appcomponent

The facade of a component: aliases to its use cases. Nest injects each use case in its constructor; other components and the controllers use only this.

```nuclear
appcomponent TasksAppComponent
  task() = GetTask.exec
  complete() = CompleteTask.exec
```

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class TasksAppComponent {
  task() {
    return GetTask.exec;
  }

  complete() {
    return CompleteTask.exec;
  }
}
```

### 2.6 Controller

REST routes, like NestJS: `@controller("tasks")` and `@get`, `@post` (201), `@put`, `@patch`, `@delete` with Nest's route (`":id"`), and `@status(204)`. Each parameter is read by itself: one named in the route is `@Param` (an `int` is parsed), a model is the `@Body()`, anything else is `@Query`. A `Result` answers its value, or the error's status and message.

```nuclear
model TaskChanges
  done?: boolean

@controller("tasks")
controller TasksController(tasks: TasksAppComponent)
  @get("{id}")
  one(id: int) Result<Error, Task>
    ~tasks.task(id)

  @patch("{id}")
  complete(id: int, changes: TaskChanges) Result<Error, Task>
    ~tasks.complete(id, changes)

  @get()
  search(text?: string) string
    text ?? ""
```

```typescript
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { AppError, Result } from 'dragonfly-nest';

export class TaskChanges {
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  constructor(values: Partial<TaskChanges> = {}) {
    Object.assign(this, values);
  }
}

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksAppComponent) {}

  @Get(':id')
  async one(@Param('id', ParseIntPipe) id: number): Promise<Result<AppError, Task>> {
    return await this.tasks.task(id);
  }

  @Patch(':id')
  async complete(@Param('id', ParseIntPipe) id: number, @Body() changes: TaskChanges): Promise<Result<AppError, Task>> {
    return await this.tasks.complete(id, changes);
  }

  @Get()
  search(@Query('text') text?: string): string {
    return text ?? '';
  }
}
```

### 2.7 Configuration

The connections of the app (`appConfig`, `config/project_config.nuc`) and of a component (`config`), the platform's ([backend.md](backend.md) §2.8). Databases: `Postgres(url = ...)`, `MySQL(url = ...)`, `MariaDB(url = ...)`, `SQLite(file = ...)`, each with `createTables = true` to create the tables (development); `Redis(url = ...)` (ioredis), `Kafka(servers = "a:9092,b:9092", group = "app")` (kafkajs); chat models `Ollama(model = "qwen3.5:4b", baseUrl = ...)`, `OpenAI(model = "gpt-4o-mini")` (LangChain `initChatModel`); `Embeddings(model = "ollama:nomic-embed-text")` and `Chroma(collection = ..., url = ...)` (chromadb's client behind a LangChain `VectorStore`). The database goes to `SequelizeModule`; the other connections are opened at start and closed at stop; `package.json` lists only the drivers the config uses. `env("VAR", "default")` reads the environment.

```nuclear
appConfig ProjectConfig
  connections: Connection[] = [
    Postgres(url = env("DATABASE_URL", "postgres://localhost/tasks")),
  ]
```

```typescript
import { AppConfig, Connection, Postgres, env } from 'dragonfly-nest';

export class ProjectConfig extends AppConfig {
  readonly connections: Connection[] = [new Postgres({ url: env('DATABASE_URL', 'postgres://localhost/tasks') })];
}
```

### 2.8 Listener

A Kafka consumer: each `@consumer("topic")` method receives the messages of the topic, as the type of its parameter (a model). `~publish("topic", value)` sends one; without a `Kafka` connection it reaches the listeners of the same process (development, tests). The topics a listener consumes are created if they do not exist. The Redis cache: `~cacheGet(key)`, `~cacheSet(key, value, 60)`.

```nuclear
listener TaskEvents
  created: string[] = []

  @consumer("tasks.created")
  onCreated(event: <string, any>) void
    created.add(event["title"])
```

```typescript
import { Injectable } from '@nestjs/common';
import { Listener, consumer } from 'dragonfly-nest/events';

@Injectable()
export class TaskEvents extends Listener {
  created: string[] = [];

  @consumer('tasks.created')
  onCreated(event: Record<string, any>): void {
    this.created.push(event['title']);
  }
}
```

### 2.9 Tools

Each method with a doc comment is a LangChain tool: the doc comment is the description the model reads and the parameters become its zod schema; a method without one is a helper of the others (never offered to the model).

```nuclear
tools TaskTools
  // Creates a task with a title and a priority (1 high, 2 normal, 3 low).
  addTask(title: string, priority: int = 2) string
    "created ${title} (${priority})"

  label(title: string) string
    title.upper()
```

```typescript
import { StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { Tools } from 'dragonfly-nest/ai';
import { tool } from 'langchain';
import { z } from 'zod';

@Injectable()
export class TaskTools extends Tools {
  /** Creates a task with a title and a priority (1 high, 2 normal, 3 low). */
  addTask(title: string, priority: number = 2): string {
    return `created ${title} (${priority})`;
  }

  label(title: string): string {
    return title.toUpperCase();
  }

  /** The tools the model can call: the methods with a doc comment. */
  tools(): StructuredToolInterface[] {
    return [
      tool(async ({ title, priority }) => this.addTask(title, priority), {
        name: 'addTask',
        description: 'Creates a task with a title and a priority (1 high, 2 normal, 3 low).',
        schema: z.object({ title: z.string(), priority: z.number().int().optional() }),
      }),
    ];
  }
}
```

### 2.10 Agent

A model with tools and a system prompt (LangChain `createAgent`, with memory per thread). Its tools are the `tools` it receives; `model` names the chat model connection (`Ollama`, `OpenAI`). `~assistant.ask(text, thread)` answers.

```nuclear
tools TaskTools
  // Lists the pending tasks.
  pending() string
    "none"

agent AssistantAgent(tools: TaskTools)
  prompt: string = "You are a task assistant. Use the tools."
```

```typescript
import { StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { Agent, Tools } from 'dragonfly-nest/ai';
import { tool } from 'langchain';
import { z } from 'zod';

@Injectable()
export class TaskTools extends Tools {
  /** Lists the pending tasks. */
  pending(): string {
    return 'none';
  }

  /** The tools the model can call: the methods with a doc comment. */
  tools(): StructuredToolInterface[] {
    return [
      tool(async () => this.pending(), {
        name: 'pending',
        description: 'Lists the pending tasks.',
        schema: z.object({  }),
      }),
    ];
  }
}

@Injectable()
export class AssistantAgent extends Agent {
  override prompt: string = 'You are a task assistant. Use the tools.';

  constructor(private readonly tools: TaskTools) {
    super();
  }
}
```

### 2.11 State and graph

A LangGraph `StateGraph`: `state` is its state (an `Annotation.Root`; `messages: Messages` keeps a conversation). Each method of the `graph` is a node that receives the state and returns what changes; `@start` marks the first one and `@next("node")` the one after it (`"end"` ends). `~planner.run(state, thread)` runs it and gives the final state, typed.

```nuclear
state PlanState
  goal: string
  titles: string[]

@state(PlanState)
graph Planner
  @start
  @next("end")
  split(state: PlanState) <string, any>
    { "titles": state.goal.split(",") }
```

```typescript
import { Annotation } from '@langchain/langgraph';
import { Injectable } from '@nestjs/common';
import { Graph, next, start } from 'dragonfly-nest/ai';

export const PlanState = Annotation.Root({
  goal: Annotation<string>,
  titles: Annotation<string[]>,
});
export type PlanState = typeof PlanState.State;

@Injectable()
export class Planner extends Graph<typeof PlanState> {
  readonly state = PlanState;

  @start
  @next('end')
  split(state: PlanState): Record<string, any> {
    return { 'titles': state.goal.split(',') };
  }
}
```

### 2.12 Tests

In `test/`: `tests Name` + `@test("what it checks")` methods → a `node:test` suite. Each test starts the app with the databases in SQLite in memory; `inject<X>()` gives Nest's instances; `expect(condition)` is `assert.ok`. `npm test` compiles and runs them.

```nuclear
tests Tasks
  @test("an unknown id is not found")
  unknownId() void
    tasks = inject<TasksAppComponent>()
    missing = ~tasks.task(99)
    expect(missing.error.status == 404)
```

```typescript
import { INestApplication } from '@nestjs/common';
import { inject } from 'dragonfly-nest';
import { startTestApp, stopTestApp } from 'dragonfly-nest/testing';
import { afterEach, beforeEach, describe, it } from 'node:test';

import assert from 'node:assert/strict';

describe('Tasks', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await startTestApp(AppModule);
  });

  afterEach(async () => {
    await stopTestApp(app);
  });

  it('an unknown id is not found', async () => {
    const tasks = inject(TasksAppComponent);
    const missing = await tasks.task(99);
    assert.ok(missing.error.status === 404);
  });
});
```

### Migrations

Migrations of the database schema (ADR-0100 §5): `migrations/<time>_<name>.js` over Sequelize's `queryInterface`,
diffed by `dragonfly-nest-migrate` from the entities and the `schema` the last migration exports; `SequelizeMeta`. The
commands and the rules: `spec/backend.md` §2.8.

## 3. What is not there yet

- `dragonfly make` generators for the backend kinds, `dragonfly check` and `watch` (the CLI has `new`, `build`,
  `install`, `run`, `test` and `migrate`).

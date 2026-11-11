---
layer: L2
component: dragonfly-backend
read-when: you touch the backend platform (spec/backend.md), dialects/backend/fastapi, dialects/backend/nestjs, dialects/python, packages/dragonfly-py, packages/dragonfly-nest, defs/python, defs/typescript, or the rick_api / tasks_api examples
---

# Dragonfly for backend — the platform and its dialects `fastapi` and `nestjs`

Future repository `dragonfly-backend` (ADR-0093 amends ADR-0083). Decisions: ADR-0093 (platforms), ADR-0089 (python
dialect), ADR-0090 (Python backend), ADR-0091 (NestJS backend), ADR-0092 (plugins), ADR-0100 (data: `@primary(generated)`,
TypeORM relations, `relations(...)`, `paginate` → `Page<T>`, `@transactional`).

**The platform** (`spec/backend.md`, Nuclear only): components with `data/` (entities, repositories), `domain/`
(models, use cases), `api/` (controllers), `ai/` (tools, agents, states, graphs), `events/` (listeners) and the
`appcomponent` facade; `config/project_config.nuc` with the connections; `config.nuc` with `dragonfly(platform =
"backend", dialect = ...)`, `app(...)` and `plugins(...)`; tests in `test/*_test.nuc`; errors as `Result`; the
standard library of Nuclear (`spec/library.md`). The same `.nuc` builds with every dialect below; the conformance
test (ADR-0093 §9) builds one example with both. Contract file: `dialects/backend/platform.toml` (phase B1).

## Dialects

- **`fastapi`** (Python; `dialects/backend/fastapi/`, extends `python`): FastAPI
  controllers (the runtime's `controller`/`get` decorators add the leading slash to the platform's segments; an
  invalid body answers 400), SQLAlchemy 2 async repositories (`Repository[E]`, a query per method call via
  `self_member = "q.{{name}}"`), pydantic models, graph states as pydantic models (`state.field`; a field without a
  default gets its type's empty value, `templates/state_field.tpl`), LangChain/LangGraph tools, agents and graphs,
  listeners (in-process `publish` without Kafka; `conftest` creates them), pytest tests written to `tests/` from
  the platform's `test/`.
  `builtin_result = false`: Result comes from the runtime. The **`python` dialect** (`dialects/python/`) underneath
  is the base language in Python 3.12+ typed (emitter options of ADR-0089: `hoist_block_lambdas`, `init_fields`,
  `doc_inside`, f-strings, `module_separator`, `toplevel_gap`, `type_args_as_args`, `file_prelude`,
  `snake_case_names`); its Result runtime is `templates/result.tpl`. Specs: `spec/python.md`, `spec/fastapi.md`.
- **`nestjs`** (TypeScript; `dialects/backend/nestjs/`, extends nodejs → typescript): NestJS 12 ES modules,
  sequelize-typescript entities, `Repository<E>` with `@InjectModel`, class-validator DTOs, `alias_via =
  "constructor"` facades, controllers (route/body/query from `route` + `tinfo.model`; the platform's `@get("{id}")`
  becomes `@Get(':id')` through `[options] route_param = ":name"` and `decor.get.path`), LangChain.js /
  LangGraph.js (`Annotation.Root` states, zod tool schemas), `node:test` tests. Project files: `src/app.module.ts`
  (a module per component via `components`), `src/main.ts`, `package.json` (`uses`, `plugins.packages`),
  `tsconfig.json`; `project_import = "{{relative}}.js"`. Spec: `spec/nestjs.md`.

## Runtimes

- **`packages/dragonfly-py`** (import `dragonfly`): `result`, `errors` (AppError + HTTP statuses), `inject` (by
  type, `provide`, `bind`, `reset`), `config` (connections: Postgres, MySQL, MariaDB, SQLite(file), Redis,
  Kafka(servers, group), OpenAI, Ollama, Embeddings, Chroma(collection, embeddings, url); plain `postgres://` URLs get
  their async driver in `_with_driver`; `env`), `orm` (Entity, column helpers, `schema_of`), `repository` (CRUD, Query, operators),
  `web` (controller decorators, `router_of`: Result → HTTP, entity ↔ schema), `app` (`create_app`, lifespan,
  `connection`), optional `ai` (Tools, Agent, Graph, `start`/`next`, `Messages`) and `events` (listener, `publish`,
  cache), `testing` (`running`, `client`, `FakeModel`, `memory_database`), `validators`. Tests:
  `packages/dragonfly-py/tests`; `dragonfly.migrate` (Alembic: `make` over a scratch SQLite at head, `up`, `down`;
  `create_app` keeps the config in `app.state` for it). Type definitions `defs/python/`: `tools/defs/python/generate.sh` from
  `tools/python/.venv` (`pip install -e packages/dragonfly-py --config-settings editable_mode=compat`).
- **`packages/dragonfly-nest`** (npm `dragonfly-nest`, ESM): `result`, `errors`, `config` (databases with `url` or
  `file` + `createTables`, `env`, `databaseOf`), `repository`, `web` (`ResultInterceptor`, `configureApp`), `app`
  (`createApp`, `Connections`, `inject`, `connection`, `register`), `migrate` (bin `dragonfly-nest-migrate`:
  `schemaOf`, `diff`, `render`, `make`/`up`/`down`; reads `entities` and `config` the app module exports); entry points `dragonfly-nest/events` (Redis,
  Kafka(servers, group), Listener, `consumer`, `publish`, cache), `dragonfly-nest/ai` (ChatModel/Ollama/OpenAI,
  Embeddings (`'provider:model'`), Chroma + `ChromaStore` (chromadb's client behind a LangChain `VectorStore`:
  `@langchain/community` was rejected, its peers conflict with zod 4 and ioredis 6), `vectorStore`, Tools, Agent,
  Graph, `start`/`next`, `Messages`, `StateOf`, `FakeModel`), `dragonfly-nest/testing` (`startTestApp`,
  `useConnection`; so a production install without `@nestjs/testing` loads the base). Its own `devDependencies`
  build it (`npm install` in its folder); an app, and `tools/node`, install it with `npm install --no-save
  --install-links ../../packages/dragonfly-nest` (a symlink resolves its peers in its own `node_modules`, and two
  copies of `@nestjs/common` break `tsc`), so repeat it after rebuilding the runtime. Tests: `test/runtime.test.ts`.
  Type definitions `defs/typescript/`: `tools/defs/typescript/generate.sh` from `tools/node/node_modules`.

Both runtimes serve the contract the transpiler wrote next to the app (`GET /.nuclear/contract.json`,
`GET /.nuclear/openapi.json`; `_serve_contract` in `app.py`, `serveContract` in `web.ts`; ADR-0098).

**Data (ADR-0100), how it is built.** The rules of the relation decorators are data of the platform:
`[decorators.args]` and `[decorators.fields]` of `dialects/backend/platform.toml` (merged into both dialects by the
loader; the emitter's `check_field_rules` raises N0308 with no decorator name in Rust, comparing Nuclear names so
fastapi's snake_case output does not matter). Templates read `tinfo.decor` (the related entity's table),
`tinfo.fields_decor.primary` (its key), `owner` / `owner_decor` (the entity the field is in) and `|unquote`.
- fastapi: `many_to_one` / `one_to_many` / `many_to_many` / `one_to_one` in `orm.py` (`lazy="raise"`; the foreign key
  is appended to the table in `Entity.__init_subclass__`; join tables are made when the mappers are configured, so
  `Database.open` calls `configure_mappers()` and SQLite runs `PRAGMA foreign_keys=ON`); `to_dict` and `EntitySchema`
  leave unloaded relations out; two entities import each other only under `if TYPE_CHECKING:` (`[kinds.entity]
  type_imports = true` + the python dialect's `[syntax] type_imports`); `main.py` and `conftest.py` list every entity
  (`entities=[...]`) so SQLAlchemy knows all tables. Transactions: a `ContextVar` session that `Repository.use()` joins.
- nestjs: the runtime's `Entity` base keeps the relations given to the constructor (sequelize drops them), `save`
  writes a `@manyToOne` set to a row and `$set`s a `@manyToMany` list; only the side with the column declares the
  foreign key (`constraints: false` on `@HasMany`/`@HasOne`); `joinTable(name, fk, other)` (no timestamps);
  `Related<T>` types a single relation so the decorator metadata never reads the other class (ESM circular imports).
  Transactions: an `AsyncLocalStorage` that every repository call passes as `{ transaction }`.
- Both runtimes have the same test: `packages/dragonfly-py/tests/test_data.py`, `packages/dragonfly-nest/test/data.test.ts`.

Regenerate a runtime's definitions after changing its public API.

## Checks

```sh
python3 -m venv tools/python/.venv && tools/python/.venv/bin/pip install -r tools/python/requirements.txt
tools/python/.venv/bin/pip install -e packages/dragonfly-py --config-settings editable_mode=compat
tools/fastapi-check/check.sh               # rick_api: build, pyright --strict, pytest, smoke.py; runtime tests
(cd packages/dragonfly-nest && npm install && npx tsc -p tsconfig.json)
(cd tools/node && npm install && npm install --no-save --install-links ../../packages/dragonfly-nest)
tools/nestjs-check/check.sh                  # tasks_api: runtime build, tsc --strict, node:test, smoke.mjs; runtime tests
tools/spec-check/check.py spec/python.md python python
tools/spec-check/check.py spec/fastapi.md fastapi python
tools/spec-check/check.py spec/nestjs.md nestjs typescript
```

Goldens: `examples/examples-python/tour.py`, `examples/examples-nestjs/users.ts` (golden.rs);
`examples/expected/rick_api/`, `examples/expected/tasks_api/` (projects.rs). User guides: `docs/dragonfly/python.md`,
`docs/dragonfly/nestjs.md`.

State and pending: [STATUS.md](https://github.com/nuclearlang/nuclear/blob/main/STATUS.md).

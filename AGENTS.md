# AGENTS.md — dragonfly-backend

The backend platform of Dragonfly: HTTP APIs, databases with relations, migrations and transactions, events, AI agents and graphs, written once in Nuclear and built with either dialect: `fastapi` (Python: FastAPI, SQLAlchemy, Alembic, LangGraph) or `nestjs` (TypeScript: NestJS, Sequelize, LangChain.js).

This repository is a folder of the NuclearLang working tree (`nuclear/dragonfly-backend`); the platform's rules are the
working tree's `../AGENTS.md` ([nuclear](https://github.com/nuclearlang/nuclear/blob/main/AGENTS.md)) and its state is `../STATUS.md`.

- Context of this repository: [docs/context/dragonfly-backend/CONTEXT.md](docs/context/dragonfly-backend/CONTEXT.md).
- What is inside: `dialects/backend/` (the platform contract, `fastapi`, `nestjs`), `packages/{dragonfly-py,dragonfly-nest}` (the runtimes), `defs/{python,typescript}/`, `spec/{backend,fastapi,nestjs}.md`, `examples/` (`tasks_api` builds with both dialects), `tools/{fastapi,nestjs}-check`, `docs/`.
- Checks:

```sh
(cd .. && cargo test)                 # the examples with both dialects, the goldens
sh tools/fastapi-check/check.sh       # pyright --strict, pytest, migrations, a live run
sh tools/nestjs-check/check.sh        # tsc --strict, node:test, migrations, a live run
```

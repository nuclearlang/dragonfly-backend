# Dragonfly backend

The backend platform of Dragonfly: HTTP APIs, databases with relations, migrations and transactions, events, AI agents and graphs, written once in Nuclear and built with either dialect: `fastapi` (Python: FastAPI, SQLAlchemy, Alembic, LangGraph) or `nestjs` (TypeScript: NestJS, Sequelize, LangChain.js).

Start with the guides [docs/dragonfly/python.md](docs/dragonfly/python.md) and [docs/dragonfly/nestjs.md](docs/dragonfly/nestjs.md), and [spec/backend.md](spec/backend.md).

## What is inside

`dialects/backend/` (the platform contract, `fastapi`, `nestjs`), `packages/{dragonfly-py,dragonfly-nest}` (the runtimes), `defs/{python,typescript}/`, `spec/{backend,fastapi,nestjs}.md`, `examples/` (`tasks_api` builds with both dialects), `tools/{fastapi,nestjs}-check`, `docs/`.

## Working on it

It is built by the `nuclear` compiler and the `dragonfly` CLI, so it lives inside a clone of the
[nuclear](https://github.com/nuclearlang/nuclear) repository:

```sh
git clone https://github.com/nuclearlang/nuclear && cd nuclear
git clone https://github.com/nuclearlang/dragonfly-backend
(cd tools/node && npm install)                    # the shared Node tools of the checks
python3 -m venv tools/python/.venv && tools/python/.venv/bin/pip install -r tools/python/requirements.txt
./install.sh
```

The checks before a change: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE).

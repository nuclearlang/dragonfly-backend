# Dialect `fastapi`: the backend platform in Python

What this dialect adds to the platform's sheet: the project is generated as FastAPI + SQLAlchemy 2 async + pydantic +
LangGraph in `build/` (never edit it). `dragonfly build`, `dragonfly install` (a virtualenv), `dragonfly run`
(uvicorn), `dragonfly test` (pytest), `dragonfly migrate` (Alembic). Names are written in snake_case underneath; the
`.nuc` keeps camelCase and the compiler's messages use it. Full rules: `nuclear help fastapi`.

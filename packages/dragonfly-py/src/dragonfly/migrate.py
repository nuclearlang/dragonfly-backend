"""Migrations of the database schema (ADR-0100 §5) with Alembic, run by `dragonfly migrate` in the generated project:

    python -m dragonfly.migrate make "add done to tasks" --dir ../migrations    one migration: the entities minus the last one
    python -m dragonfly.migrate up --dir ../migrations                         applies the pending ones
    python -m dragonfly.migrate down --dir ../migrations                       reverts the last one

`make` compares the entities with the last migration, never with the database: it brings an empty SQLite in memory to
the last migration and lets Alembic's autogenerate write the difference (the same rule as the nestjs dialect). The
folder is an Alembic script folder (`env.py`, `script.py.mako`, `versions/`), written the first time; `up` and `down`
use the default database of the app's configuration (`alembic_version` lists what is applied). Migrations are written
in batch mode, so SQLite (which cannot alter a column) and the other databases run the same file.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib
import logging
import shutil
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

__all__ = ["make", "up", "down", "run_env"]

ENV = '''"""Alembic's environment of a Dragonfly project, written once by `dragonfly migrate make` (dragonfly.migrate)."""

from dragonfly.migrate import run_env

run_env()
'''

# the file names sort in the order they were made, as the nestjs dialect's
FILE_TEMPLATE = "%(year)d%(month).2d%(day).2d%(hour).2d%(minute).2d%(second).2d_%(slug)s"


def _config(folder: str | Path, app: str) -> Any:
    from alembic.config import Config

    import alembic

    d = Path(folder).resolve()
    (d / "versions").mkdir(parents=True, exist_ok=True)
    if not (d / "env.py").exists():
        (d / "env.py").write_text(ENV)
    if not (d / "script.py.mako").exists():
        shutil.copy(Path(alembic.__file__).parent / "templates" / "generic" / "script.py.mako", d / "script.py.mako")
    cfg = Config()
    cfg.set_main_option("script_location", str(d))
    cfg.set_main_option("file_template", FILE_TEMPLATE.replace("%", "%%"))
    cfg.attributes["app"] = app
    return cfg


def _database(app: str) -> Any:
    """The default database of the app's configuration (the one the repositories use); importing the app imports every
    entity (main.py lists them)."""
    from .config import Database

    module = importlib.import_module(app)
    state = module.app.state
    config, components = state.dragonfly_config, state.dragonfly_components
    found = [c for c in [*config.connections, *(c for comp in components for c in comp.connections)] if isinstance(c, Database)]
    if not found:
        raise LookupError("the configuration has no database (Postgres, MySQL, MariaDB or SQLite)")
    return next((c for c in found if c.name == "default"), found[0])


def _ops(ops: list[Any], table: str = "") -> Iterator[str]:
    """The drops among Alembic's operations (a batch groups the operations of one table)."""
    from alembic.operations import ops as o

    for op in ops:
        if isinstance(op, o.DropTableOp):
            yield f"table {op.table_name}"
        elif isinstance(op, o.DropColumnOp):
            yield f"column {op.table_name or table}.{op.column_name}"
        elif hasattr(op, "ops"):
            yield from _ops(op.ops, getattr(op, "table_name", table))


def _directives(context: Any, revision: Any, directives: list[Any]) -> None:
    del context, revision
    script = directives[0]
    if script.upgrade_ops.is_empty():
        directives[:] = []
        return
    for drop in _ops(script.upgrade_ops.ops):
        print(f"warning: the migration drops {drop}; if it was renamed, edit it", file=sys.stderr)


def run_env() -> None:
    """The body of the folder's env.py: the scratch connection of `make`, or the app's database."""
    from alembic import context
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.orm import configure_mappers

    from .orm import Entity

    cfg = context.config
    if context.is_offline_mode():
        raise RuntimeError("dragonfly migrations run against a database (no --sql mode)")

    def migrate(connection: Any) -> None:
        context.configure(
            connection=connection,
            target_metadata=Entity.metadata,
            render_as_batch=True,
            compare_type=True,
            compare_server_default=True,
            process_revision_directives=_directives,
        )
        with context.begin_transaction():
            context.run_migrations()

    scratch = cfg.attributes.get("connection")
    if scratch is not None:
        importlib.import_module(cfg.attributes["app"])
        configure_mappers()
        migrate(scratch)
        return
    db = _database(cfg.attributes["app"])
    configure_mappers()

    async def run() -> None:
        engine = create_async_engine(db.url)
        try:
            async with engine.connect() as connection:
                await connection.run_sync(migrate)
                await connection.commit()
        finally:
            await engine.dispose()

    asyncio.run(run())


def make(folder: str | Path, message: str, app: str = "app.main") -> Path | None:
    """Writes the migration from the last one to the entities; None when nothing changed."""
    from alembic import command
    from sqlalchemy import create_engine

    cfg = _config(folder, app)
    versions = Path(folder).resolve() / "versions"
    before = set(versions.glob("*.py"))
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            cfg.attributes["connection"] = connection
            command.upgrade(cfg, "head")
            command.revision(cfg, message=message, autogenerate=True)
    finally:
        engine.dispose()
    made = sorted(set(versions.glob("*.py")) - before)
    return made[0] if made else None


def up(folder: str | Path, app: str = "app.main") -> None:
    """Applies the pending migrations to the app's database."""
    from alembic import command

    command.upgrade(_config(folder, app), "head")


def down(folder: str | Path, app: str = "app.main") -> None:
    """Reverts the last applied migration."""
    from alembic import command

    command.downgrade(_config(folder, app), "-1")


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="python -m dragonfly.migrate")
    parser.add_argument("command", choices=["make", "up", "down"])
    parser.add_argument("message", nargs="?")
    parser.add_argument("--dir", default="../migrations")
    parser.add_argument("--app", default="app.main")
    a = parser.parse_args(argv)
    sys.path.insert(0, str(Path.cwd()))
    sys.dont_write_bytecode = True  # no __pycache__ in the project's migrations folder
    # what was applied or reverted: Alembic's "Running upgrade a -> b, message" lines, without its other notes
    log = logging.getLogger("alembic.runtime.migration")
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(lambda r: r.getMessage().startswith("Running"))
    handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    if a.command == "make":
        if not a.message:
            parser.error('make needs a message: make "<what changes>"')
        file = make(a.dir, a.message, a.app)
        print(f"wrote {file}" if file else "no changes: the entities match the last migration")
    elif a.command == "up":
        up(a.dir, a.app)
    else:
        down(a.dir, a.app)


if __name__ == "__main__":
    main(sys.argv[1:])

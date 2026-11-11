"""ADR-0100 §5: migrations from the entities, compared with the last migration, applied to and reverted from SQLite
(the same steps as packages/dragonfly-nest/test/migrate.test.ts). Every step runs in its own process, as
`dragonfly migrate` does: the entities of one version are a new app."""

from __future__ import annotations

import sqlite3
import subprocess
import sys
from pathlib import Path

V1 = '''
from dragonfly import AppConfig, Entity, Mapped, SQLite, column, create_app, many_to_one, primary


class ProjectConfig(AppConfig):
    connections = [SQLite(file="app.sqlite")]


class Project(Entity):
    __tablename__ = "projects"
    id: Mapped[int] = primary(generated=True)
    name: Mapped[str] = column(length=100)


class Task(Entity):
    __tablename__ = "tasks"
    id: Mapped[int] = primary(generated=True)
    title: Mapped[str] = column(length=200)
    project: Mapped[Project | None] = many_to_one("Task", "project_id", "projects.id", "", "cascade")
    project_id: Mapped[int | None] = column(){done}


app = create_app(ProjectConfig(), entities=[Project, Task])
'''

V2 = V1.replace("{done}", "\n    done: Mapped[bool] = column(default=False)").replace("length=200", "length=300")
V1 = V1.replace("{done}", "")


def migrate(project: Path, *args: str) -> str:
    out = subprocess.run(
        [sys.executable, "-m", "dragonfly.migrate", *args, "--dir", "migrations"],
        cwd=project, capture_output=True, text=True,
    )
    assert out.returncode == 0, out.stderr
    return out.stdout + out.stderr


def columns(db: Path, table: str) -> list[str]:
    with sqlite3.connect(db) as c:
        return [r[1] for r in c.execute(f"PRAGMA table_info({table})")]


def test_make_up_and_down_follow_the_entities_and_keep_the_data(tmp_path: Path) -> None:
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "__init__.py").write_text("")
    main = tmp_path / "app" / "main.py"
    db = tmp_path / "app.sqlite"

    main.write_text(V1)
    assert "wrote" in migrate(tmp_path, "make", "projects and tasks")
    assert "no changes" in migrate(tmp_path, "make", "nothing"), "no changes, no migration"
    migrate(tmp_path, "up")
    with sqlite3.connect(db) as c:
        c.execute("INSERT INTO projects (id, name) VALUES (1, 'home')")
        c.execute("INSERT INTO tasks (id, title, project_id) VALUES (1, 'paint', 1)")

    main.write_text(V2)
    assert "wrote" in migrate(tmp_path, "make", "Done tasks!")
    assert "no changes" in migrate(tmp_path, "make", "again")
    migrate(tmp_path, "up")
    assert "done" in columns(db, "tasks")
    with sqlite3.connect(db) as c:
        assert c.execute("SELECT title, done FROM tasks").fetchall() == [("paint", 0)], "the data stays"

    files = sorted(p.name for p in (tmp_path / "migrations" / "versions").glob("*.py"))
    assert len(files) == 2 and files[1].endswith("_done_tasks.py")

    migrate(tmp_path, "down")
    assert "done" not in columns(db, "tasks")
    migrate(tmp_path, "down")
    with sqlite3.connect(db) as c:
        tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert tables <= {"alembic_version"}

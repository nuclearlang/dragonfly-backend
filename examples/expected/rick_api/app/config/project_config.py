from __future__ import annotations

from dragonfly import AppConfig, Connection, Ollama, SQLite, env


class ProjectConfig(AppConfig):
    """The connections of the whole app: a database and a chat model."""

    connections: list[Connection] = [
        SQLite(file=env("DATABASE", "rick.sqlite"), create_tables=True),
        Ollama(model=env("CHAT_MODEL", "llama3.2")),
    ]

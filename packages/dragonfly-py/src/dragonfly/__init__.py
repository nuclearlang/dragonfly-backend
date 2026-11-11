"""Dragonfly for Python: the runtime of NuclearLang's fastapi dialect (spec/fastapi.md).

The optional parts are their own modules, imported only by the projects whose config.nuc enables their plugin:
`dragonfly.ai` (LangChain, LangGraph), `dragonfly.events` (Kafka, Redis).
"""

from .app import connection, connections, create_app
from .config import (
    AppConfig,
    ChatModel,
    Chroma,
    ComponentConfig,
    Connection,
    Database,
    Embeddings,
    Kafka,
    MySQL,
    Ollama,
    OpenAI,
    Postgres,
    Redis,
    SQLite,
    env,
)
from .errors import AppError, Conflict, Forbidden, Invalid, NotFound, Unauthorized
from .inject import bind, inject, provide
from .orm import Entity, Mapped, column, created, many_to_many, many_to_one, one_to_many, one_to_one, primary, updated
from .repository import (
    Page,
    Query,
    Repository,
    between,
    gt,
    gte,
    ilike,
    is_null,
    like,
    lt,
    lte,
    ne,
    one_of,
    transactional,
)
from .result import Err, Ok, Result
from .web import controller, delete, get, patch, post, put, status

__all__ = [
    "AppConfig", "AppError", "ChatModel", "Chroma", "ComponentConfig", "Conflict", "Connection", "Database",
    "Embeddings", "Entity", "Err", "Forbidden", "Invalid", "Kafka", "Mapped", "MySQL",
    "NotFound", "Ok", "Ollama", "OpenAI", "Page", "Postgres", "Query", "Redis", "Repository", "Result", "SQLite", "Unauthorized", "between", "bind", "column", "connection", "connections",
    "controller", "create_app", "created", "delete", "env", "get", "gt", "gte", "ilike", "one_of", "status",
    "inject", "is_null", "like", "lt", "lte", "many_to_many", "many_to_one", "ne", "one_to_many", "one_to_one",
    "patch", "post", "primary", "provide", "put", "transactional", "updated", ]

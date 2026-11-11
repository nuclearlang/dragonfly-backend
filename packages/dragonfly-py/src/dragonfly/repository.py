"""Repositories: the tables of a component through its entity. Queries read like TypeORM's query builder:

    where({"user_id": id})        # equality, or an operator: {"age": gt(18)}, {"name": like("Ri%")}
    order_by("name")              # desc = True
    relations("tasks")            # load a relation (ADR-0100); "tasks.tags" loads one of its relations too
    get_one()                     # Ok(entity) or Err(NotFound)
    paginate(page, size)          # Page(items, page, size, total, pages)

Every method of a `repository` writes on its own query (`q`), so two calls never share state. Inside a
`@transactional` method every call joins one transaction of the default database.
"""

from __future__ import annotations

import functools
import math
import re
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, cast, get_args, get_origin

from sqlalchemy import Select, delete as sql_delete, func, select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .errors import NotFound
from .orm import Entity
from .result import Err, Ok, Result

__all__ = [
    "Repository", "Query", "Page", "transactional",
    "gt", "gte", "lt", "lte", "ne", "like", "ilike", "one_of", "is_null", "between",
]


@dataclass
class Page[T]:
    """One page of a query: `items`, `page` (from 1), `size`, `total` rows and `pages`."""

    items: list[T] = field(default_factory=lambda: [])
    page: int = 1
    size: int = 20
    total: int = 0
    pages: int = 0


# the session of the running @transactional call
_tx: ContextVar[AsyncSession | None] = ContextVar("dragonfly_transaction", default=None)


class _Rollback(Exception):
    def __init__(self, result: Any) -> None:
        self.result = result


def transactional[**P, R](fn: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
    """`@transactional` on a use case's `exec`: its repository calls share one transaction of the default database;
    an `Err` or an error rolls it back, an `Ok` commits it. A call inside another transactional call joins it."""

    @functools.wraps(fn)
    async def run(*args: P.args, **kwargs: P.kwargs) -> R:
        if _tx.get() is not None:
            return await fn(*args, **kwargs)
        from .app import connection
        from .config import Database

        async with cast(AsyncSession, connection(Database).sessions()) as s:
            token = _tx.set(s)
            try:
                async with s.begin():
                    result = await fn(*args, **kwargs)
                    if isinstance(result, Result) and cast(Result[Any, Any], result).is_err:
                        raise _Rollback(result)
                return result
            except _Rollback as r:
                return cast(R, r.result)
            finally:
                _tx.reset(token)

    return run


@dataclass(frozen=True)
class Op:
    """A comparison of `where` other than equality."""

    apply: Callable[[Any], Any]


def gt(v: Any) -> Op:
    return Op(lambda c: c > v)


def gte(v: Any) -> Op:
    return Op(lambda c: c >= v)


def lt(v: Any) -> Op:
    return Op(lambda c: c < v)


def lte(v: Any) -> Op:
    return Op(lambda c: c <= v)


def ne(v: Any) -> Op:
    return Op(lambda c: c != v)


def like(pattern: str) -> Op:
    return Op(lambda c: c.like(pattern))


def ilike(pattern: str) -> Op:
    return Op(lambda c: c.ilike(pattern))


def one_of(values: list[Any]) -> Op:
    return Op(lambda c: c.in_(values))


def is_null(null: bool = True) -> Op:
    return Op(lambda c: c.is_(None) if null else c.is_not(None))


def between(low: Any, high: Any) -> Op:
    return Op(lambda c: c.between(low, high))


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


class Repository[T: Entity]:
    """The data of one entity: `Repository[Character]`. CRUD without writing it (find, find_all, save, remove)
    and a query builder (where, order_by, limit, offset, then get_one, get_many, count, exists, update, delete)."""

    entity: type[T]
    database: str = "default"

    def __init_subclass__(cls, **kw: Any) -> None:
        super().__init_subclass__(**kw)
        for base in getattr(cls, "__orig_bases__", ()):
            if get_origin(base) is Repository and get_args(base) and isinstance(get_args(base)[0], type):
                cls.entity = get_args(base)[0]

    def session(self) -> AsyncSession:
        from .app import connection
        from .config import Database

        return cast(AsyncSession, connection(Database, self.database).sessions())

    @asynccontextmanager
    async def use(self, write: bool = False) -> AsyncIterator[AsyncSession]:
        """The session of a call: the running transaction's, or a new one (in its own transaction to write)."""
        current = _tx.get()
        if current is not None and self.database == "default":
            yield current
            if write:
                await current.flush()
            return
        async with self.session() as s:
            if write:
                async with s.begin():
                    yield s
            else:
                yield s

    def query(self) -> Query[T]:
        return Query(self)

    # --- CRUD ---
    async def find(self, id: Any) -> Result[NotFound, T]:
        async with self.use() as s:
            found = await s.get(self.entity, id)
        return Ok(found) if found is not None else Err(NotFound(f"{self.entity.__name__} {id} not found"))

    async def find_all(self) -> list[T]:
        return await self.query().get_many()

    async def save(self, entity: T) -> T:
        async with self.use(write=True) as s:
            merged = await s.merge(entity)
        return merged

    async def remove(self, id: Any) -> bool:
        async with self.use(write=True) as s:
            found = await s.get(self.entity, id)
            if found is None:
                return False
            await s.delete(found)
        return True

    # --- the query builder, started from the repository ---
    def where(self, conditions: Mapping[str, Any] | None = None, /, **more: Any) -> Query[T]:
        return self.query().where(conditions, **more)

    def order_by(self, field: str, desc: bool = False) -> Query[T]:
        return self.query().order_by(field, desc)

    def limit(self, n: int) -> Query[T]:
        return self.query().limit(n)

    def offset(self, n: int) -> Query[T]:
        return self.query().offset(n)

    def relations(self, *names: str) -> Query[T]:
        return self.query().relations(*names)

    async def paginate(self, page: int, size: int = 20) -> Page[T]:
        return await self.query().paginate(page, size)

    async def get_one(self) -> Result[NotFound, T]:
        return await self.query().get_one()

    async def get_many(self) -> list[T]:
        return await self.query().get_many()

    async def count(self) -> int:
        return await self.query().count()

    async def exists(self) -> bool:
        return await self.query().exists()


class Query[T: Entity]:
    """One query of a repository. `where`/`order_by`/`limit`/`offset` add to it; the others run it."""

    def __init__(self, repo: Repository[T]) -> None:
        self.repo = repo
        self.conditions: list[Any] = []
        self.orders: list[Any] = []
        self.max: int | None = None
        self.skip: int | None = None
        self.loads: list[str] = []

    def _col(self, field: str) -> Any:
        # a key of `where` is the Nuclear name (`projectId`), the attribute its snake_case (`project_id`)
        col = getattr(self.repo.entity, field, None) or getattr(self.repo.entity, _snake(field), None)
        if col is None:
            raise AttributeError(f"{self.repo.entity.__name__} has no column '{field}'")
        return col

    def where(self, conditions: Mapping[str, Any] | None = None, /, **more: Any) -> Query[T]:
        for field, value in {**(conditions or {}), **more}.items():
            col = self._col(field)
            self.conditions.append(value.apply(col) if isinstance(value, Op) else col == value)
        return self

    def order_by(self, field: str, desc: bool = False) -> Query[T]:
        col = self._col(field)
        self.orders.append(col.desc() if desc else col)
        return self

    def limit(self, n: int) -> Query[T]:
        self.max = n
        return self

    def offset(self, n: int) -> Query[T]:
        self.skip = n
        return self

    def relations(self, *names: str) -> Query[T]:
        """Loads these relations with the rows (`"tasks"`, `"tasks.tags"`); the others stay out of the answer."""
        self.loads.extend(names)
        return self

    def _load(self, path: str) -> Any:
        cls: Any = self.repo.entity
        option: Any = None
        for part in path.split("."):
            attr = getattr(cls, part, None) or getattr(cls, _snake(part), None)
            if attr is None:
                raise AttributeError(f"{cls.__name__} has no relation '{part}'")
            option = selectinload(attr) if option is None else option.selectinload(attr)
            cls = attr.property.mapper.class_
        return option

    def _select(self) -> Select[tuple[T]]:
        stmt = select(self.repo.entity).where(*self.conditions).order_by(*self.orders)
        if self.loads:
            stmt = stmt.options(*[self._load(p) for p in self.loads])
        if self.max is not None:
            stmt = stmt.limit(self.max)
        if self.skip is not None:
            stmt = stmt.offset(self.skip)
        return stmt

    async def get_one(self) -> Result[NotFound, T]:
        async with self.repo.use() as s:
            found = (await s.execute(self._select().limit(1))).scalars().first()
        return Ok(found) if found is not None else Err(NotFound(f"{self.repo.entity.__name__} not found"))

    async def get_many(self) -> list[T]:
        async with self.repo.use() as s:
            return list((await s.execute(self._select())).scalars().all())

    async def paginate(self, page: int, size: int = 20) -> Page[T]:
        """One page (from 1) of `size` rows, with the total of rows and of pages."""
        page, size = max(page, 1), max(size, 1)
        total = await self.count()
        self.max, self.skip = size, (page - 1) * size
        return Page(await self.get_many(), page, size, total, math.ceil(total / size))

    async def count(self) -> int:
        async with self.repo.use() as s:
            stmt = select(func.count()).select_from(self.repo.entity).where(*self.conditions)
            return int((await s.execute(stmt)).scalar_one())

    async def exists(self) -> bool:
        return await self.count() > 0

    async def update(self, values: Mapping[str, Any]) -> int:
        async with self.repo.use(write=True) as s:
            names = {(k if hasattr(self.repo.entity, k) else _snake(k)): v for k, v in values.items()}
            done = await s.execute(sql_update(self.repo.entity).where(*self.conditions).values(**names))
        return int(getattr(done, "rowcount", 0))

    async def delete(self) -> int:
        async with self.repo.use(write=True) as s:
            done = await s.execute(sql_delete(self.repo.entity).where(*self.conditions))
        return int(getattr(done, "rowcount", 0))

    # CRUD of the repository, so a repository method can use them on its query
    async def find(self, id: Any) -> Result[NotFound, T]:
        return await self.repo.find(id)

    async def find_all(self) -> list[T]:
        return await self.repo.find_all()

    async def save(self, entity: T) -> T:
        return await self.repo.save(entity)

    async def remove(self, id: Any) -> bool:
        return await self.repo.remove(id)

"""Entities: SQLAlchemy 2 tables declared like TypeORM. A field's decorator becomes its column:
@primary() → a key the app gives, @primary(generated = true) → auto increment (int) or a uuid (string),
@column(length = 100, unique = true) → a column. Relations (ADR-0100): @manyToOne, @oneToMany, @manyToMany + @joinTable,
@oneToOne + @joinColumn; a relation is loaded only when a query asks for it (`relations("tasks")`)."""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any, ClassVar

from pydantic import BaseModel, SerializerFunctionWrapHandler, create_model, model_serializer
from sqlalchemy import Column, DateTime, ForeignKey, ForeignKeyConstraint, String, Table, func, inspect, text
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, RelationshipProperty, mapped_column, relationship

__all__ = [
    "Entity", "Mapped", "primary", "column", "created", "updated", "schema_of",
    "many_to_one", "one_to_many", "many_to_many", "one_to_one",
]


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


class Entity(AsyncAttrs, DeclarativeBase):
    """The base of every entity (a table). `entity.to_dict()` gives its columns and its loaded relations."""

    def __init_subclass__(cls, **kw: Any) -> None:
        # the join column of a @manyToOne / @oneToOne gets its foreign key once the table exists
        keys = [v.info["fk"] for v in list(cls.__dict__.values()) if isinstance(v, RelationshipProperty) and "fk" in v.info]
        super().__init_subclass__(**kw)
        table: Table = getattr(cls, "__table__")
        for column_name, ref, on_delete in keys:
            table.append_constraint(ForeignKeyConstraint([column_name], [ref], ondelete=on_delete))

    def to_dict(self, _seen: set[int] | None = None) -> dict[str, Any]:
        seen = (_seen or set()) | {id(self)}
        out = {c.key: getattr(self, c.key) for c in self.__mapper__.column_attrs}
        unloaded = inspect(self).unloaded
        for r in self.__mapper__.relationships:
            if r.key in unloaded:
                continue
            v = getattr(self, r.key)
            if isinstance(v, list):
                out[r.key] = [x.to_dict(seen) for x in v if id(x) not in seen]  # type: ignore[union-attr]
            elif v is None or id(v) not in seen:
                out[r.key] = v.to_dict(seen) if v is not None else None
        return out


def primary(length: int | None = None, generated: bool = False, uuid_key: bool = False) -> Any:
    """The primary key: given by the app (a code), or `generated` (auto increment; with `uuid_key`, a uuid text)."""
    if generated and uuid_key:
        return mapped_column(String(length or 36), primary_key=True, default=lambda: str(uuid.uuid4()))
    if generated:
        return mapped_column(primary_key=True, autoincrement=True)
    return mapped_column(String(length) if length else None, primary_key=True)


def column(
    length: int | None = None,
    nullable: bool | None = None,
    unique: bool = False,
    index: bool = False,
    default: Any = None,
    name: str | None = None,
) -> Any:
    """A column. Its SQL type comes from the field's type (str, int, float, bool, datetime...)."""
    args: list[Any] = [name] if name else []
    if length:
        args.append(String(length))
    kw: dict[str, Any] = {"unique": unique, "index": index}
    if nullable is not None:
        kw["nullable"] = nullable
    if default is not None:
        kw["default"] = default
        sql = _sql_literal(default)
        if sql is not None:
            # also the database's default: a migration that adds the column to a table with rows needs it
            kw["server_default"] = text(sql)
    return mapped_column(*args, **kw)


def _sql_literal(value: Any) -> str | None:
    """`value` as SQL every database reads the same (true/false, numbers, quoted text); None for other values."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return repr(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return None


def created() -> Any:
    """When the row was inserted (set by the database)."""
    return mapped_column(DateTime(timezone=True), server_default=func.now())


def updated() -> Any:
    """When the row last changed (set by the database)."""
    return mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


_ACTIONS = {"cascade": "CASCADE", "set null": "SET NULL", "restrict": "RESTRICT", "no action": "NO ACTION"}


def _registered(name: str) -> Any:
    return Entity.registry._class_registry[name]  # type: ignore[attr-defined]


def many_to_one(owner: str, column_name: str, ref: str, inverse: str | None = None, on_delete: str | None = None) -> Any:
    """`@manyToOne project?: Project` + `projectId`: the row this one points to by its column (`ref`: table.key)."""
    return relationship(
        foreign_keys=f"{owner}.{column_name}",
        back_populates=_snake(inverse) if inverse else None,
        lazy="raise",
        info={"fk": (column_name, ref, _ACTIONS.get(on_delete or "", None))},
    )


def one_to_many(target: str, inverse: str, one: bool = False) -> Any:
    """`@oneToMany(inverse = "project") tasks?: Task[]`: the rows of `target` that point to this one."""
    back = _snake(inverse)
    # passive_deletes: removing this row leaves its rows to the database's ON DELETE (as sequelize does)
    return relationship(
        foreign_keys=f"{target}.{back}_id", back_populates=back, lazy="raise", uselist=not one, passive_deletes=True
    )


def one_to_one(
    owner: str, target: str, column_name: str = "", ref: str = "", inverse: str | None = None, on_delete: str | None = None
) -> Any:
    """`@oneToOne`: the @joinColumn side keeps the column (`column_name`, `ref`: table.key); the other side reads it."""
    if column_name:
        rel = many_to_one(owner, column_name, ref, inverse, on_delete)
        rel.uselist = False
        return rel
    return one_to_many(target, inverse or "", one=True)


# the join tables of the @manyToMany relations: (owner class, field) → the table, made when the mappers are configured
_joins: dict[tuple[str, str], Callable[[], Table]] = {}


def many_to_many(owner: str, field: str, target: str, inverse: str | None = None, join: bool = False) -> Any:
    """`@manyToMany tags?: Tag[]`; the side with `@joinTable` (`join`) owns the table `<owner table>_<field>`, whose
    columns are `<owner>_id` and `<target>_id`."""
    if join:
        def make() -> Table:
            o, t = _registered(owner), _registered(target)
            name = f"{o.__tablename__}_{field}"
            if name in Entity.metadata.tables:
                return Entity.metadata.tables[name]
            ok, tk = list(o.__table__.primary_key)[0], list(t.__table__.primary_key)[0]
            return Table(
                name,
                Entity.metadata,
                Column(f"{_snake(owner)}_id", ForeignKey(f"{o.__tablename__}.{ok.name}", ondelete="CASCADE"), primary_key=True),
                Column(f"{_snake(target)}_id", ForeignKey(f"{t.__tablename__}.{tk.name}", ondelete="CASCADE"), primary_key=True),
            )

        _joins[(owner, _snake(field))] = make
        secondary: Callable[[], Table] = make
    else:
        secondary = lambda: _joins[(target, _snake(inverse or ""))]()  # noqa: E731
    return relationship(secondary=secondary, back_populates=_snake(inverse) if inverse else None, lazy="raise")


class EntitySchema(BaseModel):
    """The pydantic model of an entity: a relation that was not loaded is left out of the answer (not null)."""

    relations: ClassVar[frozenset[str]] = frozenset()

    @model_serializer(mode="wrap")
    def _loaded_only(self, handler: SerializerFunctionWrapHandler) -> Any:
        data = handler(self)
        if isinstance(data, dict):
            for r in self.relations - self.model_fields_set:
                data.pop(r, None)  # type: ignore[union-attr]
        return data


_schemas: dict[tuple[type, bool], type[BaseModel]] = {}


def schema_of(entity: type[Entity], create: bool = False) -> type[BaseModel]:
    """The pydantic model of an entity (what a controller reads and answers). `create`: without the columns the
    database fills (generated keys, timestamps), for the body of a POST."""
    key = (entity, create)
    if key not in _schemas:
        fields: dict[str, Any] = {}
        for col in entity.__table__.columns:
            # a column with a literal default (column(default=...)) also has it as the SQL default, but the client
            # may still give it
            server_filled = (col.server_default is not None and col.default is None) or (
                col.primary_key and (col.autoincrement is True or col.default is not None)
            )
            if create and server_filled:
                continue
            try:
                py: Any = col.type.python_type
            except NotImplementedError:
                py = Any
            if py is datetime and server_filled:
                py = datetime | None
            optional = col.nullable and not col.primary_key
            fields[col.key] = (py | None, None) if optional else (py, ...)
        relations = frozenset() if create else frozenset(r.key for r in entity.__mapper__.relationships)
        for r in relations:
            fields[r] = (Any, None)
        model = create_model(f"{entity.__name__}{'Create' if create else ''}", __base__=EntitySchema, **fields)
        model.relations = relations
        _schemas[key] = model
    return _schemas[key]

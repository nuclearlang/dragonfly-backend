"""ADR-0100: relations, explicit loading, pagination and transactions over SQLite in memory."""

from __future__ import annotations

from typing import Any

from dragonfly import (
    AppConfig, AppError, Conflict, Entity, Err, Mapped, Ok, Page, Repository, Result, SQLite, column, controller,
    create_app, get, inject, many_to_many, many_to_one, one_to_many, primary, transactional,
)
from dragonfly.testing import client, memory_database


class Project(Entity):
    __tablename__ = "projects"
    id: Mapped[int] = primary(generated=True)
    name: Mapped[str] = column()
    tasks: Mapped[list[Task]] = one_to_many("Task", "project")


class Task(Entity):
    __tablename__ = "tasks"
    id: Mapped[int] = primary(generated=True)
    title: Mapped[str] = column()
    project: Mapped[Project | None] = many_to_one("Task", "project_id", "projects.id", "tasks", "cascade")
    project_id: Mapped[int] = column()
    tags: Mapped[list[Tag]] = many_to_many("Task", "tags", "Tag", "tasks", join=True)


class Tag(Entity):
    __tablename__ = "tags"
    id: Mapped[str] = primary(generated=True, uuid_key=True)
    label: Mapped[str] = column()
    tasks: Mapped[list[Task]] = many_to_many("Tag", "tasks", "Task", "tags")


class ProjectRepository(Repository[Project]):
    pass


class TaskRepository(Repository[Task]):
    pass


class TagRepository(Repository[Tag]):
    pass


class MoveTasks:
    def __init__(self, tasks: TaskRepository, projects: ProjectRepository) -> None:
        self.tasks = tasks
        self.projects = projects

    @transactional
    async def exec(self, source: int, target: int, fail: bool) -> Result[AppError, int]:
        moved = await self.tasks.where({"projectId": source}).update({"projectId": target})
        await self.projects.save(Project(name="audit"))
        if fail:
            return Err(Conflict("rolled back"))
        return Ok(moved)


@controller("projects")
class ProjectController:
    def __init__(self, projects: ProjectRepository, tasks: TaskRepository) -> None:
        self.projects = projects
        self.tasks = tasks

    @get("{id}")
    async def one(self, id: int) -> Result[AppError, Project]:
        return await self.projects.where({"id": id}).relations("tasks.tags").get_one()

    @get("{id}/plain")
    async def plain(self, id: int) -> Result[AppError, Project]:
        return await self.projects.find(id)

    @get("tasks/page/{page}")
    async def page(self, page: int) -> Page[Task]:
        return await self.tasks.query().order_by("id").paginate(page, 2)


class Config(AppConfig):
    connections = [SQLite("unused.db")]


async def test_relations_pages_and_transactions() -> None:
    app = create_app(Config(), controllers=[ProjectController])
    async with client(app, Config(), memory_database()) as http:
        projects, tasks, tags = inject(ProjectRepository), inject(TaskRepository), inject(TagRepository)
        home = await projects.save(Project(name="home"))
        work = await projects.save(Project(name="work"))
        urgent = await tags.save(Tag(label="urgent"))
        assert len(urgent.id) == 36
        for i in range(5):
            t = Task(title=f"t{i}", project_id=home.id)
            if i == 0:
                t.tags = [urgent]
            await tasks.save(t)

        body: dict[str, Any] = (await http.get(f"/projects/{home.id}")).json()
        assert [t["title"] for t in body["tasks"]] == ["t0", "t1", "t2", "t3", "t4"]
        assert body["tasks"][0]["tags"][0]["label"] == "urgent"
        assert "project" not in body["tasks"][0]  # not loaded: absent, not null
        assert "tasks" not in (await http.get(f"/projects/{home.id}/plain")).json()

        page = (await http.get("/projects/tasks/page/3")).json()
        assert page == {"items": page["items"], "page": 3, "size": 2, "total": 5, "pages": 3}
        assert [t["title"] for t in page["items"]] == ["t4"]

        move = MoveTasks(tasks, projects)
        failed = await move.exec(home.id, work.id, fail=True)
        assert failed.is_err
        assert await tasks.where({"projectId": home.id}).count() == 5  # rolled back
        assert await projects.count() == 2
        done = await move.exec(home.id, work.id, fail=False)
        assert done.is_ok and done.value == 5
        assert await projects.count() == 3

        await projects.remove(work.id)  # ON DELETE CASCADE
        assert await tasks.count() == 0

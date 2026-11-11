// ADR-0100: relations, explicit loading, pagination and transactions over SQLite in memory (the same as
// packages/dragonfly-py/tests/test_data.py).
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AutoIncrement, BelongsTo, BelongsToMany, Column, DataType, HasMany, PrimaryKey, Sequelize, Table,
} from 'sequelize-typescript';
import { AppError, Conflict, Entity, Err, Ok, Repository, Result, joinTable, transactional } from '../src/index.js';

@Table({ tableName: 'projects', underscored: true, timestamps: false })
class Project extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;
  @HasMany(() => Task, { foreignKey: 'projectId', constraints: false })
  declare tasks?: Task[];
}

@Table({ tableName: 'tasks', underscored: true, timestamps: false })
class Task extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING, allowNull: false })
  declare title: string;
  @BelongsTo(() => Project, { foreignKey: 'projectId', onDelete: 'cascade' })
  declare project?: Project;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare projectId?: number;
  @BelongsToMany(() => Tag, joinTable('tasks_tags', 'task_id', 'tag_id'))
  declare tags?: Tag[];
}

@Table({ tableName: 'tags', underscored: true, timestamps: false })
class Tag extends Entity {
  @PrimaryKey
  @Column({ type: DataType.STRING(36), defaultValue: DataType.UUIDV4 })
  declare id: string;
  @Column({ type: DataType.STRING, allowNull: false })
  declare label: string;
  @BelongsToMany(() => Task, joinTable('tasks_tags', 'tag_id', 'task_id'))
  declare tasks?: Task[];
}

class MoveTasks {
  constructor(readonly tasks: Repository<Task>, readonly projects: Repository<Project>) {}

  @transactional
  async exec(source: number, target: number, fail: boolean): Promise<Result<AppError, number>> {
    const moved = await this.tasks.where({ projectId: source }).update({ projectId: target });
    await this.projects.save(new Project({ name: 'audit' }));
    if (fail) return Err(new Conflict('rolled back'));
    return Ok(moved);
  }
}

describe('data (ADR-0100)', () => {
  it('loads relations explicitly, pages, and rolls a transaction back', async () => {
    const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false, models: [Project, Task, Tag] });
    await db.sync();
    const projects = new Repository(Project);
    const tasks = new Repository(Task);
    const tags = new Repository(Tag);
    const home = await projects.save(new Project({ name: 'home' }));
    const work = await projects.save(new Project({ name: 'work' }));
    const urgent = await tags.save(new Tag({ label: 'urgent' }));
    assert.equal(urgent.id.length, 36);
    for (let i = 0; i < 5; i++) {
      await tasks.save(new Task({ title: `t${i}`, projectId: home.id, ...(i === 0 ? { tags: [urgent] } : {}) }));
    }
    const join = await db.getQueryInterface().describeTable('tasks_tags');
    assert.deepEqual(Object.keys(join).sort(), ['tag_id', 'task_id']);

    const loaded = (await projects.where({ id: home.id }).relations('tasks.tags').getOne()).value;
    const body = JSON.parse(JSON.stringify(loaded)) as { tasks: { title: string; tags: { label: string }[] }[] };
    assert.deepEqual(body.tasks.map((t) => t.title), ['t0', 't1', 't2', 't3', 't4']);
    assert.equal(body.tasks[0].tags[0].label, 'urgent');
    assert.ok(!('project' in body.tasks[0])); // not loaded: absent, not null
    assert.ok(!('tasks' in JSON.parse(JSON.stringify((await projects.find(home.id)).value))));

    const page = await tasks.query().orderBy('id').paginate(3, 2);
    assert.deepEqual([page.page, page.size, page.total, page.pages], [3, 2, 5, 3]);
    assert.deepEqual(page.items.map((t) => t.title), ['t4']);

    const move = new MoveTasks(tasks, projects);
    assert.ok((await move.exec(home.id, work.id, true)).isErr);
    assert.equal(await tasks.where({ projectId: home.id }).count(), 5); // rolled back
    assert.equal(await projects.count(), 2);
    const done = await move.exec(home.id, work.id, false);
    assert.equal(done.value, 5);
    assert.equal(await projects.count(), 3);

    await projects.remove(work.id); // ON DELETE CASCADE
    assert.equal(await tasks.count(), 0);
    await db.close();
  });
});

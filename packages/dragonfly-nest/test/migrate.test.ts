// ADR-0100 §5: migrations from the entities, compared with the last migration, applied to and reverted from SQLite
// (the same steps as packages/dragonfly-py/tests/test_migrate.py).
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AutoIncrement, BelongsTo, Column, DataType, PrimaryKey, Sequelize, Table } from 'sequelize-typescript';
import { Entity } from '../src/index.js';
import { down, make, up } from '../src/migrate.js';

// the first version of the app: projects and their tasks
@Table({ tableName: 'projects', underscored: true, timestamps: false })
class Project extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare name: string;
}

@Table({ tableName: 'tasks', underscored: true, timestamps: false })
class Task extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare title: string;
  @BelongsTo(() => Project, { foreignKey: 'projectId', onDelete: 'cascade' })
  declare project?: Project;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare projectId?: number;
}

// the second: a task gets `done`, its title gets longer
@Table({ tableName: 'tasks', underscored: true, timestamps: false })
class TaskV2 extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING(300), allowNull: false })
  declare title: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare done: boolean;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare projectId?: number;
}

describe('migrations', () => {
  it('make, up and down follow the entities and keep the data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dragonfly-migrations-'));
    const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    try {
      const first = await make(dir, 'projects and tasks', [Project, Task], new Date(2026, 10, 10, 10, 0, 0));
      assert.ok(first?.endsWith('20261110100000_projects_and_tasks.js'));
      // created in the order of their references: projects before tasks
      const text = readFileSync(first!, 'utf8');
      assert.ok(text.indexOf("createTable(\"projects\"") < text.indexOf("createTable(\"tasks\""));
      assert.match(text, /references: \{model: "projects",key: "id"\}|references: \{ ?model: "projects"/);
      assert.equal(await make(dir, 'nothing', [Project, Task]), null, 'no changes, no migration');

      assert.deepEqual(await up(dir, db), ['20261110100000_projects_and_tasks.js']);
      const q = db.getQueryInterface();
      await q.bulkInsert('projects', [{ id: 1, name: 'home' }]);
      await q.bulkInsert('tasks', [{ id: 1, title: 'paint', project_id: 1 }]);

      const second = await make(dir, 'Done tasks!', [Project, TaskV2], new Date(2026, 10, 10, 11, 0, 0));
      assert.ok(second?.endsWith('20261110110000_done_tasks.js'));
      assert.deepEqual(await up(dir, db), ['20261110110000_done_tasks.js']);
      assert.deepEqual(await up(dir, db), [], 'nothing pending');
      const columns = await q.describeTable('tasks');
      assert.ok('done' in columns);
      const [row] = (await db.query('SELECT title, done FROM tasks', { type: 'SELECT' })) as { title: string; done: number }[];
      assert.equal(row.title, 'paint', 'the data stays');
      assert.equal(Number(row.done), 0);

      assert.equal(await down(dir, db), '20261110110000_done_tasks.js');
      assert.ok(!('done' in (await q.describeTable('tasks'))));
      assert.equal(await down(dir, db), '20261110100000_projects_and_tasks.js');
      assert.equal(await down(dir, db), null);
      assert.deepEqual((await q.showAllTables()).filter((t) => t !== 'SequelizeMeta'), []);
      assert.equal(readdirSync(dir).length, 2);
    } finally {
      await db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { AppModule } from '../src/app.module.js';
import { TaskTools } from '../src/components/assistant/ai/task_tools.js';
import { Task } from '../src/components/tasks/data/entities/task.js';
import { NewProject, NewTask, TaskChanges } from '../src/components/tasks/domain/models/task_models.js';
import { TaskEvents } from '../src/components/tasks/events/task_events.js';
import { TasksAppComponent } from '../src/components/tasks/tasks_appcomponent.js';
import { INestApplication } from '@nestjs/common';
import { inject } from 'dragonfly-nest';
import { startTestApp, stopTestApp } from 'dragonfly-nest/testing';
import { afterEach, beforeEach, describe, it } from 'node:test';

import assert from 'node:assert/strict';

describe('Tasks', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await startTestApp(AppModule);
  });

  afterEach(async () => {
    await stopTestApp(app);
  });

  it('creates, changes, lists and deletes a task', async () => {
    const tasks = inject(TasksAppComponent);
    const made = await tasks.create(new NewTask({ title: 'buy milk', priority: 1 }));
    assert.ok(made.isOk);
    const id = made.value.id;
    const changed = await tasks.update(id, new TaskChanges({ done: true }));
    assert.ok(changed.value.done);
    const pending = await tasks.list(false);
    assert.ok(pending.value.length === 0);
    const removed = await tasks.remove(id);
    assert.ok(removed.isOk);
    const again = await tasks.task(id);
    assert.ok(again.error.status === 404);
  });

  it('a repeated title is a conflict', async () => {
    const tasks = inject(TasksAppComponent);
    await tasks.create(new NewTask({ title: 'call mom' }));
    const again = await tasks.create(new NewTask({ title: 'call mom' }));
    assert.ok(again.error.status === 409);
  });

  it('a new task is published to the listeners', async () => {
    const tasks = inject(TasksAppComponent);
    await tasks.create(new NewTask({ title: 'write the report' }));
    const events = inject(TaskEvents);
    assert.ok(events.created.includes('write the report'));
  });

  it('the tools read and change the tasks', async () => {
    const tools = inject(TaskTools);
    assert.ok(await tools.pendingTasks() === 'there are no pending tasks');
    assert.ok((await tools.addTask('pay the rent', 1)).startsWith('created task'));
    assert.ok((await tools.pendingTasks()).includes('pay the rent'));
    assert.ok((await tools.completeTask(1)).startsWith('task 1 is done'));
    const all: any[] = tools.tools();
    assert.ok(all.length === 3);
  });

  it('a project has its tasks; closing it moves them in one transaction', async () => {
    const tasks = inject(TasksAppComponent);
    const home = (await tasks.addProject(new NewProject({ name: 'home' }))).value;
    const work = (await tasks.addProject(new NewProject({ name: 'work' }))).value;
    await tasks.create(new NewTask({ title: 'paint the door', projectId: home.id }));
    const loaded = await tasks.project(home.id);
    assert.ok(loaded.value.tasks!.length === 1);
    const missing = await tasks.close(home.id, 999);
    assert.ok(missing.error.status === 404);
    assert.ok((await tasks.project(home.id)).isOk);
    const closed = await tasks.close(home.id, work.id);
    assert.ok(closed.value.count === 1);
    assert.ok((await tasks.project(home.id)).error.status === 404);
    assert.ok((await tasks.project(work.id)).value.tasks!.length === 1);
  });

  it('the tasks come in pages', async () => {
    const tasks = inject(TasksAppComponent);
    for (const title of ['one', 'two', 'three']) {
      await tasks.create(new NewTask({ title: title }));
    }
    const first = (await tasks.page(1, 2)).value;
    const items: Task[] = first.items;
    assert.ok(items.length === 2);
    assert.ok(first.total === 3);
    assert.ok(first.pages === 2);
  });
});

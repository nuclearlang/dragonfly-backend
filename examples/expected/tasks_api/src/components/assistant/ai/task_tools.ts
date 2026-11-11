import { Task } from '../../tasks/data/entities/task.js';
import { NewTask, TaskChanges } from '../../tasks/domain/models/task_models.js';
import { TasksAppComponent } from '../../tasks/tasks_appcomponent.js';
import { StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { Tools } from 'dragonfly-nest/ai';
import { tool } from 'langchain';
import { describe } from 'node:test';
import { z } from 'zod';

/** The tools the assistant uses to read and change the tasks (through the tasks component). */
@Injectable()
export class TaskTools extends Tools {
  constructor(private readonly tasks: TasksAppComponent) {
    super();
  }

  /** Lists the pending tasks, one per line: id, priority (1 high, 2 normal, 3 low) and title. */
  async pendingTasks(): Promise<string> {
    const listResult = await this.tasks.list(false);
    if (listResult.isOk) {
      return this.describe(listResult.value);
    } else {
      return listResult.error.message;
    }
  }

  /** Creates a task with a title and a priority (1 high, 2 normal, 3 low). */
  async addTask(title: string, priority: number = 2): Promise<string> {
    const createResult = await this.tasks.create(new NewTask({ title: title, priority: priority }));
    if (createResult.isOk) {
      return `created task ${createResult.value.id}: ${createResult.value.title}`;
    } else {
      return createResult.error.message;
    }
  }

  /** Marks the task with that id as done. */
  async completeTask(id: number): Promise<string> {
    const updateResult = await this.tasks.update(id, new TaskChanges({ done: true }));
    if (updateResult.isOk) {
      return `task ${updateResult.value.id} is done: ${updateResult.value.title}`;
    } else {
      return updateResult.error.message;
    }
  }

  describe(found: Task[]): string {
    if (found.length === 0) {
      return 'there are no pending tasks';
    }
    return found.map((task: Task) => `${task.id} · priority ${task.priority} · ${task.title}`).join('\n');
  }

  /** The tools the model can call: the methods with a doc comment. */
  tools(): StructuredToolInterface[] {
    return [
      tool(async () => this.pendingTasks(), {
        name: 'pendingTasks',
        description: 'Lists the pending tasks, one per line: id, priority (1 high, 2 normal, 3 low) and title.',
        schema: z.object({  }),
      }),
      tool(async ({ title, priority }) => this.addTask(title, priority), {
        name: 'addTask',
        description: 'Creates a task with a title and a priority (1 high, 2 normal, 3 low).',
        schema: z.object({ title: z.string(), priority: z.number().int().optional() }),
      }),
      tool(async ({ id }) => this.completeTask(id), {
        name: 'completeTask',
        description: 'Marks the task with that id as done.',
        schema: z.object({ id: z.number().int() }),
      }),
    ];
  }
}

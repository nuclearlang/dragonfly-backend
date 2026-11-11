import { Task } from '../../data/entities/task.js';
import { TaskRepository } from '../../data/repositories/task_repository.js';
import { TaskChanges } from '../models/task_models.js';
import { Injectable } from '@nestjs/common';
import { AppError, Err, Ok, Result } from 'dragonfly-nest';

/** Changes the fields that come in `changes`. */
@Injectable()
export class UpdateTask {
  constructor(private readonly tasks: TaskRepository) {}

  async exec(id: number, changes: TaskChanges): Promise<Result<AppError, Task>> {
    const taskResult = await this.tasks.find(id);
    if (taskResult.isErr) return Err(taskResult.error);
    const task = taskResult.value;
    if (changes.title != null) {
      task.title = changes.title;
    }
    if (changes.done != null) {
      task.done = changes.done;
    }
    if (changes.priority != null) {
      task.priority = changes.priority;
    }
    return Ok(await this.tasks.save(task));
  }
}

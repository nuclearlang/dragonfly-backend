import { Task } from '../../data/entities/task.js';
import { TaskRepository } from '../../data/repositories/task_repository.js';
import { NewTask } from '../models/task_models.js';
import { Injectable } from '@nestjs/common';
import { AppError, Conflict, Err, Ok, Result } from 'dragonfly-nest';
import { publish } from 'dragonfly-nest/events';

/** Creates a task; two tasks cannot have the same title. Every new task is published on "tasks.created". */
@Injectable()
export class CreateTask {
  constructor(private readonly tasks: TaskRepository) {}

  async exec(input: NewTask): Promise<Result<AppError, Task>> {
    const taken = await this.tasks.where({ 'title': input.title }).exists();
    if (taken) {
      return Err(new Conflict(`there is already a task '${input.title}'`));
    }
    const task = await this.tasks.save(new Task({ title: input.title, priority: input.priority, projectId: input.projectId }));
    await publish('tasks.created', { 'id': task.id, 'title': task.title });
    return Ok(task);
  }
}

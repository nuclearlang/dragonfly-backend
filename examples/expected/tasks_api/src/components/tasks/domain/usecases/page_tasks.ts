import { Task } from '../../data/entities/task.js';
import { TaskRepository } from '../../data/repositories/task_repository.js';
import { Injectable } from '@nestjs/common';
import { AppError, Ok, Page, Result } from 'dragonfly-nest';

/** One page of the tasks (page from 1). */
@Injectable()
export class PageTasks {
  constructor(private readonly tasks: TaskRepository) {}

  async exec(page: number, size: number): Promise<Result<AppError, Page<Task>>> {
    return Ok(await this.tasks.page(page, size));
  }
}

import { Task } from '../../data/entities/task.js';
import { TaskRepository } from '../../data/repositories/task_repository.js';
import { Injectable } from '@nestjs/common';
import { AppError, Ok, Result } from 'dragonfly-nest';

/** Every task, or only the pending (done = false) or finished ones. */
@Injectable()
export class ListTasks {
  constructor(private readonly tasks: TaskRepository) {}

  async exec(done?: boolean): Promise<Result<AppError, Task[]>> {
    if (done == null) {
      return Ok(await this.tasks.findAll());
    }
    return Ok(await this.tasks.byState(done));
  }
}

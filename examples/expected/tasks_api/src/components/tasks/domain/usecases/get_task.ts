import { Task } from '../../data/entities/task.js';
import { TaskRepository } from '../../data/repositories/task_repository.js';
import { Injectable } from '@nestjs/common';
import { AppError, Result } from 'dragonfly-nest';

@Injectable()
export class GetTask {
  constructor(private readonly tasks: TaskRepository) {}

  async exec(id: number): Promise<Result<AppError, Task>> {
    return await this.tasks.find(id);
  }
}

import { TaskRepository } from '../../data/repositories/task_repository.js';
import { Removed } from '../models/task_models.js';
import { Injectable } from '@nestjs/common';
import { AppError, Err, NotFound, Ok, Result } from 'dragonfly-nest';

@Injectable()
export class DeleteTask {
  constructor(private readonly tasks: TaskRepository) {}

  async exec(id: number): Promise<Result<AppError, Removed>> {
    const removed = await this.tasks.remove(id);
    if (!removed) {
      return Err(new NotFound(`task ${id} not found`));
    }
    return Ok(new Removed({ id: id }));
  }
}

import { ProjectRepository } from '../../data/repositories/project_repository.js';
import { TaskRepository } from '../../data/repositories/task_repository.js';
import { Moved } from '../models/task_models.js';
import { Injectable } from '@nestjs/common';
import { AppError, Err, NotFound, Ok, Result, transactional } from 'dragonfly-nest';

/** Closes a project: its tasks move to another one and it is removed, all in one transaction. */
@Injectable()
export class CloseProject {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly projects: ProjectRepository,
  ) {}

  @transactional
  async exec(id: number, into: number): Promise<Result<AppError, Moved>> {
    const findResult = await this.projects.find(into);
    if (findResult.isErr) return Err(findResult.error);
    const moved = await this.tasks.move(id, into);
    const removed = await this.projects.remove(id);
    if (!removed) {
      return Err(new NotFound(`project ${id} not found`));
    }
    return Ok(new Moved({ count: moved }));
  }
}

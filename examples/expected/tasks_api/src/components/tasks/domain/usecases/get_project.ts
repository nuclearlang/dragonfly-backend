import { Project } from '../../data/entities/project.js';
import { ProjectRepository } from '../../data/repositories/project_repository.js';
import { Injectable } from '@nestjs/common';
import { AppError, Result } from 'dragonfly-nest';

/** A project with its tasks and their tags. */
@Injectable()
export class GetProject {
  constructor(private readonly projects: ProjectRepository) {}

  async exec(id: number): Promise<Result<AppError, Project>> {
    return await this.projects.withTasks(id);
  }
}

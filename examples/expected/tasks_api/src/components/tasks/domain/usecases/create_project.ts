import { Project } from '../../data/entities/project.js';
import { ProjectRepository } from '../../data/repositories/project_repository.js';
import { NewProject } from '../models/task_models.js';
import { Injectable } from '@nestjs/common';
import { AppError, Ok, Result } from 'dragonfly-nest';

@Injectable()
export class CreateProject {
  constructor(private readonly projects: ProjectRepository) {}

  async exec(input: NewProject): Promise<Result<AppError, Project>> {
    return Ok(await this.projects.save(new Project({ name: input.name })));
  }
}

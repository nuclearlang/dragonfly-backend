import { Project } from '../entities/project.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AppError, Repository, Result } from 'dragonfly-nest';

/** The projects table. */
@Injectable()
export class ProjectRepository extends Repository<Project> {
  constructor(@InjectModel(Project) model: typeof Project) {
    super(model);
  }

  /** A project with its tasks and their tags. */
  withTasks(id: number): Promise<Result<AppError, Project>> {
    const q = this.query();
    q.where({ 'id': id });
    q.relations('tasks.tags');
    return q.getOne();
  }
}

import { Project } from '../data/entities/project.js';
import { Moved, NewProject } from '../domain/models/task_models.js';
import { TasksAppComponent } from '../tasks_appcomponent.js';
import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { AppError, Result } from 'dragonfly-nest';

/** Projects: POST /projects, GET /projects/:id (with its tasks and their tags), POST /projects/:id/close/:into. */
@Controller('projects')
export class ProjectsController {
  constructor(private readonly tasks: TasksAppComponent) {}

  @Post()
  async create(@Body() input: NewProject): Promise<Result<AppError, Project>> {
    return await this.tasks.addProject(input);
  }

  @Get(':id')
  async one(@Param('id', ParseIntPipe) id: number): Promise<Result<AppError, Project>> {
    return await this.tasks.project(id);
  }

  @Post(':id/close/:into')
  @HttpCode(200)
  async close(@Param('id', ParseIntPipe) id: number, @Param('into', ParseIntPipe) into: number): Promise<Result<AppError, Moved>> {
    return await this.tasks.close(id, into);
  }
}

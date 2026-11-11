import { Project } from './data/entities/project.js';
import { Task } from './data/entities/task.js';
import { Moved, NewProject, NewTask, Removed, TaskChanges } from './domain/models/task_models.js';
import { CloseProject } from './domain/usecases/close_project.js';
import { CreateProject } from './domain/usecases/create_project.js';
import { CreateTask } from './domain/usecases/create_task.js';
import { DeleteTask } from './domain/usecases/delete_task.js';
import { GetProject } from './domain/usecases/get_project.js';
import { GetTask } from './domain/usecases/get_task.js';
import { ListTasks } from './domain/usecases/list_tasks.js';
import { PageTasks } from './domain/usecases/page_tasks.js';
import { UpdateTask } from './domain/usecases/update_task.js';
import { Injectable } from '@nestjs/common';
import { AppError, Page, Result } from 'dragonfly-nest';

/** What the rest of the app (the API and the assistant) sees of tasks. */
@Injectable()
export class TasksAppComponent {
  constructor(
    private readonly listTasks: ListTasks,
    private readonly pageTasks: PageTasks,
    private readonly getTask: GetTask,
    private readonly createTask: CreateTask,
    private readonly updateTask: UpdateTask,
    private readonly deleteTask: DeleteTask,
    private readonly getProject: GetProject,
    private readonly createProject: CreateProject,
    private readonly closeProject: CloseProject,
  ) {}

  async list(done?: boolean): Promise<Result<AppError, Task[]>> {
    return await this.listTasks.exec(done);
  }

  async page(page: number, size: number): Promise<Result<AppError, Page<Task>>> {
    return await this.pageTasks.exec(page, size);
  }

  async task(id: number): Promise<Result<AppError, Task>> {
    return await this.getTask.exec(id);
  }

  async create(input: NewTask): Promise<Result<AppError, Task>> {
    return await this.createTask.exec(input);
  }

  async update(id: number, changes: TaskChanges): Promise<Result<AppError, Task>> {
    return await this.updateTask.exec(id, changes);
  }

  async remove(id: number): Promise<Result<AppError, Removed>> {
    return await this.deleteTask.exec(id);
  }

  async project(id: number): Promise<Result<AppError, Project>> {
    return await this.getProject.exec(id);
  }

  async addProject(input: NewProject): Promise<Result<AppError, Project>> {
    return await this.createProject.exec(input);
  }

  async close(id: number, into: number): Promise<Result<AppError, Moved>> {
    return await this.closeProject.exec(id, into);
  }
}

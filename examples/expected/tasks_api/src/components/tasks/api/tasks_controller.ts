import { Task } from '../data/entities/task.js';
import { NewTask, Removed, TaskChanges } from '../domain/models/task_models.js';
import { TasksAppComponent } from '../tasks_appcomponent.js';
import { Body, Controller, Delete, Get, Param, ParseBoolPipe, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { AppError, Page, Result } from 'dragonfly-nest';

/**
 * The CRUD of tasks: GET /tasks?done=false, GET /tasks/page?page=1&size=20, GET /tasks/:id, POST /tasks,
 * PATCH /tasks/:id, DELETE /tasks/:id.
 */
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksAppComponent) {}

  @Get()
  async all(@Query('done', new ParseBoolPipe({ optional: true })) done?: boolean): Promise<Result<AppError, Task[]>> {
    return await this.tasks.list(done);
  }

  @Get('page')
  async paged(@Query('page', new ParseIntPipe({ optional: true })) page: number, @Query('size', new ParseIntPipe({ optional: true })) size: number): Promise<Result<AppError, Page<Task>>> {
    return await this.tasks.page(page, size);
  }

  @Get(':id')
  async one(@Param('id', ParseIntPipe) id: number): Promise<Result<AppError, Task>> {
    return await this.tasks.task(id);
  }

  @Post()
  async create(@Body() input: NewTask): Promise<Result<AppError, Task>> {
    return await this.tasks.create(input);
  }

  @Patch(':id')
  async change(@Param('id', ParseIntPipe) id: number, @Body() changes: TaskChanges): Promise<Result<AppError, Task>> {
    return await this.tasks.update(id, changes);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<Result<AppError, Removed>> {
    return await this.tasks.remove(id);
  }
}

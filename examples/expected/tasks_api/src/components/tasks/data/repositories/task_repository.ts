import { Task } from '../entities/task.js';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AppError, Page, Repository, Result } from 'dragonfly-nest';

/** The tasks table: find, findAll, save and remove come with the kind. */
@Injectable()
export class TaskRepository extends Repository<Task> {
  constructor(@InjectModel(Task) model: typeof Task) {
    super(model);
  }

  byState(done: boolean): Promise<Task[]> {
    const q = this.query();
    q.where({ 'done': done });
    q.orderBy('priority');
    return q.getMany();
  }

  byTitle(title: string): Promise<Result<AppError, Task>> {
    const q = this.query();
    q.where({ 'title': title });
    return q.getOne();
  }

  /** One page of every task, the newest last. */
  page(page: number, size: number): Promise<Page<Task>> {
    const q = this.query();
    q.orderBy('id');
    return q.paginate(page, size);
  }

  /** Moves the tasks of one project to another; the number moved. */
  move(source: number, target: number): Promise<number> {
    const q = this.query();
    q.where({ 'projectId': source });
    return q.update({ 'projectId': target });
  }
}

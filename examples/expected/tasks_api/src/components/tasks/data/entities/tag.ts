import { Task } from './task.js';
import { Entity, joinTable } from 'dragonfly-nest';
import { AutoIncrement, BelongsToMany, Column, DataType, PrimaryKey, Table } from 'sequelize-typescript';

/** A label of tasks (table tags); a task has many tags and a tag many tasks (table tasks_tags). */
@Table({
  tableName: 'tags',
  underscored: true,
  timestamps: false,
})
export class Tag extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING(50), allowNull: false, unique: true })
  declare label: string;
  @BelongsToMany(() => Task, joinTable('tasks_tags', 'tag_id', 'task_id'))
  declare tasks?: Task[];
}

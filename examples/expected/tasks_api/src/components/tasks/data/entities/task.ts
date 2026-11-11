import { Project } from './project.js';
import { Tag } from './tag.js';
import { Entity, Related, joinTable } from 'dragonfly-nest';
import { AutoIncrement, BelongsTo, BelongsToMany, Column, CreatedAt, DataType, PrimaryKey, Table } from 'sequelize-typescript';

/** A task (table tasks), maybe in a project and with tags. */
@Table({
  tableName: 'tasks',
  underscored: true,
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: false,
})
export class Task extends Entity {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare title: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare done: boolean;
  /** 1 high, 2 normal, 3 low */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 2 })
  declare priority: number;
  @CreatedAt
  declare createdAt?: Date;
  /** its project, loaded with relations("project"); projectId is its column */
  @BelongsTo(() => Project, { foreignKey: 'projectId', onDelete: 'cascade' })
  declare project?: Related<Project>;
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare projectId?: number;
  @BelongsToMany(() => Tag, joinTable('tasks_tags', 'task_id', 'tag_id'))
  declare tags?: Tag[];
}

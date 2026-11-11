import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** What the API receives to create a task. */
export class NewTask {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
  @IsInt()
  @Min(1)
  @Max(3)
  priority: number = 2;
  @IsOptional()
  @IsInt()
  projectId?: number;

  constructor(values: Partial<NewTask> = {}) {
    Object.assign(this, values);
  }
}

/** The changes of a task: only the fields that come are changed. */
export class TaskChanges {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
  @IsOptional()
  @IsBoolean()
  done?: boolean;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  priority?: number;

  constructor(values: Partial<TaskChanges> = {}) {
    Object.assign(this, values);
  }
}

/** The answer of a delete. */
export class Removed {
  @IsInt()
  id!: number;

  constructor(values: Partial<Removed> = {}) {
    Object.assign(this, values);
  }
}

/** What the API receives to create a project. */
export class NewProject {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  constructor(values: Partial<NewProject> = {}) {
    Object.assign(this, values);
  }
}

/** How many tasks a close moved. */
export class Moved {
  @IsInt()
  count!: number;

  constructor(values: Partial<Moved> = {}) {
    Object.assign(this, values);
  }
}

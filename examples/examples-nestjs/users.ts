import { Body, Controller, Get, Injectable, Param, ParseIntPipe, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AppError, Err, NotFound, Ok, Result } from 'dragonfly-nest';

// nestjs dialect (Dragonfly for NestJS) in one file: a DTO, a service and a controller.
// In a project (nuclear.toml) the same kinds also get entities, repositories over Sequelize, use cases and the
// Nest modules: examples/examples-nestjs/tasks_api.

/** What the API receives to create a user. */
export class NewUser {
  @IsString()
  @MinLength(2)
  name!: string;
  @IsString()
  @IsEmail()
  email!: string;

  constructor(values: Partial<NewUser> = {}) {
    Object.assign(this, values);
  }
}

export class User {
  constructor(public id: number, public name: string, public email: string) {}
}

/** The users, in memory. */
@Injectable()
export class UsersService {
  users: User[] = [];

  all(): User[] {
    return this.users;
  }

  one(id: number): Result<AppError, User> {
    const found = (this.users.find((u: User) => u.id === id) ?? null);
    if (found == null) {
      return Err(new NotFound(`user ${id} not found`));
    }
    return Ok(found);
  }

  add(input: NewUser): User {
    const user = new User(this.users.length + 1, input.name, input.email);
    this.users.push(user);
    return user;
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  all(): User[] {
    return this.users.all();
  }

  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number): Result<AppError, User> {
    return this.users.one(id);
  }

  @Post()
  create(@Body() input: NewUser): User {
    return this.users.add(input);
  }
}

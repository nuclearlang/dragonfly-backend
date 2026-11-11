// The errors of a use case: each one is the HTTP status a controller answers with.
export class AppError {
  constructor(
    readonly message: string = 'error',
    readonly status: number = 500,
  ) {}
}

export class Invalid extends AppError {
  constructor(message = 'invalid') {
    super(message, 400);
  }
}

export class Unauthorized extends AppError {
  constructor(message = 'unauthorized') {
    super(message, 401);
  }
}

export class Forbidden extends AppError {
  constructor(message = 'forbidden') {
    super(message, 403);
  }
}

export class NotFound extends AppError {
  constructor(message = 'not found') {
    super(message, 404);
  }
}

export class Conflict extends AppError {
  constructor(message = 'conflict') {
    super(message, 409);
  }
}

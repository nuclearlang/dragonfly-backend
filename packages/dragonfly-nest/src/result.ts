// Result<E, T>: the same runtime the typescript dialect writes in a file (dialects/typescript/templates/result.tpl).
// Result<E, T>: an operation that fails with an error E (Err) or succeeds with a value T (Ok)
export class Result<E, T> {
  private constructor(
    readonly isOk: boolean,
    private readonly okValue: T | undefined,
    private readonly errValue: E | undefined,
  ) {}

  static ok<T>(value: T): Result<never, T> {
    return new Result<never, T>(true, value, undefined);
  }

  static err<E>(error: E): Result<E, never> {
    return new Result<E, never>(false, undefined, error);
  }

  get isErr(): boolean {
    return !this.isOk;
  }

  get value(): T {
    if (!this.isOk) throw new Error('Err has no value');
    return this.okValue as T;
  }

  get error(): E {
    if (this.isOk) throw new Error('Ok has no error');
    return this.errValue as E;
  }

  andThen<F, U>(f: (value: T) => Result<F, U>): Result<E | F, U> {
    return this.isOk ? f(this.okValue as T) : Result.err(this.errValue as E);
  }

  orElse<F, U>(f: (error: E) => Result<F, U>): Result<F, T | U> {
    return this.isOk ? Result.ok(this.okValue as T) : f(this.errValue as E);
  }

  map<U>(f: (value: T) => U): Result<E, U> {
    return this.isOk ? Result.ok(f(this.okValue as T)) : Result.err(this.errValue as E);
  }

  getOrElse(f: (error: E) => T): T {
    return this.isOk ? (this.okValue as T) : f(this.errValue as E);
  }

  inspect(f: (value: T) => unknown): Result<E, T> {
    if (this.isOk) f(this.okValue as T);
    return this;
  }

  inspectErr(f: (error: E) => unknown): Result<E, T> {
    if (!this.isOk) f(this.errValue as E);
    return this;
  }
}

export function Ok<T = void>(value?: T): Result<never, T> {
  return Result.ok(value as T);
}

export function Err<E>(error: E): Result<E, never> {
  return Result.err(error);
}

// HTTP: a controller that returns Result<E, T> answers T, or the error's status (AppError) with its message.
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  INestApplication,
  Injectable,
  NestInterceptor,
  ValidationPipe,
} from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Observable, map } from 'rxjs';
import { AppError } from './errors.js';
import { Result } from './result.js';

@Injectable()
export class ResultInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (!(value instanceof Result)) return value;
        const r = value as Result<unknown, unknown>;
        if (r.isOk) return r.value;
        const e = r.error;
        throw new HttpException(e instanceof AppError ? e.message : String(e), e instanceof AppError ? e.status : 500);
      }),
    );
  }
}

/** What every Dragonfly app has: validated bodies (class-validator), Result answers, routes whose order does not
 * matter and the contract it was built with. */
export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new ResultInterceptor());
  fixedRoutesFirst(app);
  serveContract(app);
  return app;
}

/** A fixed segment wins over a parameter whatever the order of a controller's routes (`search` over `:id`): Nest adds
 * the routes in the order of the class's methods, so a method whose path has a parameter earlier is moved later. */
function fixedRoutesFirst(app: INestApplication): void {
  // 'path' is Nest's PATH_METADATA: what @Get, @Post... keep on the method
  const shape = (method: unknown) => String(Reflect.getMetadata('path', method as object)).split('/').filter(Boolean).map((s) => (s.startsWith(':') ? '1' : '0')).join('');
  for (const module of app.get(ModulesContainer).values()) {
    for (const { metatype } of module.controllers.values()) {
      const proto = (metatype as { prototype?: Record<string, unknown> } | null)?.prototype;
      if (!proto) continue;
      const routes = Object.getOwnPropertyNames(proto)
        .map((name) => ({ name, at: Object.getOwnPropertyDescriptor(proto, name)! }))
        .filter(({ at }) => typeof at.value === 'function' && Reflect.hasMetadata('path', at.value as object))
        .map((r) => ({ ...r, shape: shape(r.at.value) }));
      routes.sort((a, b) => (a.shape < b.shape ? -1 : a.shape > b.shape ? 1 : 0));
      for (const { name, at } of routes) {
        delete proto[name];
        Object.defineProperty(proto, name, at);
      }
    }
  }
}

/** GET /.nuclear/contract.json and /.nuclear/openapi.json: what the transpiler wrote next to the app (ADR-0098), so a
 * client project (`contracts(name = "https://...")`) and the editors' HTTP tools read the API as built. */
function serveContract(app: INestApplication): void {
  const server = app.getHttpAdapter().getInstance() as { get?: (path: string, handler: (req: unknown, res: { json(v: unknown): void; status(n: number): { json(v: unknown): void } }) => void) => void };
  if (typeof server.get !== 'function') return;
  for (const name of ['contract', 'openapi']) {
    const file = join('.nuclear', `${name}.json`);
    if (!existsSync(file)) continue;
    server.get(`/.nuclear/${name}.json`, (_req, res) => {
      res.json(JSON.parse(readFileSync(file, 'utf8')));
    });
  }
}

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

/** What every Dragonfly app has: validated bodies (class-validator), Result answers and the contract it was built with. */
export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new ResultInterceptor());
  serveContract(app);
  return app;
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

// Tests: the app with the databases in SQLite in memory (DRAGONFLY_DATABASE=memory) and `inject` working.
import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { register, useApp } from './app.js';
import { Connection } from './config.js';
import { configureApp } from './web.js';

export async function startTestApp(module: Type<unknown>): Promise<INestApplication> {
  // read by Database.sequelize() when the app module asks for its options (forRootAsync)
  process.env.DRAGONFLY_DATABASE = 'memory';
  const ref = await Test.createTestingModule({ imports: [module] }).compile();
  const app = configureApp(ref.createNestApplication({ logger: false }));
  await app.init();
  useApp(app);
  return app;
}

export async function stopTestApp(app: INestApplication | undefined): Promise<void> {
  await app?.close();
  useApp(undefined);
}

/** Puts `connection` in the app's connections (a FakeModel instead of the configured model). */
export function useConnection(c: Connection): void {
  register(c);
}

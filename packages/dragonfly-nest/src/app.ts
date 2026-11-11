// The app: NestFactory with Dragonfly's configuration, the connections opened at start, and `inject` for code that
// is not built by Nest (tests, scripts).
import { INestApplication, Injectable, OnApplicationBootstrap, OnApplicationShutdown, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppConfig, Connection, Database } from './config.js';
import { configureApp } from './web.js';

let current: INestApplication | undefined;
const open: Connection[] = [];

/** The instance Nest built of `cls` (the app must be running). */
export function inject<T>(cls: Type<T>): T {
  if (!current) throw new Error(`inject(${cls.name}): the app is not running`);
  return current.get(cls, { strict: false });
}

/** The open connection of that type and name: connection(Redis), connection(Kafka, 'events'). */
export function connection<C extends Connection>(kind: abstract new (...args: never[]) => C, name = 'default'): C {
  const found = open.find((c): c is C => c instanceof kind && c.name === name) ?? open.find((c): c is C => c instanceof kind);
  if (!found) throw new Error(`no ${kind.name} connection named '${name}' in the configuration`);
  return found;
}

/** The open connections. */
export function connections(): Connection[] {
  return [...open];
}

/** Adds an open connection (tests: a FakeModel), replacing one of the same class and name. */
export function register(c: Connection): void {
  const i = open.findIndex((o) => o.constructor === c.constructor && o.name === c.name);
  if (i >= 0) open.splice(i, 1);
  open.push(c);
}

/** Opens the connections of the configuration that are not the database (Sequelize opens that one). */
@Injectable()
export class Connections implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(private readonly config: AppConfig) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const c of this.config.connections) {
      if (c instanceof Database) continue;
      await c.open();
      open.push(c);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    for (const c of open.splice(0).reverse()) await c.close();
  }
}

/** The Nest app of `module`, configured and remembered for `inject`. */
export async function createApp(module: Type<unknown>): Promise<INestApplication> {
  const app = configureApp(await NestFactory.create(module, { logger: ['error', 'warn', 'log'] }));
  current = app;
  return app;
}

/** Remembers an app built elsewhere (the testing module) for `inject`. */
export function useApp(app: INestApplication | undefined): void {
  current = app;
}

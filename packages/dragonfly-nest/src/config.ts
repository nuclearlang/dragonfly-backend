// Configuration: the connections of the app. `AppConfig.connections` (config/project_config.nuc) lists them; the
// database goes to SequelizeModule.forRoot, the others are opened when the app starts and closed when it stops.
// Values usually come from the environment: env('X', 'default').
import type { SequelizeModuleOptions } from '@nestjs/sequelize';

/** The environment variable `name`, or `fallback`. */
export function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

/** Something the app opens at start and closes at stop. `name` tells two connections of a kind apart. */
export abstract class Connection {
  name = 'default';

  async open(): Promise<void> {}

  async close(): Promise<void> {}
}

export interface DatabaseOptions {
  /** `postgres://user:pass@host:5432/db`, `mysql://...`, `mariadb://...`; SQLite uses `file` instead. */
  url?: string;
  /** SQLite file (`':memory:'` for tests). */
  file?: string;
  /** Creates the entities' tables at start (development). */
  createTables?: boolean;
  logging?: boolean;
  name?: string;
}

/** A SQL database through Sequelize. */
export abstract class Database extends Connection {
  abstract readonly dialect: 'postgres' | 'mysql' | 'sqlite' | 'mariadb';

  constructor(readonly options: DatabaseOptions = {}) {
    super();
    this.name = options.name ?? 'default';
  }

  /** What SequelizeModule.forRoot receives. DRAGONFLY_DATABASE=memory (the tests) uses SQLite in memory. */
  sequelize(): SequelizeModuleOptions {
    if (process.env.DRAGONFLY_DATABASE === 'memory') {
      return { dialect: 'sqlite', storage: ':memory:', autoLoadModels: true, synchronize: true, logging: false };
    }
    return {
      dialect: this.dialect,
      ...(this.options.url ? { uri: this.options.url } : {}),
      ...(this.options.file ? { storage: this.options.file } : {}),
      autoLoadModels: true,
      synchronize: this.options.createTables ?? false,
      logging: this.options.logging ?? false,
    };
  }
}

/** PostgreSQL (pg): new Postgres({ url: env('DATABASE_URL', 'postgres://localhost/app') }). */
export class Postgres extends Database {
  readonly dialect = 'postgres' as const;
}

/** MySQL (mysql2). */
export class MySQL extends Database {
  readonly dialect = 'mysql' as const;
}

/** MariaDB (mariadb). */
export class MariaDB extends Database {
  readonly dialect = 'mariadb' as const;
}

/** SQLite (sqlite3): new SQLite({ file: 'app.sqlite', createTables: true }). */
export class SQLite extends Database {
  readonly dialect = 'sqlite' as const;
}

/** The project configuration (config/project_config.nuc): its connections. */
export abstract class AppConfig {
  abstract readonly connections: Connection[];
}

/** The configuration of one component: connections only it uses. */
export abstract class ComponentConfig {
  readonly connections: Connection[] = [];
}

/** The options of the config's database for SequelizeModule.forRoot (the first Database, or the named one). */
export function databaseOf(config: AppConfig, name = 'default'): SequelizeModuleOptions {
  const db = config.connections.find((c): c is Database => c instanceof Database && c.name === name)
    ?? config.connections.find((c): c is Database => c instanceof Database);
  if (!db) throw new Error('the configuration has no database connection (Postgres, MySQL, MariaDB or SQLite)');
  return db.sequelize();
}

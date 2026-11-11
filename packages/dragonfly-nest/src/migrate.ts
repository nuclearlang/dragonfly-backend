#!/usr/bin/env node
// Migrations of the database schema (ADR-0100 §5), run by `dragonfly migrate` in the generated project once compiled:
//
//   dragonfly-nest-migrate make "add done to tasks" --dir ../migrations   one migration: the entities minus the last one
//   dragonfly-nest-migrate up --dir ../migrations                         applies the pending ones
//   dragonfly-nest-migrate down --dir ../migrations                       reverts the last one
//
// A migration is `<timestamp>_<slug>.js` with `up` and `down` over Sequelize's queryInterface, and `schema`: the tables
// once it is applied, which the next `make` compares the entities with (so `make` never reads the database, as in
// the fastapi dialect). Applied migrations are listed in the table SequelizeMeta, as sequelize-cli and umzug do.
import 'reflect-metadata';
import { existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DataTypes, type ModelAttributeColumnOptions, type QueryInterface } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { type AppConfig, databaseOf } from './config.js';

/** A column as a migration writes it: Sequelize's attribute, reduced to what reaches the database. */
export interface ColumnSchema {
  type: string;
  options?: Record<string, unknown>;
  allowNull: boolean;
  primaryKey?: true;
  autoIncrement?: true;
  unique?: true | string;
  /** a literal, or `{ fn: 'NOW' }` for one of DataTypes' functions */
  defaultValue?: unknown;
  references?: { model: string; key: string };
  onDelete?: string;
  onUpdate?: string;
}

/** Every table of the app and its columns. */
export type Schema = Record<string, Record<string, ColumnSchema>>;

/** One change of the schema and the one that undoes it. */
export interface Change {
  up: string;
  down: string;
  /** a change that loses data (a dropped table or column) */
  drops?: string;
}

const typeName = (type: unknown): string => {
  const name = (type as { constructor: { name: string } }).constructor.name;
  if (!(name in DataTypes)) throw new Error(`a column of type ${name} that migrations do not know`);
  return name;
};

/** The schema of `models` (entity classes): their tables, with the join tables of their many-to-many relations. */
export function schemaOf(models: unknown[]): Schema {
  const s = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false, models: models as never });
  const schema: Schema = {};
  for (const model of Object.values(s.models)) {
    const table = String(model.getTableName());
    const columns: Record<string, ColumnSchema> = {};
    for (const [key, a] of Object.entries(model.getAttributes()) as [string, ModelAttributeColumnOptions][]) {
      const c: ColumnSchema = { type: typeName(a.type), allowNull: a.allowNull ?? !a.primaryKey };
      const options = JSON.parse(JSON.stringify((a.type as { options?: object }).options ?? {}));
      if (Object.keys(options).length) c.options = options;
      if (a.primaryKey) c.primaryKey = true;
      if (a.autoIncrement) c.autoIncrement = true;
      if (a.unique) c.unique = a.unique === true ? true : String(a.unique);
      if (a.defaultValue !== undefined) {
        c.defaultValue = a.defaultValue instanceof DataTypes.ABSTRACT ? { fn: typeName(a.defaultValue) } : a.defaultValue;
      }
      if (a.references && typeof a.references === 'object') {
        const r = a.references as { model: unknown; key?: string };
        c.references = { model: typeof r.model === 'string' ? r.model : String((r.model as { tableName?: string }).tableName ?? r.model), key: r.key ?? 'id' };
      }
      if (a.onDelete) c.onDelete = a.onDelete.toUpperCase();
      if (a.onUpdate) c.onUpdate = a.onUpdate.toUpperCase();
      columns[a.field ?? key] = c;
    }
    schema[table] = columns;
  }
  return schema;
}

const js = (v: unknown): string => JSON.stringify(v).replace(/"([A-Za-z_$][\w$]*)":/g, '$1: ').replace(/,(?=[A-Za-z_$]+: )/g, ', ');

function column(c: ColumnSchema): string {
  const type = c.options ? `Sequelize.DataTypes.${c.type}(${js(c.options)})` : `Sequelize.DataTypes.${c.type}`;
  const parts = [`type: ${type}`, `allowNull: ${c.allowNull}`];
  if (c.primaryKey) parts.push('primaryKey: true');
  if (c.autoIncrement) parts.push('autoIncrement: true');
  if (c.unique) parts.push(`unique: ${js(c.unique)}`);
  if (c.defaultValue !== undefined) {
    const d = c.defaultValue as { fn?: string };
    parts.push(`defaultValue: ${d && typeof d === 'object' && d.fn ? `Sequelize.DataTypes.${d.fn}` : js(c.defaultValue)}`);
  }
  if (c.references) parts.push(`references: ${js(c.references)}`);
  if (c.onDelete) parts.push(`onDelete: ${js(c.onDelete)}`);
  if (c.onUpdate) parts.push(`onUpdate: ${js(c.onUpdate)}`);
  return `{ ${parts.join(', ')} }`;
}

const table = (name: string, columns: Record<string, ColumnSchema>): string =>
  `await queryInterface.createTable(${js(name)}, {\n${Object.entries(columns).map(([n, c]) => `  ${js(n)}: ${column(c)},`).join('\n')}\n});`;

/** The tables of `schema` ordered so a table comes after the ones it references. */
function ordered(schema: Schema, names: string[]): string[] {
  const out: string[] = [];
  const visit = (n: string, path: Set<string>): void => {
    if (out.includes(n) || path.has(n) || !names.includes(n)) return;
    path.add(n);
    for (const c of Object.values(schema[n])) if (c.references) visit(c.references.model, path);
    out.push(n);
  };
  for (const n of [...names].sort()) visit(n, new Set());
  return out;
}

/** What turns `before` into `after`: new tables, new columns, changed columns, dropped columns, dropped tables. */
export function diff(before: Schema, after: Schema): Change[] {
  const changes: Change[] = [];
  const added = ordered(after, Object.keys(after).filter((t) => !(t in before)));
  for (const t of added) changes.push({ up: table(t, after[t]), down: `await queryInterface.dropTable(${js(t)});` });
  for (const t of Object.keys(after).filter((t) => t in before).sort()) {
    const [old, now] = [before[t], after[t]];
    for (const c of Object.keys(now).filter((c) => !(c in old))) {
      changes.push({ up: `await queryInterface.addColumn(${js(t)}, ${js(c)}, ${column(now[c])});`, down: `await queryInterface.removeColumn(${js(t)}, ${js(c)});` });
    }
    for (const c of Object.keys(now).filter((c) => c in old && js(old[c]) !== js(now[c]))) {
      changes.push({
        up: `await queryInterface.changeColumn(${js(t)}, ${js(c)}, ${column(now[c])});`,
        down: `await queryInterface.changeColumn(${js(t)}, ${js(c)}, ${column(old[c])});`,
      });
    }
    for (const c of Object.keys(old).filter((c) => !(c in now))) {
      changes.push({
        up: `await queryInterface.removeColumn(${js(t)}, ${js(c)});`,
        down: `await queryInterface.addColumn(${js(t)}, ${js(c)}, ${column(old[c])});`,
        drops: `column ${t}.${c}`,
      });
    }
  }
  const dropped = ordered(before, Object.keys(before).filter((t) => !(t in after))).reverse();
  for (const t of dropped) changes.push({ up: `await queryInterface.dropTable(${js(t)});`, down: table(t, before[t]), drops: `table ${t}` });
  return changes;
}

/** The text of a migration file. */
export function render(message: string, changes: Change[], schema: Schema): string {
  const indent = (s: string): string => s.split('\n').map((l) => `  ${l}`).join('\n');
  return `// ${message}
// Written by \`dragonfly migrate make\` from the entities; it is the project's from now on (a renamed table or column
// shows as a drop and an add: change it to queryInterface.renameColumn / renameTable to keep the data).

/** @param {import('sequelize').QueryInterface} queryInterface @param {typeof import('sequelize')} Sequelize */
export async function up(queryInterface, Sequelize) {
${changes.map((c) => indent(c.up)).join('\n')}
}

/** @param {import('sequelize').QueryInterface} queryInterface @param {typeof import('sequelize')} Sequelize */
export async function down(queryInterface, Sequelize) {
${[...changes].reverse().map((c) => indent(c.down)).join('\n')}
}

// the tables once this migration is applied: what the next \`dragonfly migrate make\` compares the entities with
export const schema = ${JSON.stringify(schema, null, 2)};
`;
}

const files = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{14}_.*\.js$/.test(f)).sort() : []);

const load = async (dir: string, file: string): Promise<{ up: Function; down: Function; schema?: Schema }> =>
  import(pathToFileURL(join(dir, file)).href);

const slug = (message: string): string => message.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'migration';

// local time, as Alembic names the fastapi dialect's migrations
const stamp = (d = new Date()): string =>
  [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');

/** Writes the migration from the last one to `models`; null when nothing changed. */
export async function make(dir: string, message: string, models: unknown[], now = new Date()): Promise<string | null> {
  const last = files(dir).at(-1);
  const before = last ? ((await load(dir, last)).schema ?? {}) : {};
  const after = schemaOf(models);
  const changes = diff(before, after);
  if (!changes.length) return null;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${stamp(now)}_${slug(message)}.js`);
  writeFileSync(file, render(message, changes, after));
  for (const c of changes.filter((c) => c.drops)) console.warn(`warning: the migration drops ${c.drops}; if it was renamed, edit it`);
  return file;
}

const META = 'SequelizeMeta';

async function applied(q: QueryInterface): Promise<string[]> {
  await q.createTable(META, { name: { type: DataTypes.STRING, allowNull: false, primaryKey: true, unique: true } });
  const rows = (await q.sequelize.query(`SELECT name FROM ${q.quoteIdentifier(META)}`, { type: 'SELECT' })) as { name: string }[];
  return rows.map((r) => r.name);
}

/** Applies the pending migrations; returns their files. */
export async function up(dir: string, sequelize: Sequelize): Promise<string[]> {
  const q = sequelize.getQueryInterface();
  const done = new Set(await applied(q));
  const run: string[] = [];
  for (const f of files(dir).filter((f) => !done.has(f))) {
    await (await load(dir, f)).up(q, Sequelize);
    await q.bulkInsert(META, [{ name: f }]);
    run.push(f);
  }
  return run;
}

/** Reverts the last applied migration; returns its file, or null when none is applied. */
export async function down(dir: string, sequelize: Sequelize): Promise<string | null> {
  const q = sequelize.getQueryInterface();
  const last = (await applied(q)).sort().at(-1);
  if (!last) return null;
  if (!existsSync(join(dir, last))) throw new Error(`the applied migration ${last} is not in ${dir}`);
  await (await load(dir, last)).down(q, Sequelize);
  await q.bulkDelete(META, { name: last });
  return last;
}

/** The database of the app's configuration, without the Nest app (no other connection is opened). */
export function databaseOfApp(config: AppConfig, models: unknown[]): Sequelize {
  const { uri, autoLoadModels: _a, synchronize: _s, ...options } = databaseOf(config) as Record<string, unknown> & { uri?: string };
  const all = { ...options, logging: false, models: models as never };
  return uri ? new Sequelize(uri, all) : new Sequelize(all);
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const flag = (name: string): string | undefined => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const dir = resolve(flag('--dir') ?? '../migrations');
  // the compiled app module lists the entities and the configuration (the dialect's app_module template)
  const app = (await import(pathToFileURL(resolve(flag('--app') ?? 'dist/src/app.module.js')).href)) as { entities: unknown[]; config: AppConfig };
  if (command === 'make') {
    const message = rest.find((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));
    if (!message) throw new Error('usage: make "<what changes>"');
    const file = await make(dir, message, app.entities);
    console.log(file ? `wrote ${file}` : 'no changes: the entities match the last migration');
    return;
  }
  if (command !== 'up' && command !== 'down') throw new Error('usage: dragonfly-nest-migrate make "<message>" | up | down [--dir <folder>]');
  const db = databaseOfApp(app.config, app.entities);
  try {
    if (command === 'up') {
      const run = await up(dir, db);
      console.log(run.length ? run.map((f) => `applied ${f}`).join('\n') : 'the database is up to date');
    } else {
      const last = await down(dir, db);
      console.log(last ? `reverted ${last}` : 'no migration is applied');
    }
  } finally {
    await db.close();
  }
}

// run as a program (npx runs it through node_modules/.bin, a link)
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

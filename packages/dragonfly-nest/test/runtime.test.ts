import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Sequelize } from 'sequelize-typescript';
import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { lastValueFrom, of } from 'rxjs';
import { Err, NotFound, Ok, Repository, ResultInterceptor, gt, oneOf } from '../src/index.js';

@Table({ tableName: 'heroes', timestamps: false })
class Hero extends Model {
  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare power: number;
}

describe('dragonfly-nest', () => {
  it('runs CRUD and queries on a repository', async () => {
    const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false, models: [Hero] });
    await db.sync();
    const repo = new Repository(Hero);
    const rick = await repo.save(new Hero({ name: 'Rick', power: 9 }));
    await repo.save(new Hero({ name: 'Morty', power: 2 }));
    assert.equal((await repo.find(rick.id)).value.name, 'Rick');
    assert.ok((await repo.find(99)).isErr);
    assert.deepEqual((await repo.where({ power: gt(1) }).orderBy('name').getMany()).map((h) => h.name), ['Morty', 'Rick']);
    assert.equal(await repo.where({ name: oneOf(['Rick', 'Morty']) }).count(), 2);
    assert.ok((await repo.where({ name: 'Nobody' }).getOne()).isErr);
    assert.equal(await repo.query().where({ name: 'Morty' }).update({ power: 5 }), 1);
    assert.ok(await repo.remove(rick.id));
    assert.equal(await repo.count(), 1);
    await db.close();
  });

  it('answers a Result: its value, or the error status', async () => {
    const run = (value: unknown) => lastValueFrom(new ResultInterceptor().intercept({} as never, { handle: () => of(value) }));
    assert.equal(await run(Ok(3)), 3);
    await assert.rejects(run(Err(new NotFound('nope'))), (e: { getStatus(): number }) => e.getStatus() === 404);
    assert.equal(await run('plain'), 'plain');
  });
});

import { tool } from 'langchain';
import { z } from 'zod';
import { Annotation } from '@langchain/langgraph';
import { Agent, FakeModel, Graph, Tools, next, start } from '../src/ai.js';
import { Listener, consumer, publish } from '../src/events.js';
import { useConnection } from '../src/testing.js';

class Weather extends Tools {
  tools() {
    return [tool(async ({ city }: { city: string }) => `sunny in ${city}`, { name: 'weather', description: 'The weather of a city.', schema: z.object({ city: z.string() }) })];
  }
}

class Helper extends Agent {
  override prompt = 'Be brief.';
  constructor(readonly weather: Weather) {
    super();
  }
}

class Inbox extends Listener {
  got: string[] = [];
  @consumer('news')
  async onNews(text: string) {
    this.got.push(text);
  }
}

const Flow = Annotation.Root({ steps: Annotation<number> });

class Steps extends Graph<typeof Flow> {
  readonly state = Flow;
  @start
  @next('second')
  first(s: typeof Flow.State) {
    return { steps: s.steps + 1 };
  }
  @next('end')
  second(s: typeof Flow.State) {
    return { steps: s.steps * 10 };
  }
}

describe('dragonfly-nest AI and events', () => {
  it('an agent answers with its tools, a graph runs its nodes, publish reaches the listeners', async () => {
    const fake = new FakeModel(['hello there']);
    await fake.open();
    useConnection(fake);
    assert.equal(await new Helper(new Weather()).ask('hi'), 'hello there');
    assert.equal((await new Steps().run({ steps: 1 })).steps, 20);
    const inbox = new Inbox();
    await publish('news', 'kafka is not configured: delivered here');
    assert.deepEqual(inbox.got, ['kafka is not configured: delivered here']);
  });
});

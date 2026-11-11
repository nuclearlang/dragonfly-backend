// Messaging and cache: Kafka topics (publish, and `listener` kinds whose @consumer methods receive each message) and
// the Redis cache. Without a Kafka connection, publish() delivers to the listeners of this process (development,
// tests).
import { plainToInstance } from 'class-transformer';
// kafkajs and ioredis are loaded when their connection opens: a project without them (plugins) does not need them
import type { Kafka as KafkaClient, Producer } from 'kafkajs';
import type { Redis as RedisClient } from 'ioredis';
import { connection, connections } from './app.js';
import { Connection } from './config.js';

/** Redis (ioredis): new Redis({ url: env('REDIS_URL', 'redis://localhost:6379') }). */
export class Redis extends Connection {
  client?: RedisClient;

  constructor(readonly options: { url?: string; name?: string } = {}) {
    super();
    this.name = options.name ?? 'default';
  }

  override async open(): Promise<void> {
    const { Redis: Client } = await import('ioredis');
    this.client = new Client(this.options.url ?? 'redis://localhost:6379', { lazyConnect: true });
    await this.client.connect();
  }

  override async close(): Promise<void> {
    await this.client?.quit();
  }
}

/** Kafka (kafkajs): new Kafka({ servers: env('KAFKA', 'localhost:9092'), group: 'tasks' }). */
export class Kafka extends Connection {
  kafka?: KafkaClient;
  producer?: Producer;

  constructor(readonly options: { servers?: string; group?: string; clientId?: string; name?: string } = {}) {
    super();
    this.name = options.name ?? 'default';
  }

  override async open(): Promise<void> {
    const brokers = (this.options.servers ?? 'localhost:9092').split(',').map((b) => b.trim());
    const { Kafka: Client } = await import('kafkajs');
    this.kafka = new Client({ clientId: this.options.clientId ?? 'dragonfly', brokers });
    this.producer = this.kafka.producer();
    await this.producer.connect();
    await startConsumers(this);
  }

  override async close(): Promise<void> {
    await Promise.all(consumers.splice(0).map((c) => c.disconnect()));
    await this.producer?.disconnect();
  }
}

type Handler = { topic: string; method: string; type?: new () => object };
const handlers = new Map<object, Handler[]>();
const listeners: Listener[] = [];
const consumers: { disconnect(): Promise<void> }[] = [];

/** A `listener` kind: each @consumer('topic') method receives the messages of that topic. */
export abstract class Listener {
  constructor() {
    listeners.push(this);
  }
}

/** @consumer('topic'): the method receives each message of the topic, as the type of its parameter. */
export function consumer(topic: string): MethodDecorator {
  return (target, key) => {
    const types = Reflect.getMetadata('design:paramtypes', target, key) as (new () => object)[] | undefined;
    const list = handlers.get(target.constructor) ?? [];
    list.push({ topic, method: String(key), type: types?.[0] });
    handlers.set(target.constructor, list);
  };
}

async function deliver(topic: string, raw: unknown): Promise<void> {
  for (const l of listeners) {
    for (const h of handlers.get(l.constructor) ?? []) {
      if (h.topic !== topic) continue;
      const value = h.type && h.type !== Object && typeof raw === 'object' ? plainToInstance(h.type, raw) : raw;
      await (l as unknown as Record<string, (v: unknown) => unknown>)[h.method](value);
    }
  }
}

async function startConsumers(kafka: Kafka): Promise<void> {
  const topics = [...new Set([...handlers.values()].flat().map((h) => h.topic))];
  if (!topics.length || !kafka.kafka) return;
  // a topic nobody published to yet does not exist: create the ones this app consumes
  const admin = kafka.kafka.admin();
  await admin.connect();
  await admin.createTopics({ topics: topics.map((topic) => ({ topic })), waitForLeaders: true });
  await admin.disconnect();
  const c = kafka.kafka.consumer({ groupId: kafka.options.group ?? 'dragonfly' });
  await c.connect();
  for (const topic of topics) await c.subscribe({ topic });
  await c.run({
    eachMessage: async ({ topic, message }) => deliver(topic, JSON.parse(message.value?.toString() ?? 'null')),
  });
  consumers.push(c);
}

/** Sends `value` (a model, an object, a text) to the topic. */
export async function publish(topic: string, value: unknown, name = 'default'): Promise<void> {
  const kafka = connections().find((c): c is Kafka => c instanceof Kafka && c.name === name);
  if (!kafka?.producer) return deliver(topic, JSON.parse(JSON.stringify(value)));
  await kafka.producer.send({ topic, messages: [{ value: JSON.stringify(value) }] });
}

/** The JSON value cached under `key`, or null. */
export async function cacheGet<T = unknown>(key: string, name = 'default'): Promise<T | null> {
  const raw = await connection(Redis, name).client?.get(key);
  return raw == null ? null : (JSON.parse(raw) as T);
}

/** Caches `value` as JSON under `key`, for `seconds` (forever without it). */
export async function cacheSet(key: string, value: unknown, seconds?: number, name = 'default'): Promise<void> {
  const client = connection(Redis, name).client;
  if (seconds) await client?.set(key, JSON.stringify(value), 'EX', seconds);
  else await client?.set(key, JSON.stringify(value));
}

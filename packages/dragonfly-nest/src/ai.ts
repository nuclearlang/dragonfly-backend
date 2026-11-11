// AI: tools, agents and graphs over LangChain.js and LangGraph.js. The models are connections of the configuration
// (OpenAI, Ollama, Embeddings, Chroma), named in each kind: `model = 'default'`.
import { randomUUID } from 'node:crypto';
import { Document } from '@langchain/core/documents';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { VectorStore } from '@langchain/core/vectorstores';
// chromadb is loaded when a Chroma connection opens: a project without the chroma plugin does not need it
import type { Collection, Metadata, Where } from 'chromadb';
import { Annotation, END, MemorySaver, START, StateGraph, messagesStateReducer } from '@langchain/langgraph';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { createAgent, initChatModel } from 'langchain';
import { connection } from './app.js';
import { Connection } from './config.js';

/** A chat model (LangChain initChatModel): new Ollama({ model: 'qwen3.5:4b' }), new OpenAI({ model: 'gpt-4o-mini' }). */
export abstract class ChatModel extends Connection {
  abstract readonly provider: string;
  client?: BaseChatModel;

  constructor(readonly options: { model: string; name?: string; temperature?: number; baseUrl?: string }) {
    super();
    this.name = options.name ?? 'default';
  }

  override async open(): Promise<void> {
    this.client = (await initChatModel(this.options.model, {
      modelProvider: this.provider,
      temperature: this.options.temperature ?? 0,
      ...(this.options.baseUrl ? { baseUrl: this.options.baseUrl } : {}),
    })) as unknown as BaseChatModel;
  }
}

/** OpenAI (@langchain/openai; the key comes from OPENAI_API_KEY). */
export class OpenAI extends ChatModel {
  readonly provider = 'openai';
}

/** A local Ollama model (@langchain/ollama): new Ollama({ model: 'qwen3.5:4b', baseUrl: 'http://localhost:11434' }). */
export class Ollama extends ChatModel {
  readonly provider = 'ollama';
}

/** The chat model of the configuration with that name. */
export function chatModel(name = 'default'): BaseChatModel {
  const client = connection(ChatModel, name).client;
  if (!client) throw new Error(`the chat model '${name}' is not open`);
  return client;
}

/** An embeddings model, `'provider:model'`: new Embeddings({ model: 'ollama:nomic-embed-text' }) (ollama, openai). */
export class Embeddings extends Connection {
  client?: EmbeddingsInterface;

  constructor(readonly options: { model: string; name?: string; baseUrl?: string }) {
    super();
    this.name = options.name ?? 'default';
  }

  override async open(): Promise<void> {
    const [provider, ...rest] = this.options.model.split(':');
    const model = rest.join(':');
    if (provider === 'ollama') {
      const { OllamaEmbeddings } = await import('@langchain/ollama');
      this.client = new OllamaEmbeddings({ model, ...(this.options.baseUrl ? { baseUrl: this.options.baseUrl } : {}) });
    } else if (provider === 'openai') {
      const { OpenAIEmbeddings } = await import('@langchain/openai');
      this.client = new OpenAIEmbeddings({ model });
    } else {
      throw new Error(`embeddings '${this.options.model}': the provider is ollama or openai ('ollama:nomic-embed-text')`);
    }
  }
}

/** A LangChain vector store over a Chroma collection: chromadb's client with the embeddings of the configuration
 * (the embeddings are computed here, so the collection needs no embedding function of its own). */
export class ChromaStore extends VectorStore {
  constructor(embeddings: EmbeddingsInterface, private readonly collection: Collection) {
    super(embeddings, {});
  }

  _vectorstoreType(): string {
    return 'chroma';
  }

  async addDocuments(documents: Document[], options?: { ids?: string[] }): Promise<string[]> {
    const vectors = await this.embeddings.embedDocuments(documents.map((d) => d.pageContent));
    return this.addVectors(vectors, documents, options);
  }

  async addVectors(vectors: number[][], documents: Document[], options?: { ids?: string[] }): Promise<string[]> {
    const ids = options?.ids ?? documents.map((d) => d.id ?? randomUUID());
    await this.collection.add({
      ids,
      embeddings: vectors,
      documents: documents.map((d) => d.pageContent),
      metadatas: documents.map((d) => d.metadata as Metadata),
    });
    return ids;
  }

  async similaritySearchVectorWithScore(query: number[], k: number, filter?: this['FilterType']): Promise<[Document, number][]> {
    const out = await this.collection.query({ queryEmbeddings: [query], nResults: k, ...(filter ? { where: filter as Where } : {}) });
    return (out.ids[0] ?? []).map((id, i) => [
      new Document({ id, pageContent: out.documents[0]?.[i] ?? '', metadata: out.metadatas[0]?.[i] ?? {} }),
      out.distances[0]?.[i] ?? 0,
    ]);
  }
}

/** A Chroma vector store on a Chroma server (chromadb), with the named Embeddings connection:
 * new Chroma({ collection: 'facts', url: 'http://localhost:8000' }). */
export class Chroma extends Connection {
  store?: ChromaStore;

  constructor(readonly options: { collection: string; embeddings?: string; url?: string; name?: string }) {
    super();
    this.name = options.name ?? 'default';
  }

  override async open(): Promise<void> {
    const { ChromaClient } = await import('chromadb');
    const model = connection(Embeddings, this.options.embeddings ?? 'default').client;
    if (!model) throw new Error(`the embeddings '${this.options.embeddings ?? 'default'}' are not open`);
    const url = new URL(this.options.url ?? 'http://localhost:8000');
    const ssl = url.protocol === 'https:';
    const client = new ChromaClient({ host: url.hostname, port: Number(url.port || (ssl ? 443 : 8000)), ssl });
    const collection = await client.getOrCreateCollection({ name: this.options.collection, embeddingFunction: null });
    this.store = new ChromaStore(model, collection);
  }
}

/** The vector store of the configuration with that name (a LangChain VectorStore). */
export function vectorStore(name = 'default'): ChromaStore {
  const store = connection(Chroma, name).store;
  if (!store) throw new Error(`the vector store '${name}' is not open`);
  return store;
}

/** The text of a model's answer. */
export function textOf(message: BaseMessage | { content?: unknown } | undefined): string {
  const content = message?.content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : String((p as { text?: string }).text ?? ''))).join('');
  return content == null ? '' : String(content);
}

/** The state field of a conversation: new messages are appended (LangGraph's messages reducer). */
export const Messages = () => Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] });

/** A `tools` kind: `tools()` gives the LangChain tools of its methods with a doc comment (the kind writes it). */
export abstract class Tools {
  abstract tools(): StructuredToolInterface[];
}

/** An `agent` kind: a model with tools and a system prompt (LangChain createAgent, with memory per thread). Its tools
 * are those of the `tools` it receives in its constructor. */
export abstract class Agent {
  model = 'default';
  prompt = '';
  private compiled?: ReturnType<typeof createAgent>;

  graph(): ReturnType<typeof createAgent> {
    if (!this.compiled) {
      const tools = Object.values(this).filter((v): v is Tools => v instanceof Tools).flatMap((t) => t.tools());
      this.compiled = createAgent({
        model: chatModel(this.model),
        tools,
        ...(this.prompt ? { systemPrompt: this.prompt } : {}),
        checkpointer: new MemorySaver(),
      });
    }
    return this.compiled;
  }

  /** The agent's answer to `text`, in the conversation `thread`. */
  async ask(text: string, thread = 'default'): Promise<string> {
    const out = (await this.graph().invoke(
      { messages: [{ role: 'user', content: text }] },
      { configurable: { thread_id: thread } },
    )) as { messages: BaseMessage[] };
    return textOf(out.messages.at(-1));
  }
}

const starts = new Map<object, string>();
const nexts = new Map<object, Map<string, string>>();

/** @start: the first node of a graph. */
export function start(target: object, key: string | symbol): void {
  starts.set(target.constructor, String(key));
}

/** @next('node'): after this node, that one ('end' ends the graph). */
export function next(node: string): MethodDecorator {
  return (target, key) => {
    const m = nexts.get(target.constructor) ?? new Map<string, string>();
    m.set(String(key), node);
    nexts.set(target.constructor, m);
  };
}

/** The state type of an Annotation.Root: `StateOf<typeof PlanState>`. */
export type StateOf<S> = S extends { State: infer T } ? T : Record<string, unknown>;

/** A `graph` kind: its methods are the nodes of a LangGraph StateGraph over its state (Annotation.Root). */
export abstract class Graph<S> {
  /** The state of the graph (an Annotation.Root): the kind writes it from @state(Name). */
  abstract readonly state: S;
  private compiled?: { invoke(input: unknown, config: unknown): Promise<unknown> };

  private build(): { invoke(input: unknown, config: unknown): Promise<unknown> } {
    const first = starts.get(this.constructor);
    if (!first) throw new Error(`${this.constructor.name}: mark the first node with @start`);
    const edges = nexts.get(this.constructor) ?? new Map<string, string>();
    // the builder's types follow each added node; the nodes are known only at run time
    const g = new StateGraph(this.state as never) as unknown as {
      addNode(n: string, f: (s: unknown) => unknown): unknown;
      addEdge(a: string, b: string): unknown;
      compile(o: unknown): { invoke(input: unknown, config: unknown): Promise<unknown> };
    };
    const self = this as unknown as Record<string, (s: unknown) => unknown>;
    for (const n of new Set([first, ...edges.keys(), ...[...edges.values()].filter((v) => v !== 'end')])) {
      g.addNode(n, (s) => self[n](s));
    }
    g.addEdge(START, first);
    for (const [a, b] of edges) g.addEdge(a, b === 'end' ? END : b);
    return g.compile({ checkpointer: new MemorySaver() });
  }

  /** Runs the graph from `input` until it ends; the final state. */
  async run(input: Partial<StateOf<S>>, thread = 'default'): Promise<StateOf<S>> {
    this.compiled ??= this.build();
    return (await this.compiled.invoke(input, { configurable: { thread_id: thread } })) as StateOf<S>;
  }
}

/** A chat model that answers `answers` in order (no network), for tests of agents and graphs. Each tool it is given
 * must be describable to a real model (its JSON schema), so a broken tool fails the test. */
export class FakeModel extends ChatModel {
  readonly provider = 'fake';

  constructor(readonly answers: string[], name = 'default') {
    super({ model: 'fake', name });
  }

  override async open(): Promise<void> {
    const model = new FakeListChatModel({ responses: this.answers });
    (model as unknown as { bindTools(tools: StructuredToolInterface[]): unknown }).bindTools = (tools) => {
      for (const t of tools) toJsonSchema(t.schema as never);
      return model;
    };
    this.client = model as unknown as BaseChatModel;
  }
}


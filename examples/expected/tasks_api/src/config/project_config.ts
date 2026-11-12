import { AppConfig, Connection, Http, SQLite, env } from 'dragonfly-nest';
import { Ollama } from 'dragonfly-nest/ai';

/** The connections of the app: the tasks database, the local Ollama model and the public holidays API. */
export class ProjectConfig extends AppConfig {
  readonly connections: Connection[] = [
    new SQLite({ file: env('DATABASE', 'tasks.sqlite'), createTables: true }),
    new Ollama({
      model: env('CHAT_MODEL', 'qwen3.5:4b'),
      baseUrl: env('OLLAMA_URL', 'http://localhost:11434'),
    }),
    new Http({ baseUrl: env('HOLIDAYS_URL', 'https://date.nager.at/api/v3'), timeout: 5 }),
  ];
}

import { TaskTools } from './task_tools.js';
import { Injectable } from '@nestjs/common';
import { Agent } from 'dragonfly-nest/ai';

/** A task assistant: it reads, adds and completes tasks with its tools. */
@Injectable()
export class AssistantAgent extends Agent {
  override prompt: string = 'You are a task assistant. Use the tools to read, add and complete tasks; never invent ids. Answer briefly, in the language of the user.';

  constructor(private readonly tools: TaskTools) {
    super();
  }
}

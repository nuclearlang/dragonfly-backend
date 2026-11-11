import { AssistantAgent } from '../ai/assistant_agent.js';
import { Planner } from '../ai/planner.js';
import { ChatReply, ChatRequest, PlanReply, PlanRequest } from '../domain/models/assistant_models.js';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';

/** The assistant over HTTP: POST /assistant/chat and POST /assistant/plan. */
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly agent: AssistantAgent,
    private readonly planner: Planner,
  ) {}

  @Post('chat')
  @HttpCode(200)
  async chat(@Body() input: ChatRequest): Promise<ChatReply> {
    return new ChatReply({ answer: await this.agent.ask(input.message, input.thread) });
  }

  @Post('plan')
  @HttpCode(200)
  async plan(@Body() input: PlanRequest): Promise<PlanReply> {
    const state = await this.planner.run({ 'goal': input.goal, 'titles': [], 'created': 0 });
    return new PlanReply({ titles: state['titles'], created: state['created'] });
  }
}

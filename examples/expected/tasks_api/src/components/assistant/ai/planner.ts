import { NewTask } from '../../tasks/domain/models/task_models.js';
import { TasksAppComponent } from '../../tasks/tasks_appcomponent.js';
import { PlanState } from './states/plan_state.js';
import { Injectable } from '@nestjs/common';
import { Graph, chatModel, next, start, textOf } from 'dragonfly-nest/ai';

function _replaceWith(s: string, re: RegExp, f: (m: RegExpMatchArray) => string): string {
  let out = '';
  let last = 0;
  for (const m of s.matchAll(re)) {
    out += s.slice(last, m.index) + f(m);
    last = m.index! + m[0].length;
  }
  return out + s.slice(last);
}

/** Turns a goal into tasks: the model splits it, then each step becomes a task. */
@Injectable()
export class Planner extends Graph<typeof PlanState> {
  readonly state = PlanState;

  constructor(private readonly tasks: TasksAppComponent) {
    super();
  }

  @start
  @next('save')
  async split(state: PlanState): Promise<Record<string, any>> {
    const reply = await chatModel().invoke(`Split this goal into at most 5 short tasks. Answer only the tasks, one per line, without numbers: ${state.goal}`);
    const titles: string[] = [];
    for (const line of textOf(reply).split('\n')) {
      const title = line.replaceAll(new RegExp('^[\\s\\-*.0-9]+', 'g'), '').trim();
      if (title.length > 0 && titles.length < 5) {
        titles.push(title);
      }
    }
    return { 'titles': titles };
  }

  @next('end')
  async save(state: PlanState): Promise<Record<string, any>> {
    let created = 0;
    for (const title of state.titles) {
      const made = await this.tasks.create(new NewTask({ title: title }));
      if (made.isOk) {
        created += 1;
      }
    }
    return { 'created': created };
  }
}

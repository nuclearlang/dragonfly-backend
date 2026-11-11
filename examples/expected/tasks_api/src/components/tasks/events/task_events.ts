import { Injectable } from '@nestjs/common';
import { Listener, consumer } from 'dragonfly-nest/events';

/** Listens to the new tasks (Kafka when it is configured; in this process otherwise). */
@Injectable()
export class TaskEvents extends Listener {
  created: string[] = [];

  @consumer('tasks.created')
  onCreated(event: Record<string, any>): void {
    this.created.push(event['title']!);
  }
}

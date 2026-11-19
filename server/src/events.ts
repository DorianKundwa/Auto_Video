/**
 * In-process pub/sub feeding the SSE endpoint. Ephemeral by design: the GUI
 * always refetches state on reconnect, so a missed event is never fatal.
 */

export type BusEventType =
  | 'job.created'
  | 'job.updated'
  | 'stage.status'
  | 'run.state'
  | 'log'
  | 'health'
  | 'system';

export interface BusEvent {
  id: string;
  type: BusEventType;
  at: string;
  jobId?: string;
  payload?: unknown;
}

type Listener = (event: BusEvent) => void;

export class EventBus {
  private readonly listeners = new Set<Listener>();
  private counter = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: Omit<BusEvent, 'id' | 'at'> & { at?: string }): BusEvent {
    const full: BusEvent = {
      ...event,
      id: `${Date.now().toString(36)}-${(this.counter += 1).toString(36)}`,
      at: event.at ?? new Date().toISOString(),
    };
    for (const listener of this.listeners) {
      try {
        listener(full);
      } catch (error) {
        console.warn(`SSE listener failed: ${String(error)}`);
      }
    }
    return full;
  }
}

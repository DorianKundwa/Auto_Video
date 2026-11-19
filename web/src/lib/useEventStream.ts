import { useEffect, useRef } from 'react';
import type { BusEvent } from '../types';

const EVENT_TYPES: BusEvent['type'][] = [
  'job.created',
  'job.updated',
  'stage.status',
  'run.state',
  'log',
  'system',
  'health',
];

/** Subscribes to /api/events for the lifetime of the component. */
export function useEventStream(onEvent: (event: BusEvent) => void, enabled = true): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled) return undefined;
    let source: EventSource | null = null;
    try {
      source = new EventSource('/api/events');
    } catch {
      return undefined;
    }

    const listeners = EVENT_TYPES.map((type) => {
      const listener = (raw: Event) => {
        const message = raw as MessageEvent<string>;
        try {
          handler.current(JSON.parse(message.data) as BusEvent);
        } catch {
          /* ignore malformed payloads */
        }
      };
      source?.addEventListener(type, listener);
      return { type, listener };
    });

    return () => {
      for (const { type, listener } of listeners) source?.removeEventListener(type, listener);
      source?.close();
    };
  }, [enabled]);
}

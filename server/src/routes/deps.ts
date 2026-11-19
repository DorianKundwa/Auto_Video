/**
 * Shared dependency bag passed to Fastify route plugins. Built once in app.ts
 * so every route sees the same store, registry, bus and runner.
 */
import type { RuntimeConfig } from '../config.js';
import type { EventBus } from '../events.js';
import type { JobRunner } from '../jobs/runner.js';
import type { JobStore } from '../jobs/store.js';
import type { StyleRegistry } from '../styles/registry.js';

export interface AppDeps {
  config: RuntimeConfig;
  store: JobStore;
  styles: StyleRegistry;
  bus: EventBus;
  runner: JobRunner;
}

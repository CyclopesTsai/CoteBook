import type { Config } from './config.js';
import type { Database } from './db/client.js';
import type { SessionService } from './auth/sessions.js';
import type { EventBus } from './events/bus.js';
import type { PageService } from './services/pages.js';
import type { StorageDriver } from './storage/index.js';

/** Shared services handed to every route module. */
export interface AppContext {
  config: Config;
  db: Database;
  sessions: SessionService;
  pages: PageService;
  storage: StorageDriver;
  bus: EventBus;
}

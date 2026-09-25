import type { SyncEvent } from '@cotebook/shared';
import type pg from 'pg';

const CHANNEL = 'cotebook_events';

type Listener = (event: SyncEvent) => void;

/**
 * Per-user event fan-out used for cross-device sync. Events travel through Postgres
 * LISTEN/NOTIFY, so several server instances behind a load balancer stay consistent
 * without any extra infrastructure.
 */
export class EventBus {
  private readonly listeners = new Map<string, Set<Listener>>();
  private client: pg.PoolClient | null = null;
  private closed = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly log: { error: (obj: unknown, msg?: string) => void },
  ) {}

  async start() {
    await this.connect();
  }

  private async connect() {
    const client = await this.pool.connect();
    this.client = client;
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        const { userId, event } = JSON.parse(msg.payload) as { userId: string; event: SyncEvent };
        this.dispatch(userId, event);
      } catch (err) {
        this.log.error(err, 'Malformed event payload');
      }
    });
    client.on('error', (err) => {
      this.log.error(err, 'Event listener connection lost; reconnecting');
      client.release(true);
      this.client = null;
      this.scheduleReconnect();
    });
    await client.query(`LISTEN ${CHANNEL}`);
  }

  private scheduleReconnect() {
    if (this.closed) return;
    setTimeout(() => {
      this.connect().catch((err) => {
        this.log.error(err, 'Event listener reconnect failed');
        this.scheduleReconnect();
      });
    }, 2000).unref();
  }

  private dispatch(userId: string, event: SyncEvent) {
    const set = this.listeners.get(userId);
    if (!set) return;
    for (const listener of set) listener(event);
  }

  async publish(userId: string, event: SyncEvent) {
    await this.pool.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify({ userId, event })]);
  }

  subscribe(userId: string, listener: Listener): () => void {
    let set = this.listeners.get(userId);
    if (!set) {
      set = new Set();
      this.listeners.set(userId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(userId);
    };
  }

  async close() {
    this.closed = true;
    if (this.client) {
      await this.client.query(`UNLISTEN ${CHANNEL}`).catch(() => {});
      this.client.release();
      this.client = null;
    }
  }
}

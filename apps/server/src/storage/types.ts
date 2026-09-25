import type { Readable } from 'node:stream';

/**
 * Pluggable binary storage. Keys are opaque, slash-separated relative paths such as
 * `u/<userId>/<uploadId>`.
 */
export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Returns null when the object does not exist. */
  get(key: string): Promise<Readable | null>;
  delete(key: string): Promise<void>;
}

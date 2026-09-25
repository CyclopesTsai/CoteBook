import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './types.js';

export class LocalStorage implements StorageDriver {
  readonly name = 'local';

  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.rootDir, key);
    if (!full.startsWith(this.rootDir + path.sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return full;
  }

  async init() {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, file);
  }

  async get(key: string): Promise<Readable | null> {
    const file = this.resolve(key);
    try {
      await fs.access(file);
    } catch {
      return null;
    }
    return createReadStream(file);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}

import type { Config } from '../config.js';
import { LocalStorage } from './local.js';
import { S3Storage } from './s3.js';
import type { StorageDriver } from './types.js';

export type { StorageDriver } from './types.js';

export async function createStorage(config: Config): Promise<StorageDriver> {
  if (config.storage.driver === 's3') {
    return new S3Storage(config.storage.s3);
  }
  const local = new LocalStorage(config.storage.localDir);
  await local.init();
  return local;
}

import { hash, verify } from '@node-rs/argon2';

// argon2id with the library defaults (m=19 MiB, t=2, p=1) — the OWASP baseline.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Used to keep login timing uniform when the email does not exist.
let dummyHash: Promise<string> | undefined;
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}

import type { SearchResult } from '@cotebook/shared';
import { sql } from 'drizzle-orm';
import type { Actor } from '../auth/authz.js';
import type { Database } from '../db/client.js';

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Builds a short excerpt of `text` centred on the first occurrence of `q`. */
export function makeSnippet(text: string, q: string, radius = 60): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/**
 * Case-insensitive substring search over titles and block text. Substring matching
 * (rather than Postgres full-text search) works for languages without spaces between
 * words, such as Chinese and Japanese, and is fast enough at personal-notes scale.
 */
export async function searchPages(
  db: Database,
  actor: Actor,
  q: string,
  limit: number,
): Promise<SearchResult[]> {
  const pattern = `%${escapeLike(q)}%`;
  const result = await db.execute<{
    id: string;
    title: string;
    updated_at: Date;
    title_match: boolean;
    block_text: string | null;
  }>(sql`
    SELECT p.id, p.title, p.updated_at,
           p.title ILIKE ${pattern} AS title_match,
           m.plain_text AS block_text
    FROM pages p
    LEFT JOIN LATERAL (
      SELECT b.plain_text FROM blocks b
      WHERE b.page_id = p.id AND b.plain_text ILIKE ${pattern}
      LIMIT 1
    ) m ON true
    WHERE p.user_id = ${actor.userId}
      AND p.deleted_at IS NULL
      AND (p.title ILIKE ${pattern} OR m.plain_text IS NOT NULL)
    ORDER BY (p.title ILIKE ${pattern}) DESC, p.updated_at DESC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    pageId: r.id,
    title: r.title,
    matchedIn: r.title_match ? 'title' : 'content',
    snippet: r.block_text ? makeSnippet(r.block_text, q) : null,
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

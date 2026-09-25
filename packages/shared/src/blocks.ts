import { z } from 'zod';

/**
 * Block document format shared by the server and every client.
 *
 * The shape intentionally mirrors the BlockNote document model (id / type / props /
 * content / children) but is described here without any browser-specific types, so
 * that native mobile clients can read and write the same data.
 */

/** Block types enabled in the current release. The server accepts unknown types too,
 *  so that newer clients can introduce blocks without a server upgrade. */
export const MVP_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'image',
] as const;

export type StyledText = {
  type: 'text';
  text: string;
  styles?: Record<string, string | boolean>;
};

export type LinkContent = {
  type: 'link';
  href: string;
  content: StyledText[];
};

export type InlineContent = StyledText | LinkContent | { type: string; [key: string]: unknown };

export interface Block {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  /** Inline content for text blocks, a structured object for e.g. tables, or undefined. */
  content?: unknown;
  children?: Block[];
}

export const MAX_BLOCK_DEPTH = 32;
export const MAX_BLOCKS_PER_PAGE = 20000;

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(128),
    type: z.string().min(1).max(64),
    props: z.record(z.string(), z.unknown()).optional(),
    content: z.unknown().optional(),
    children: z.array(blockSchema).optional(),
  }),
);

/** Extracts the plain text of a block's own inline content (not its children). */
export function blockPlainText(block: Pick<Block, 'content'>): string {
  return inlinePlainText(block.content);
}

function inlinePlainText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(inlinePlainText).join('');
  if (content && typeof content === 'object') {
    const node = content as Record<string, unknown>;
    if (typeof node.text === 'string') return node.text;
    if (Array.isArray(node.content)) return inlinePlainText(node.content);
    // Table content: { type: 'tableContent', rows: [{ cells: [...] }] }
    if (Array.isArray(node.rows)) {
      return node.rows
        .map((row) => {
          const cells = (row as { cells?: unknown[] }).cells ?? [];
          return cells.map(inlinePlainText).join(' ');
        })
        .join('\n');
    }
  }
  return '';
}

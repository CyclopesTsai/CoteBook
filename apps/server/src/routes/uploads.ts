import type { UploadResponse } from '@cotebook/shared';
import { ErrorCode } from '@cotebook/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canViewUpload, requirePage } from '../auth/authz.js';
import { requireAuth } from '../auth/plugin.js';
import type { AppContext } from '../context.js';
import { uploads } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';
import { parse } from '../lib/validation.js';

/**
 * Allowed image types, identified by their magic bytes rather than the client-supplied
 * Content-Type. SVG is deliberately excluded: it can carry scripts.
 */
const IMAGE_SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  {
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/gif',
    test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')),
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    mime: 'image/avif',
    test: (b) =>
      b.subarray(4, 8).toString('latin1') === 'ftyp' &&
      ['avif', 'avis'].includes(b.subarray(8, 12).toString('latin1')),
  },
];

export const ALLOWED_UPLOAD_TYPES = IMAGE_SIGNATURES.map((s) => s.mime);

function sniffImage(buf: Buffer): string | null {
  return IMAGE_SIGNATURES.find((s) => s.test(buf))?.mime ?? null;
}

const uploadQuery = z.object({ pageId: z.uuid().optional() });
const fileParams = z.object({ id: z.uuid() });

export async function uploadRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/uploads', async (req, reply) => {
    const { actor, user } = requireAuth(req);
    const { pageId } = parse(uploadQuery, req.query);
    if (pageId) await requirePage(ctx.db, actor, pageId, 'edit');
    if (!req.isMultipart()) throw HttpError.badRequest('Expected multipart/form-data');

    const file = await req.file();
    if (!file) throw HttpError.badRequest('No file provided');
    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      throw new HttpError(413, ErrorCode.PayloadTooLarge, 'File is too large');
    }
    const mimeType = sniffImage(buffer);
    if (!mimeType) {
      throw new HttpError(
        415,
        ErrorCode.UnsupportedMediaType,
        'Only PNG, JPEG, GIF, WebP and AVIF images are supported',
      );
    }

    const id = randomUUID();
    const storageKey = `u/${user.id}/${id}`;
    await ctx.storage.put(storageKey, buffer, mimeType);
    await ctx.db.insert(uploads).values({
      id,
      userId: user.id,
      pageId: pageId ?? null,
      storageKey,
      mimeType,
      size: buffer.length,
      originalName: file.filename?.slice(0, 255) || null,
    });

    const body: UploadResponse = { id, url: `/api/files/${id}`, mimeType, size: buffer.length };
    return reply.code(201).send(body);
  });

  app.get('/files/:id', async (req, reply) => {
    const { actor } = requireAuth(req);
    const { id } = parse(fileParams, req.params);
    const [row] = await ctx.db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
    if (!row || !canViewUpload(actor, row.userId)) throw HttpError.notFound('File not found');

    const stream = await ctx.storage.get(row.storageKey);
    if (!stream) throw HttpError.notFound('File not found');
    return (
      reply
        .header('Content-Type', row.mimeType)
        .header('Content-Length', row.size)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Security-Policy', "default-src 'none'; sandbox")
        // Files are immutable (a new upload always gets a new id).
        .header('Cache-Control', 'private, max-age=31536000, immutable')
        .send(stream)
    );
  });
}

import { z } from 'zod';

export const ragSourceSchema = z.object({
  id: z.string(),
  score: z.number().optional(),
  metadata: z
    .object({
      text: z.string().optional(),
      title: z.string().optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

export const chatResponseSchema = z.object({
  reply: z.string(),
  sources: z.array(ragSourceSchema).optional(),
  grounded: z.boolean().optional(),
});

export const ingestResponseSchema = z.object({
  ok: z.boolean(),
  id: z.string(),
  title: z.string(),
  chunksCount: z.number().optional(),
  textLength: z.number().optional(),
});

export const indexStatusSchema = z.object({
  status: z.string(),
  index: z.string(),
  stats: z
    .object({
      dimension: z.number().optional(),
      totalRecordCount: z.number().optional(),
    })
    .optional(),
});

export const indexedDocSchema = z.object({
  id: z.string(),
  title: z.string(),
  indexedAt: z.string().optional(),
  chunksCount: z.number().optional(),
  preview: z.string().optional(),
  originalname: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
});

export const documentDetailsSchema = z.object({
  id: z.string(),
  title: z.string(),
  chunksCount: z.number(),
  fullText: z.string(),
  originalname: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  chunks: z.array(
    z.object({
      id: z.string(),
      index: z.number(),
      text: z.string(),
    })
  ),
});

export const deleteResponseSchema = z.object({
  ok: z.boolean(),
  id: z.string(),
  deletedChunksCount: z.number(),
  fileDeleted: z.boolean().optional(),
});

export const chatInputSchema = z
  .string()
  .trim()
  .min(1, 'Message cannot be empty')
  .max(10000, 'Message cannot exceed 10,000 characters');

export const fileUploadSchema = z.object({
  name: z.string().min(1, 'File name is required'),
  size: z.number().max(25 * 1024 * 1024, 'File size must be under 25MB'),
});

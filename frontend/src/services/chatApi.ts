import axios from 'axios';
import {
  chatInputSchema,
  chatResponseSchema,
  deleteResponseSchema,
  documentDetailsSchema,
  fileUploadSchema,
  indexedDocSchema,
  indexStatusSchema,
  ingestResponseSchema,
} from '../schemas/api';
import type { IndexedDoc, IndexStatus, RagSource } from '../types/chat';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const serverError = (err.response?.data as { error?: string } | undefined)
      ?.error;
    return serverError || err.message || fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

export interface ChatResponse {
  reply: string;
  sources?: RagSource[];
  grounded?: boolean;
}

export interface IngestResponse {
  ok: boolean;
  id: string;
  title: string;
  chunksCount?: number;
  textLength?: number;
}

export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  signal?: AbortSignal;
  minScore?: number;
  topK?: number;
  allowedDocIds?: string[];
  strictDocs?: boolean;
  agentic?: boolean;
  history?: ChatHistoryTurn[];
}

function buildChatPayload(message: string, options?: ChatOptions) {
  return {
    message,
    ...(options?.minScore !== undefined ? { minScore: options.minScore } : {}),
    ...(options?.topK !== undefined ? { topK: options.topK } : {}),
    ...(options?.allowedDocIds && options.allowedDocIds.length > 0
      ? { allowedDocIds: options.allowedDocIds }
      : {}),
    ...(options?.strictDocs !== undefined ? { strictDocs: options.strictDocs } : {}),
    ...(options?.agentic !== undefined ? { agentic: options.agentic } : {}),
    ...(options?.history && options.history.length > 0
      ? { history: options.history }
      : {}),
  };
}

export async function sendChatMessage(
  message: string,
  options?: ChatOptions
): Promise<ChatResponse> {
  try {
    chatInputSchema.parse(message);
    const { data } = await apiClient.post<unknown>(
      '/chat',
      buildChatPayload(message, options)
    );
    const validated = chatResponseSchema.parse(data);
    return {
      reply: validated.reply,
      sources: Array.isArray(validated.sources) ? validated.sources : undefined,
      grounded: validated.grounded,
    };
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'Failed to reach the backend.'), {
      cause: err,
    });
  }
}

export interface StreamChatHandlers {
  onTool?: (tool: { name: string; args?: Record<string, unknown> }) => void;
  onSources?: (sources: RagSource[], grounded: boolean) => void;
  onDelta: (text: string) => void;
  onDone?: () => void;
}

export async function streamChatMessage(
  message: string,
  handlers: StreamChatHandlers,
  options?: ChatOptions
): Promise<void> {
  chatInputSchema.parse(message);
  const response = await fetch(`${API_BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildChatPayload(message, options)),
    signal: options?.signal,
  });

  if (!response.ok || !response.body) {
    let errorMsg = `Request failed (${response.status})`;
    try {
      const errBody = (await response.json()) as { error?: string };
      if (errBody?.error) errorMsg = errBody.error;
    } catch {
      // ignore non-JSON error body
    }
    throw new Error(errorMsg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatchFrame = (rawFrame: string) => {
    const lines = rawFrame.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;

    if (eventName === 'tool') {
      const name = typeof payload.name === 'string' ? payload.name : 'tool';
      const args =
        payload.args && typeof payload.args === 'object'
          ? (payload.args as Record<string, unknown>)
          : undefined;
      handlers.onTool?.({ name, args });
    } else if (eventName === 'sources') {
      const sources = Array.isArray(payload.sources)
        ? (payload.sources as RagSource[])
        : [];
      handlers.onSources?.(sources, Boolean(payload.grounded));
    } else if (eventName === 'delta') {
      if (typeof payload.text === 'string' && payload.text.length > 0) {
        handlers.onDelta(payload.text);
      }
    } else if (eventName === 'error') {
      throw new Error(
        typeof payload.error === 'string' ? payload.error : 'Streaming failed'
      );
    } else if (eventName === 'done') {
      handlers.onDone?.();
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      if (frame.trim()) {
        dispatchFrame(frame);
      }
    }
  }

  if (buffer.trim()) {
    dispatchFrame(buffer);
  }
}

export async function ingestDocument(
  id: string,
  text: string,
  title?: string
): Promise<IngestResponse> {
  try {
    const { data } = await apiClient.post<unknown>('/ingest', {
      id,
      text,
      title,
      metadata: title ? { title } : {},
    });
    return ingestResponseSchema.parse(data);
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'Document ingestion failed.'), {
      cause: err,
    });
  }
}

export async function ingestFile(
  file: File,
  title?: string
): Promise<IngestResponse> {
  try {
    fileUploadSchema.parse({ name: file.name, size: file.size });
    const formData = new FormData();
    formData.append('file', file);
    if (title?.trim()) {
      formData.append('title', title.trim());
    }

    const { data } = await apiClient.post<unknown>(
      '/ingest/file',
      formData
    );
    return ingestResponseSchema.parse(data);
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'File upload failed.'), {
      cause: err,
    });
  }
}

export async function getBackendStatus(): Promise<IndexStatus> {
  try {
    const { data } = await apiClient.get<unknown>('/status');
    const validated = indexStatusSchema.parse(data);
    return {
      status: validated.status,
      index: validated.index,
      dimension: validated.stats?.dimension,
      totalRecordCount: validated.stats?.totalRecordCount,
    };
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'Failed to fetch index status.'), {
      cause: err,
    });
  }
}

export async function fetchDocuments(): Promise<IndexedDoc[]> {
  try {
    const { data } = await apiClient.get<{
      ok?: boolean;
      documents?: unknown;
    }>('/documents');
    const docs = Array.isArray(data.documents) ? data.documents : [];
    return docs.map((d) => indexedDocSchema.parse(d));
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'Failed to fetch documents.'), {
      cause: err,
    });
  }
}

export interface DocumentChunk {
  id: string;
  title: string;
  text: string;
  index: number;
}

export interface DocumentDetails {
  id: string;
  title: string;
  originalname?: string | null;
  filename?: string | null;
  chunksCount: number;
  fullText: string;
  chunks: DocumentChunk[];
}

export async function fetchDocumentById(
  id: string
): Promise<DocumentDetails | null> {
  try {
    const { data } = await apiClient.get<{
      ok?: boolean;
      document?: unknown;
    }>(`/documents/${encodeURIComponent(id)}`);
    if (!data.document) return null;
    return documentDetailsSchema.parse(data.document) as DocumentDetails;
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'Failed to fetch document.'), {
      cause: err,
    });
  }
}

export interface DeleteDocumentResponse {
  ok: boolean;
  id: string;
  deletedChunksCount: number;
  fileDeleted: boolean;
}

export async function deleteDocumentById(
  id: string
): Promise<DeleteDocumentResponse> {
  try {
    const { data } = await apiClient.delete<unknown>(
      `/documents/${encodeURIComponent(id)}`
    );
    const validated = deleteResponseSchema.parse(data);
    return {
      ok: validated.ok,
      id: validated.id,
      deletedChunksCount: validated.deletedChunksCount,
      fileDeleted: Boolean(validated.fileDeleted),
    };
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'Failed to delete document.'), {
      cause: err,
    });
  }
}

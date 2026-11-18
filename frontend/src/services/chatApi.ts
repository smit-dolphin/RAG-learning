import axios from 'axios';
import type { IndexStatus, RagSource } from '../types/chat';

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

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  try {
    const { data } = await apiClient.post<ChatResponse>('/chat', { message });
    return {
      reply: data.reply,
      sources: Array.isArray(data.sources) ? data.sources : undefined,
      grounded: data.grounded,
    };
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'Failed to reach the backend.'), {
      cause: err,
    });
  }
}

export async function ingestDocument(
  id: string,
  text: string,
  title?: string
): Promise<IngestResponse> {
  try {
    const { data } = await apiClient.post<IngestResponse>('/ingest', {
      id,
      text,
      title,
      metadata: title ? { title } : {},
    });
    return data;
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
    const formData = new FormData();
    formData.append('file', file);
    if (title?.trim()) {
      formData.append('title', title.trim());
    }

    const { data } = await apiClient.post<IngestResponse>(
      '/ingest/file',
      formData
    );
    return data;
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'File upload failed.'), {
      cause: err,
    });
  }
}

export async function getBackendStatus(): Promise<IndexStatus> {
  try {
    const { data } = await apiClient.get<{
      status: string;
      index: string;
      stats?: { dimension?: number; totalRecordCount?: number };
    }>('/status');
    return {
      status: data.status,
      index: data.index,
      dimension: data.stats?.dimension,
      totalRecordCount: data.stats?.totalRecordCount,
    };
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'Failed to fetch index status.'), {
      cause: err,
    });
  }
}

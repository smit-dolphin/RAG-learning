export type Role = 'user' | 'assistant';

export interface RagSource {
  id: string;
  score?: number;
  metadata?: {
    text?: string;
    title?: string;
    [key: string]: unknown;
  };
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
  sources?: RagSource[];
  isError?: boolean;
}

export interface IndexedDoc {
  id: string;
  title: string;
  indexedAt: string;
  chunksCount?: number;
}

export interface IndexStatus {
  status: string;
  index: string;
  dimension?: number;
  totalRecordCount?: number;
}

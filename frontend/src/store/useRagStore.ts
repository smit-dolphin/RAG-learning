import { create } from 'zustand';
import {
  getBackendStatus,
  ingestDocument,
  ingestFile,
  sendChatMessage,
} from '../services/chatApi';
import type { ChatMessage, IndexedDoc, IndexStatus } from '../types/chat';

type Theme = 'dark' | 'light';
type SidebarTab = 'ingest' | 'documents';

interface IngestFeedback {
  type: 'success' | 'error';
  text: string;
}

interface RagState {
  theme: Theme;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  messages: ChatMessage[];
  isSending: boolean;
  expandedSources: Record<string, boolean>;
  isIngesting: boolean;
  ingestFeedback: IngestFeedback | null;
  indexedDocs: IndexedDoc[];
  searchQuery: string;
  indexStatus: IndexStatus | null;

  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setSearchQuery: (query: string) => void;
  clearMessages: () => void;
  clearIngestFeedback: () => void;
  toggleSourceExpansion: (msgId: string) => void;
  fetchStatus: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  ingestTextDoc: (title: string, content: string) => Promise<boolean>;
  ingestFileDoc: (file: File, title?: string) => Promise<boolean>;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('rag_agent_theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export const useRagStore = create<RagState>((set, get) => ({
  theme: getInitialTheme(),
  sidebarOpen: true,
  sidebarTab: 'ingest',
  messages: [],
  isSending: false,
  expandedSources: {},
  isIngesting: false,
  ingestFeedback: null,
  indexedDocs: [],
  searchQuery: '',
  indexStatus: null,

  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('rag_agent_theme', next);
      return { theme: next };
    }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  clearMessages: () => set({ messages: [], expandedSources: {} }),
  clearIngestFeedback: () => set({ ingestFeedback: null }),

  toggleSourceExpansion: (msgId) =>
    set((state) => ({
      expandedSources: {
        ...state.expandedSources,
        [msgId]: !state.expandedSources[msgId],
      },
    })),

  fetchStatus: async () => {
    try {
      const indexStatus = await getBackendStatus();
      set({ indexStatus });
    } catch {
      set({ indexStatus: null });
    }
  },

  sendMessage: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().isSending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: formatTime(new Date()),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isSending: true,
    }));

    try {
      const { reply, sources } = await sendChatMessage(trimmed);
      const aiMessageId = crypto.randomUUID();
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: aiMessageId,
            role: 'assistant',
            content: reply,
            sources,
            timestamp: formatTime(new Date()),
          },
        ],
        expandedSources:
          sources && sources.length > 0
            ? { ...state.expandedSources, [aiMessageId]: true }
            : state.expandedSources,
      }));
    } catch (err) {
      const errorText =
        err instanceof Error ? err.message : 'Failed to reach the backend.';
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Backend Error: ${errorText}`,
            timestamp: formatTime(new Date()),
            isError: true,
          },
        ],
      }));
    } finally {
      set({ isSending: false });
    }
  },

  ingestTextDoc: async (title, content) => {
    const trimmed = content.trim();
    if (!trimmed || get().isIngesting) return false;

    const docTitle =
      title.trim() || `Knowledge Unit #${get().indexedDocs.length + 1}`;
    const id = `doc-${Date.now()}`;

    set({ isIngesting: true, ingestFeedback: null });

    try {
      const res = await ingestDocument(id, trimmed, docTitle);
      set((state) => ({
        indexedDocs: [
          {
            id,
            title: docTitle,
            indexedAt: formatTime(new Date()),
            chunksCount: res.chunksCount,
          },
          ...state.indexedDocs,
        ],
        ingestFeedback: {
          type: 'success',
          text: `Indexed "${docTitle}" (${res.chunksCount ?? 1} chunk${res.chunksCount === 1 ? '' : 's'}) into Pinecone.`,
        },
      }));
      void get().fetchStatus();
      return true;
    } catch (err) {
      set({
        ingestFeedback: {
          type: 'error',
          text: err instanceof Error ? err.message : 'Ingestion failed.',
        },
      });
      return false;
    } finally {
      set({ isIngesting: false });
    }
  },

  ingestFileDoc: async (file, title) => {
    if (get().isIngesting) return false;

    set({ isIngesting: true, ingestFeedback: null });

    try {
      const res = await ingestFile(file, title);
      const docTitle = res.title || title?.trim() || file.name;
      set((state) => ({
        indexedDocs: [
          {
            id: res.id,
            title: docTitle,
            indexedAt: formatTime(new Date()),
            chunksCount: res.chunksCount,
          },
          ...state.indexedDocs,
        ],
        ingestFeedback: {
          type: 'success',
          text: `Uploaded "${docTitle}" (${res.chunksCount ?? 1} chunk${res.chunksCount === 1 ? '' : 's'}) into Pinecone.`,
        },
      }));
      void get().fetchStatus();
      return true;
    } catch (err) {
      set({
        ingestFeedback: {
          type: 'error',
          text: err instanceof Error ? err.message : 'File upload failed.',
        },
      });
      return false;
    } finally {
      set({ isIngesting: false });
    }
  },
}));

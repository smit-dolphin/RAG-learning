import { create } from 'zustand';
import {
  deleteDocumentById,
  fetchDocuments as fetchDocsApi,
  getBackendStatus,
  ingestFile,
  streamChatMessage,
} from '../services/chatApi';
import type {
  ChatMessage,
  ChatSession,
  IndexedDoc,
  IndexStatus,
  ThemeId,
  WorkspaceView,
} from '../types/chat';

interface IngestFeedback {
  type: 'success' | 'error';
  text: string;
}

export interface DocToDelete {
  id: string;
  title: string;
  chunksCount?: number;
  originalname?: string | null;
}

interface RagState {
  theme: ThemeId;
  sidebarOpen: boolean;
  activeView: WorkspaceView;
  selectedDocId: string | null;
  sessions: ChatSession[];
  activeSessionId: string;
  isSending: boolean;
  expandedSources: Record<string, boolean>;
  isIngesting: boolean;
  deletingDocId: string | null;
  docToDelete: DocToDelete | null;
  ingestFeedback: IngestFeedback | null;
  indexedDocs: IndexedDoc[];
  indexStatus: IndexStatus | null;
  selectedDocIds: string[];
  strictDocs: boolean;
  agenticMode: boolean;
  activeToolStatus: string | null;

  setTheme: (theme: ThemeId) => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveView: (view: WorkspaceView, docId?: string | null) => void;
  setDocToDelete: (doc: DocToDelete | null) => void;
  setSelectedDocIds: (ids: string[]) => void;
  toggleDocSelection: (id: string) => void;
  clearDocSelection: () => void;
  setStrictDocs: (strict: boolean) => void;
  setAgenticMode: (enabled: boolean) => void;
  createNewChat: () => string;
  selectSession: (id: string) => void;
  togglePinSession: (id: string) => void;
  deleteSession: (id: string) => void;
  clearMessages: () => void;
  clearIngestFeedback: () => void;
  toggleSourceExpansion: (msgId: string) => void;
  fetchStatus: () => Promise<void>;
  fetchDocs: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  stopStreaming: () => void;
  ingestFileDoc: (file: File, title?: string) => Promise<boolean>;
  deleteDoc: (id: string) => Promise<boolean>;
}

const SESSIONS_STORAGE_KEY = 'rag_agent_sessions';
let activeStreamController: AbortController | null = null;

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createEmptySession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: 'New Chat',
    messages: [],
    updatedAt: formatTime(new Date()),
  };
}

function loadInitialSessions(): {
  sessions: ChatSession[];
  activeSessionId: string;
} {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatSession[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { sessions: parsed, activeSessionId: parsed[0].id };
      }
    }
  } catch {
    // ignore parse error
  }
  const initial = createEmptySession();
  return { sessions: [initial], activeSessionId: initial.id };
}

function persistSessions(sessions: ChatSession[]) {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore quota error
  }
}

function getInitialTheme(): ThemeId {
  const saved = localStorage.getItem('rag_agent_theme');
  if (saved) {
    if (saved === 'dark') return 'dark-plus';
    if (saved === 'light') return 'light-plus';
    return saved as ThemeId;
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light-plus'
    : 'dark-plus';
}

function summarizeTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 32 ? `${cleaned.slice(0, 32)}...` : cleaned;
}

const initialSessionState = loadInitialSessions();

export const useRagStore = create<RagState>((set, get) => ({
  theme: getInitialTheme(),
  sidebarOpen: true,
  activeView: 'chat',
  selectedDocId: null,
  sessions: initialSessionState.sessions,
  activeSessionId: initialSessionState.activeSessionId,
  isSending: false,
  expandedSources: {},
  isIngesting: false,
  deletingDocId: null,
  docToDelete: null,
  ingestFeedback: null,
  indexedDocs: [],
  indexStatus: null,
  selectedDocIds: [],
  strictDocs: false,
  agenticMode: true,
  activeToolStatus: null,

  setTheme: (theme: ThemeId) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('rag_agent_theme', theme);
    set({ theme });
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setActiveView: (view, docId = null) =>
    set({ activeView: view, selectedDocId: docId }),

  setDocToDelete: (doc) => set({ docToDelete: doc }),

  setSelectedDocIds: (ids) => set({ selectedDocIds: ids }),

  toggleDocSelection: (id) =>
    set((state) => ({
      selectedDocIds: state.selectedDocIds.includes(id)
        ? state.selectedDocIds.filter((docId) => docId !== id)
        : [...state.selectedDocIds, id],
    })),

  clearDocSelection: () => set({ selectedDocIds: [] }),

  setStrictDocs: (strict) => set({ strictDocs: strict }),

  setAgenticMode: (enabled) => set({ agenticMode: enabled }),

  createNewChat: () => {
    const { sessions, activeSessionId } = get();
    const active = sessions.find((s) => s.id === activeSessionId);
    if (active && active.messages.length === 0) {
      set({ activeView: 'chat' });
      return active.id;
    }
    const fresh = createEmptySession();
    const next = [fresh, ...sessions];
    persistSessions(next);
    set({ sessions: next, activeSessionId: fresh.id, activeView: 'chat' });
    return fresh.id;
  },

  selectSession: (id) => set({ activeSessionId: id, activeView: 'chat' }),

  togglePinSession: (id) => {
    const { sessions } = get();
    const updated = sessions.map((s) =>
      s.id === id ? { ...s, pinned: !s.pinned } : s
    );
    persistSessions(updated);
    set({ sessions: updated });
  },

  deleteSession: (id) => {
    const { sessions, activeSessionId } = get();
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      const fresh = createEmptySession();
      persistSessions([fresh]);
      set({ sessions: [fresh], activeSessionId: fresh.id });
      return;
    }
    const nextActive =
      activeSessionId === id ? remaining[0].id : activeSessionId;
    persistSessions(remaining);
    set({ sessions: remaining, activeSessionId: nextActive });
  },

  clearMessages: () => {
    const { sessions, activeSessionId } = get();
    const next = sessions.map((s) =>
      s.id === activeSessionId
        ? { ...s, title: 'New Chat', messages: [], updatedAt: formatTime(new Date()) }
        : s
    );
    persistSessions(next);
    set({ sessions: next, expandedSources: {} });
  },

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

  fetchDocs: async () => {
    try {
      const indexedDocs = await fetchDocsApi();
      set({ indexedDocs });
    } catch {
      // keep current state
    }
  },

  stopStreaming: () => {
    if (activeStreamController) {
      activeStreamController.abort();
      activeStreamController = null;
    }
  },

  sendMessage: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().isSending) return;

    const targetSessionId = get().activeSessionId;
    const now = formatTime(new Date());
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: now,
    };
    const aiMessageId = crypto.randomUUID();
    const aiPlaceholder: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: now,
    };

    const withUserAndPlaceholder = get().sessions.map((s) => {
      if (s.id !== targetSessionId) return s;
      const isFirst = s.messages.length === 0;
      return {
        ...s,
        title: isFirst ? summarizeTitle(trimmed) : s.title,
        messages: [...s.messages, userMessage, aiPlaceholder],
        updatedAt: now,
      };
    });

    persistSessions(withUserAndPlaceholder);
    const controller = new AbortController();
    activeStreamController = controller;
    set({ sessions: withUserAndPlaceholder, isSending: true });

    const updateAiMessage = (updater: (msg: ChatMessage) => ChatMessage) => {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === aiMessageId ? updater(m) : m
                ),
                updatedAt: formatTime(new Date()),
              }
            : s
        ),
      }));
    };

    const previousMessages =
      get()
        .sessions.find((s) => s.id === targetSessionId)
        ?.messages.filter((m) => !m.isError && m.content.trim().length > 0)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content })) || [];

    const selectedDocIds = get().selectedDocIds;
    const strictDocs = get().strictDocs;
    const agenticMode = get().agenticMode;

    set({ activeToolStatus: null });

    try {
      await streamChatMessage(
        trimmed,
        {
          onTool: ({ name, args }) => {
            let statusText = `Running ${name}...`;
            if (name === 'search_knowledge_base') {
              const q = typeof args?.query === 'string' ? args.query : '';
              statusText = q
                ? `Searching knowledge base: "${q}"`
                : 'Searching knowledge base...';
            } else if (name === 'list_documents') {
              statusText = 'Listing indexed documents...';
            } else if (name === 'get_document_details') {
              statusText = 'Reading full document...';
            }
            set({ activeToolStatus: statusText });
          },
          onSources: (sources) => {
            updateAiMessage((m) => ({ ...m, sources }));
            if (sources.length > 0) {
              set((state) => ({
                expandedSources: { ...state.expandedSources, [aiMessageId]: true },
              }));
            }
          },
          onDelta: (delta) => {
            if (get().activeToolStatus) {
              set({ activeToolStatus: null });
            }
            updateAiMessage((m) => ({
              ...m,
              content: m.content + delta,
            }));
          },
        },
        {
          signal: controller.signal,
          ...(selectedDocIds.length > 0 ? { allowedDocIds: selectedDocIds } : {}),
          strictDocs: strictDocs || selectedDocIds.length > 0,
          agentic: agenticMode,
          history: agenticMode ? previousMessages : undefined,
        }
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        updateAiMessage((m) =>
          m.content
            ? m
            : { ...m, content: 'Generation stopped.' }
        );
      } else {
        const errorText =
          err instanceof Error ? err.message : 'Failed to reach the backend.';
        updateAiMessage((m) => ({
          ...m,
          content: m.content
            ? `${m.content}\n\nBackend Error: ${errorText}`
            : `Backend Error: ${errorText}`,
          isError: true,
        }));
      }
    } finally {
      activeStreamController = null;
      persistSessions(get().sessions);
      set({ isSending: false, activeToolStatus: null });
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
          text: `Indexed "${docTitle}" (${res.chunksCount ?? 1} chunk${res.chunksCount === 1 ? '' : 's'}).`,
        },
      }));
      void get().fetchDocs();
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

  deleteDoc: async (id) => {
    if (get().deletingDocId) return false;

    set({ deletingDocId: id, ingestFeedback: null });
    try {
      const res = await deleteDocumentById(id);
      set((state) => ({
        indexedDocs: state.indexedDocs.filter((d) => d.id !== id),
        selectedDocIds: state.selectedDocIds.filter((docId) => docId !== id),
        selectedDocId: state.selectedDocId === id ? null : state.selectedDocId,
        docToDelete: null,
        activeView:
          state.selectedDocId === id && state.activeView === 'document'
            ? 'library'
            : state.activeView,
        ingestFeedback: {
          type: 'success',
          text: `Deleted document (${res.deletedChunksCount} chunk${res.deletedChunksCount === 1 ? '' : 's'} removed).`,
        },
      }));
      void get().fetchStatus();
      return true;
    } catch (err) {
      set({
        ingestFeedback: {
          type: 'error',
          text:
            err instanceof Error ? err.message : 'Failed to delete document.',
        },
      });
      return false;
    } finally {
      set({ deletingDocId: null });
    }
  },
}));

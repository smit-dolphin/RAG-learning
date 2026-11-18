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

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
  pinned?: boolean;
}

export type WorkspaceView = 'chat' | 'library' | 'document';

export interface IndexedDoc {
  id: string;
  title: string;
  indexedAt?: string;
  chunksCount?: number;
  preview?: string;
  originalname?: string | null;
  filename?: string | null;
}

export interface IndexStatus {
  status: string;
  index: string;
  dimension?: number;
  totalRecordCount?: number;
}

export type ThemeCategory = 'ai-hud' | 'dark' | 'light';

export type ThemeId =
  | 'dark-plus'
  | 'vscode-contrast'
  | 'one-dark-pro'
  | 'dracula'
  | 'github-dark'
  | 'tokyo-night'
  | 'monokai-pro'
  | 'solarized-dark'
  | 'quiet-luxury'
  | 'jarvis'
  | 'ultron'
  | 'friday'
  | 'edith'
  | 'spider-ai'
  | 'hacker'
  | 'light-plus'
  | 'github-light';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  category: ThemeCategory;
  preview: {
    bg: string;
    surface: string;
    accent: string;
  };
}

export const VSCODE_THEMES: ThemeMeta[] = [
  // --- AI HUD & Sci-Fi Custom Themes ---
  {
    id: 'jarvis',
    name: 'J.A.R.V.I.S. (Stark AI)',
    category: 'ai-hud',
    preview: { bg: '#020712', surface: '#051024', accent: '#00e5ff' },
  },
  {
    id: 'edith',
    name: 'E.D.I.T.H. (Tactical Glasses)',
    category: 'ai-hud',
    preview: { bg: '#050811', surface: '#0b1020', accent: '#38bdf8' },
  },
  {
    id: 'friday',
    name: 'F.R.I.D.A.Y. (Irish Tech AI)',
    category: 'ai-hud',
    preview: { bg: '#060e14', surface: '#0b1722', accent: '#00e676' },
  },
  {
    id: 'spider-ai',
    name: "Spider-Man Suit AI (Karen/E.T.)",
    category: 'ai-hud',
    preview: { bg: '#070a14', surface: '#0e1322', accent: '#ef4444' },
  },
  {
    id: 'ultron',
    name: 'Ultron (Vibranium Core)',
    category: 'ai-hud',
    preview: { bg: '#0b0407', surface: '#14080e', accent: '#ff1744' },
  },
  {
    id: 'hacker',
    name: 'Matrix Phosphor (Hacker)',
    category: 'ai-hud',
    preview: { bg: '#030804', surface: '#071208', accent: '#00ff66' },
  },

  // --- VS Code & Developer Dark Themes ---
  {
    id: 'vscode-contrast',
    name: 'VS Code High Contrast',
    category: 'dark',
    preview: { bg: '#000000', surface: '#000000', accent: '#f38518' },
  },
  {
    id: 'dark-plus',
    name: 'VS Code Dark+',
    category: 'dark',
    preview: { bg: '#1e1e1e', surface: '#252526', accent: '#007acc' },
  },
  {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    category: 'dark',
    preview: { bg: '#282c34', surface: '#21252b', accent: '#61afef' },
  },
  {
    id: 'dracula',
    name: 'Dracula Official',
    category: 'dark',
    preview: { bg: '#282a36', surface: '#21222c', accent: '#bd93f9' },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    category: 'dark',
    preview: { bg: '#0d1117', surface: '#161b22', accent: '#58a6ff' },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    category: 'dark',
    preview: { bg: '#1a1b26', surface: '#16161e', accent: '#7aa2f7' },
  },
  {
    id: 'monokai-pro',
    name: 'Monokai Pro',
    category: 'dark',
    preview: { bg: '#2d2a2e', surface: '#221f22', accent: '#ffd866' },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    category: 'dark',
    preview: { bg: '#002b36', surface: '#073642', accent: '#2aa198' },
  },
  {
    id: 'quiet-luxury',
    name: 'Quiet Luxury (OLED)',
    category: 'dark',
    preview: { bg: '#09090b', surface: '#111114', accent: '#3b82f6' },
  },

  // --- Light Themes ---
  {
    id: 'light-plus',
    name: 'VS Code Light+',
    category: 'light',
    preview: { bg: '#ffffff', surface: '#f3f3f3', accent: '#005fb8' },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    category: 'light',
    preview: { bg: '#ffffff', surface: '#f6f8fa', accent: '#0969da' },
  },
];

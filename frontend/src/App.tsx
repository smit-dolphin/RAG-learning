import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import './App.css';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconChevronsUpDown,
  IconCopy,
  IconDatabase,
  IconFileText,
  IconLayers,
  IconLibrary,
  IconPin,
  IconPlus,
  IconSearch,
  IconSend,
  IconSidebar,
  IconSquarePen,
  IconTrash,
  IconUpload,
  IconX,
} from './components/Icons';
import { fetchDocumentById, type DocumentDetails } from './services/chatApi';
import { useRagStore } from './store/useRagStore';
import { VSCODE_THEMES } from './types/chat';

const PROMPT_SUGGESTIONS = [
  'Summarize the key points from my uploaded documents',
  'What are the core technical constraints or policies mentioned?',
  'Explain how Gemini embeddings ground responses in this pipeline',
  'Identify any gaps or missing context in the knowledge base',
];

function App() {
  const {
    theme,
    sidebarOpen,
    activeView,
    sessions,
    activeSessionId,
    isSending,
    expandedSources,
    isIngesting,
    deletingDocId,
    ingestFeedback,
    indexedDocs,
    indexStatus,
    setTheme,
    setSidebarOpen,
    setActiveView,
    createNewChat,
    selectSession,
    togglePinSession,
    deleteSession,
    clearMessages,
    clearIngestFeedback,
    toggleSourceExpansion,
    fetchStatus,
    fetchDocs,
    sendMessage,
    stopStreaming,
    ingestFileDoc,
    deleteDoc,
  } = useRagStore();

  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [docToDelete, setDocToDelete] = useState<{
    id: string;
    title: string;
    chunksCount?: number;
    originalname?: string | null;
  } | null>(null);

  // Selected document detail for inspector view
  const [activeDocDetails, setActiveDocDetails] = useState<DocumentDetails | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const messages = activeSession?.messages || [];

  const activeTheme =
    VSCODE_THEMES.find((t) => t.id === theme) || VSCODE_THEMES[0];
  const aiThemes = VSCODE_THEMES.filter((t) => t.category === 'ai-hud');
  const darkThemes = VSCODE_THEMES.filter((t) => t.category === 'dark');
  const lightThemes = VSCODE_THEMES.filter((t) => t.category === 'light');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    void fetchStatus();
    void fetchDocs();
  }, [fetchStatus, fetchDocs]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  async function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setInput('');
    await sendMessage(trimmed);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    clearIngestFeedback();
  }

  async function handleFileUpload() {
    if (!selectedFile || isIngesting) return;
    const ok = await ingestFileDoc(selectedFile);
    if (ok) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleChatSubmit(e: FormEvent) {
    e.preventDefault();
    void submitMessage(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitMessage(input);
    }
  }

  async function handleCopy(id: string, content: string) {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function inspectDocument(docId: string) {
    setIsLoadingDoc(true);
    try {
      const details = await fetchDocumentById(docId);
      setActiveDocDetails(details);
      setActiveView('document', docId);
    } catch (err) {
      console.error('Failed to load document details:', err);
    } finally {
      setIsLoadingDoc(false);
    }
  }

  async function handleConfirmDelete() {
    if (!docToDelete) return;
    const targetId = docToDelete.id;
    const ok = await deleteDoc(targetId);
    if (ok) {
      if (activeDocDetails?.id === targetId) {
        setActiveDocDetails(null);
      }
      setDocToDelete(null);
    }
  }

  useEffect(() => {
    function handleGlobalKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        if (docToDelete) {
          setDocToDelete(null);
        } else if (userMenuOpen) {
          setUserMenuOpen(false);
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [docToDelete, userMenuOpen]);

  // Filter sessions by search query
  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );
  const pinnedSessions = filteredSessions.filter((s) => s.pinned);
  const recentSessions = filteredSessions.filter((s) => !s.pinned);

  return (
    <div className="app-container">
      {sidebarOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ChatGPT-Style Sidebar: Header, Actions, Pinned, Recents, User Footer */}
      <aside
        className={`sidebar ${sidebarOpen ? '' : 'closed'}`}
        aria-label="Navigation and Workspace Sidebar"
      >
        {/* Sidebar Header: Brand + Search & Collapse Controls */}
        <div className="sidebar-header">
          <div
            className="brand-link"
            onClick={() => setActiveView('chat')}
            role="button"
            tabIndex={0}
          >
            <span className="brand-title">VectorMind</span>
            <span className="brand-badge-rag">RAG</span>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className={`icon-btn ${searchOpen ? 'active' : ''}`}
              onClick={() => {
                setSearchOpen((prev) => !prev);
                if (searchOpen) setSearchQuery('');
              }}
              aria-label="Search chats"
              title="Search chats"
            >
              <IconSearch />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <IconSidebar />
            </button>
          </div>
        </div>

        {/* Quick Search Bar (Toggled) */}
        {searchOpen && (
          <div className="sidebar-search-bar">
            <IconSearch />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <IconX />
              </button>
            )}
          </div>
        )}

        {/* Top Navigation Actions: New Chat & Knowledge Library */}
        <div className="sidebar-nav-actions">
          <button
            type="button"
            className={`nav-action-btn ${activeView === 'chat' && activeSession?.messages.length === 0 ? 'active' : ''}`}
            onClick={createNewChat}
          >
            <IconSquarePen />
            <span>New chat</span>
          </button>

          <button
            type="button"
            className={`nav-action-btn ${activeView === 'library' || activeView === 'document' ? 'active' : ''}`}
            onClick={() => setActiveView('library')}
          >
            <IconLibrary />
            <span className="nav-action-label">Knowledge Library</span>
            <span className="nav-action-pill">{indexedDocs.length}</span>
          </button>
        </div>

        {/* Scrollable Center: Pinned, Knowledge Files, and Recents */}
        <div className="sidebar-body">
          {/* Pinned Chats Section */}
          {pinnedSessions.length > 0 && (
            <section className="sidebar-section" aria-label="Pinned Chats">
              <div className="sidebar-section-label">Pinned</div>
              <div className="session-list">
                {pinnedSessions.map((session) => {
                  const isActive =
                    activeView === 'chat' && session.id === activeSession?.id;
                  return (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      className={`session-item ${isActive ? 'active' : ''}`}
                      onClick={() => selectSession(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectSession(session.id);
                        }
                      }}
                      title={session.title}
                    >
                      <span className="session-title">{session.title}</span>
                      <div className="session-item-actions">
                        <button
                          type="button"
                          className="item-action-btn pinned"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinSession(session.id);
                          }}
                          aria-label="Unpin chat"
                          title="Unpin chat"
                        >
                          <IconPin />
                        </button>
                        <button
                          type="button"
                          className="item-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                          aria-label={`Delete chat ${session.title}`}
                          title="Delete chat"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Quick Knowledge Upload Dropzone (Compact) */}
          <section className="sidebar-section" aria-label="Quick Upload">
            <div className="sidebar-section-header">
              <span className="sidebar-section-label">Knowledge Files</span>
              <button
                type="button"
                className="section-header-link"
                onClick={() => setActiveView('library')}
              >
                View all
              </button>
            </div>

            <label htmlFor="sidebar-file-input" className="compact-dropzone">
              <IconUpload />
              <div className="compact-dropzone-text">
                <span className="compact-dropzone-name">
                  {selectedFile ? selectedFile.name : 'Upload PDF, TXT, MD'}
                </span>
                <span className="compact-dropzone-hint">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                    : 'Click to index document'}
                </span>
              </div>
              <input
                id="sidebar-file-input"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                className="sr-only"
                onChange={handleFileChange}
                disabled={isIngesting}
              />
            </label>

            {selectedFile && (
              <button
                type="button"
                className="btn-primary compact-upload-btn"
                onClick={() => void handleFileUpload()}
                disabled={isIngesting}
              >
                <IconPlus />
                <span>{isIngesting ? 'Indexing...' : 'Index File'}</span>
              </button>
            )}

            {ingestFeedback && (
              <div className={`alert-box-compact ${ingestFeedback.type}`}>
                {ingestFeedback.text}
              </div>
            )}
          </section>

          {/* Recents Section */}
          <section className="sidebar-section" aria-label="Recent Chats">
            <div className="sidebar-section-label">Recents</div>
            <div className="session-list">
              {recentSessions.length === 0 ? (
                <div className="session-empty-hint">
                  {searchQuery ? 'No matching chats found' : 'No recent chats'}
                </div>
              ) : (
                recentSessions.map((session) => {
                  const isActive =
                    activeView === 'chat' && session.id === activeSession?.id;
                  return (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      className={`session-item ${isActive ? 'active' : ''}`}
                      onClick={() => selectSession(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectSession(session.id);
                        }
                      }}
                      title={session.title}
                    >
                      <span className="session-title">{session.title}</span>
                      <div className="session-item-actions">
                        <button
                          type="button"
                          className="item-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinSession(session.id);
                          }}
                          aria-label="Pin chat"
                          title="Pin chat"
                        >
                          <IconPin />
                        </button>
                        <button
                          type="button"
                          className="item-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                          aria-label={`Delete chat ${session.title}`}
                          title="Delete chat"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* Sidebar Footer: User Profile + Theme & System Controls Popover */}
        <div className="sidebar-footer">
          {userMenuOpen && (
            <div
              className="user-menu-backdrop"
              onClick={() => setUserMenuOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* Popover Menu with Theme Switcher & Vector Stats */}
          {userMenuOpen && (
            <div className="user-popover-menu" role="menu">
              <div className="popover-header">
                <span className="popover-title">Theme & Appearance</span>
                <span className="popover-active-name">{activeTheme.name}</span>
              </div>

              <div className="popover-themes-scroll">
                <div className="popover-section-label">AI & Sci-Fi HUD</div>
                {aiThemes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`popover-theme-item ${t.id === theme ? 'active' : ''}`}
                    onClick={() => {
                      setTheme(t.id);
                      setUserMenuOpen(false);
                    }}
                  >
                    <div className="theme-item-left">
                      <span
                        className="theme-swatch"
                        style={{ backgroundColor: t.preview.bg }}
                      >
                        <span
                          className="theme-swatch-half"
                          style={{ backgroundColor: t.preview.accent }}
                        />
                      </span>
                      <span>{t.name}</span>
                    </div>
                    {t.id === theme && (
                      <IconCheck className="theme-active-icon" />
                    )}
                  </button>
                ))}

                <div className="popover-section-label">VS Code & Dev Themes</div>
                {darkThemes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`popover-theme-item ${t.id === theme ? 'active' : ''}`}
                    onClick={() => {
                      setTheme(t.id);
                      setUserMenuOpen(false);
                    }}
                  >
                    <div className="theme-item-left">
                      <span
                        className="theme-swatch"
                        style={{ backgroundColor: t.preview.bg }}
                      >
                        <span
                          className="theme-swatch-half"
                          style={{ backgroundColor: t.preview.accent }}
                        />
                      </span>
                      <span>{t.name}</span>
                    </div>
                    {t.id === theme && (
                      <IconCheck className="theme-active-icon" />
                    )}
                  </button>
                ))}

                <div className="popover-section-label">Light Themes</div>
                {lightThemes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`popover-theme-item ${t.id === theme ? 'active' : ''}`}
                    onClick={() => {
                      setTheme(t.id);
                      setUserMenuOpen(false);
                    }}
                  >
                    <div className="theme-item-left">
                      <span
                        className="theme-swatch"
                        style={{ backgroundColor: t.preview.bg }}
                      >
                        <span
                          className="theme-swatch-half"
                          style={{ backgroundColor: t.preview.accent }}
                        />
                      </span>
                      <span>{t.name}</span>
                    </div>
                    {t.id === theme && (
                      <IconCheck className="theme-active-icon" />
                    )}
                  </button>
                ))}
              </div>

              <div className="popover-divider" />

              {/* Vector DB Telemetry in Popover */}
              <div className="popover-telemetry">
                <div className="popover-telemetry-row">
                  <span>Pinecone Index</span>
                  <span className="mono-badge">
                    {indexStatus?.index || 'rag-project'}
                  </span>
                </div>
                <div className="popover-telemetry-row">
                  <span>Dimension & Chunks</span>
                  <span className="mono-badge">
                    {indexStatus?.dimension ?? 768}d •{' '}
                    {indexStatus?.totalRecordCount ?? 0} vec
                  </span>
                </div>
              </div>

              <div className="popover-divider" />

              <button
                type="button"
                className="popover-action-btn danger"
                onClick={() => {
                  clearMessages();
                  setUserMenuOpen(false);
                }}
                disabled={messages.length === 0}
              >
                <IconTrash />
                <span>Clear current conversation</span>
              </button>
            </div>
          )}

          {/* User Account Card (ChatGPT Style) */}
          <div
            className="user-profile-card"
            onClick={() => setUserMenuOpen((prev) => !prev)}
            role="button"
            tabIndex={0}
            aria-expanded={userMenuOpen}
            aria-label="User settings and theme manager"
          >
            <div className="user-avatar">SG</div>
            <div className="user-info">
              <span className="user-name">Smit Gajjar</span>
              <span className="user-plan">Free • {activeTheme.name}</span>
            </div>
            <IconChevronsUpDown className="user-chevron" />
          </div>

          {/* Offer / Vector Telemetry Pill Button */}
          <button
            type="button"
            className="claim-offer-btn"
            onClick={() => setActiveView('library')}
            title="Inspect Vector Knowledge Base"
          >
            <IconDatabase />
            <span>
              {indexStatus?.totalRecordCount ?? 99} Chunks in Knowledge Base
            </span>
          </button>
        </div>
      </aside>

      {/* Main Agent Workspace Stage */}
      <main className="main-stage">
        {/* Top Control Bar */}
        <header className="top-bar">
          <div className="top-bar-left">
            {!sidebarOpen && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <IconSidebar />
              </button>
            )}

            <div className="breadcrumbs">
              <span
                className="crumb-link"
                onClick={() => setActiveView('chat')}
              >
                VectorMind
              </span>
              <span className="crumb-separator">/</span>
              <span className="crumb-active">
                {activeView === 'chat' && (activeSession?.title || 'New chat')}
                {activeView === 'library' && 'Knowledge Library'}
                {activeView === 'document' && (activeDocDetails?.title || 'Document Inspector')}
              </span>
            </div>

            <div className="grounding-tag">
              <IconDatabase />
              <span>Grounded with Pinecone</span>
            </div>
          </div>

          <div className="top-bar-right">
            {activeView !== 'chat' && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setActiveView('chat')}
              >
                <IconArrowLeft />
                <span>Back to chat</span>
              </button>
            )}

            {activeView === 'chat' && (
              <button
                type="button"
                className="btn-ghost"
                onClick={clearMessages}
                disabled={messages.length === 0 || isSending}
                aria-label="Clear chat messages"
              >
                <IconTrash />
                <span>Clear</span>
              </button>
            )}
          </div>
        </header>

        {/* View 1: Main Chat Conversation View */}
        {activeView === 'chat' && (
          <>
            <div className="chat-scroll">
              <div className="chat-center-container">
                {messages.length === 0 ? (
                  <div className="zero-state">
                    <span className="zero-badge">
                      <IconLayers />
                      <span>gemini-3.5-flash-lite • Pinecone RAG</span>
                    </span>
                    <h1>What can I help with?</h1>
                    <p>
                      Ask questions grounded on your uploaded PDFs, notes, and
                      markdown files.
                    </p>

                    <div className="prompt-suggestions-grid">
                      {PROMPT_SUGGESTIONS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="prompt-card"
                          onClick={() => void submitMessage(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, msgIndex) => (
                    <article
                      key={msg.id}
                      className={`message-card ${msg.role} ${msg.isError ? 'error' : ''}`}
                    >
                      <div className="message-meta-bar">
                        <div className="author-info">
                          <span className="author-name">
                            {msg.role === 'user' ? 'You' : 'VectorMind'}
                          </span>
                          {msg.role === 'assistant' && !msg.isError && (
                            <span className="model-pill">
                              gemini-3.5-flash-lite
                            </span>
                          )}
                        </div>

                        <div className="author-info">
                          <span className="message-timestamp">
                            {msg.timestamp}
                          </span>
                          {msg.role === 'assistant' && !msg.isError && (
                            <button
                              type="button"
                              className="action-icon-btn"
                              onClick={() => void handleCopy(msg.id, msg.content)}
                              aria-label="Copy message text"
                            >
                              {copiedId === msg.id ? (
                                <IconCheck />
                              ) : (
                                <IconCopy />
                              )}
                              <span>
                                {copiedId === msg.id ? 'Copied' : 'Copy'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {msg.role === 'assistant' &&
                      !msg.content &&
                      isSending &&
                      msgIndex === messages.length - 1 ? (
                        <div className="thinking-status" aria-live="polite">
                          <span className="pulse-indicator" aria-hidden="true" />
                          <span>Thinking & querying Pinecone...</span>
                        </div>
                      ) : (
                        <div className="message-text">{msg.content}</div>
                      )}

                      {/* Retrieved Sources Accordion */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="sources-panel">
                          <div
                            className="sources-panel-summary"
                            onClick={() => toggleSourceExpansion(msg.id)}
                            role="button"
                            tabIndex={0}
                            aria-expanded={Boolean(expandedSources[msg.id])}
                          >
                            <span>
                              Retrieved Context ({msg.sources.length} Pinecone
                              chunks)
                            </span>
                            <IconChevronDown />
                          </div>

                          {expandedSources[msg.id] && (
                            <div className="sources-cards-row">
                              {msg.sources.map((src, i) => (
                                <div key={src.id || i} className="source-item">
                                  <div className="source-header">
                                    <span className="source-title">
                                      <IconFileText />
                                      <span>
                                        {src.metadata?.title || src.id}
                                      </span>
                                    </span>
                                    {typeof src.score === 'number' && (
                                      <span className="source-score-badge">
                                        {(src.score * 100).toFixed(1)}% match
                                      </span>
                                    )}
                                  </div>
                                  {src.metadata?.text && (
                                    <p className="source-excerpt">
                                      {src.metadata.text}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  ))
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Floating Composer Area */}
            <footer className="composer-dock">
              <div className="composer-shell">
                <form className="composer-box" onSubmit={handleChatSubmit}>
                  <label htmlFor="agent-chat-input" className="sr-only">
                    Ask VectorMind
                  </label>
                  <textarea
                    id="agent-chat-input"
                    ref={composerInputRef}
                    rows={1}
                    className="composer-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message VectorMind..."
                    disabled={isSending}
                  />
                  {isSending ? (
                    <button
                      type="button"
                      className="btn-primary composer-submit-btn"
                      onClick={stopStreaming}
                      aria-label="Stop generating"
                      title="Stop generating"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="btn-primary composer-submit-btn"
                      disabled={!input.trim()}
                      aria-label="Send query"
                    >
                      <IconSend />
                    </button>
                  )}
                </form>

                <div className="composer-footer">
                  <span>VectorMind can make mistakes. Verify important info.</span>
                </div>
              </div>
            </footer>
          </>
        )}

        {/* View 2: Knowledge Library Management View */}
        {activeView === 'library' && (
          <div className="library-view-container">
            <div className="library-view-content">
              <div className="library-header">
                <div>
                  <h1 className="library-title">Knowledge Library</h1>
                  <p className="library-subtitle">
                    Manage and inspect documents ingested into your Pinecone
                    vector index.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isIngesting}
                >
                  <IconUpload />
                  <span>Upload Document</span>
                </button>
              </div>

              {/* Upload Zone */}
              <div className="library-upload-card">
                <label htmlFor="library-main-input" className="file-dropzone">
                  <IconUpload />
                  <span className="file-dropzone-name">
                    {selectedFile
                      ? selectedFile.name
                      : 'Choose or drop PDF, TXT, or MD'}
                  </span>
                  <span className="file-dropzone-hint">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                      : 'Embeddings generated automatically via Gemini (768d)'}
                  </span>
                  <input
                    id="library-main-input"
                    type="file"
                    accept=".pdf,.txt,.md"
                    className="sr-only"
                    onChange={handleFileChange}
                    disabled={isIngesting}
                  />
                </label>

                {selectedFile && (
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: '10px' }}
                    onClick={() => void handleFileUpload()}
                    disabled={isIngesting}
                  >
                    <IconPlus />
                    <span>
                      {isIngesting ? 'Uploading & Indexing...' : 'Start Ingestion'}
                    </span>
                  </button>
                )}

                {ingestFeedback && (
                  <div className={`alert-box ${ingestFeedback.type}`} style={{ marginTop: '10px' }}>
                    {ingestFeedback.text}
                  </div>
                )}
              </div>

              {/* Documents Grid */}
              <div className="library-docs-section">
                <div className="library-section-title">
                  <span>Indexed Documents ({indexedDocs.length})</span>
                </div>

                <div className="library-docs-grid">
                  {indexedDocs.map((doc) => (
                    <article key={doc.id} className="library-doc-card">
                      <div className="library-doc-card-header">
                        <div className="doc-icon-badge">
                          <IconFileText />
                        </div>
                        <div className="library-doc-card-actions">
                          <div className="doc-badge-pill">
                            {doc.chunksCount ?? 1} chunks
                          </div>
                          <button
                            type="button"
                            className="doc-delete-btn"
                            onClick={() =>
                              setDocToDelete({
                                id: doc.id,
                                title: doc.title,
                                chunksCount: doc.chunksCount,
                                originalname: doc.originalname,
                              })
                            }
                            disabled={deletingDocId === doc.id}
                            aria-label={`Delete document ${doc.title}`}
                            title="Delete document"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </div>

                      <h3 className="library-doc-title">{doc.title}</h3>

                      {doc.preview && (
                        <p className="library-doc-preview">{doc.preview}</p>
                      )}

                      <div className="library-doc-footer">
                        <span className="library-doc-meta">
                          {doc.originalname || doc.id}
                        </span>
                        <button
                          type="button"
                          className="inspect-doc-btn"
                          onClick={() => void inspectDocument(doc.id)}
                        >
                          Inspect Chunks →
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View 3: Document Chunk Inspector View */}
        {activeView === 'document' && (
          <div className="inspector-view-container">
            <div className="inspector-view-content">
              <div className="inspector-header">
                <div className="inspector-header-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setActiveView('library')}
                  >
                    <IconArrowLeft />
                    <span>Back to Library</span>
                  </button>
                  {activeDocDetails && (
                    <button
                      type="button"
                      className="btn-ghost doc-inspector-delete-btn"
                      onClick={() =>
                        setDocToDelete({
                          id: activeDocDetails.id,
                          title: activeDocDetails.title,
                          chunksCount: activeDocDetails.chunksCount,
                          originalname: activeDocDetails.filename,
                        })
                      }
                      disabled={deletingDocId === activeDocDetails.id}
                    >
                      <IconTrash />
                      <span>Delete Document</span>
                    </button>
                  )}
                </div>
                <div className="inspector-title-group">
                  <h1 className="inspector-title">
                    {activeDocDetails?.title || 'Document Details'}
                  </h1>
                  <span className="inspector-meta">
                    {activeDocDetails?.chunksCount ?? 0} Pinecone chunks • Base
                    ID: {activeDocDetails?.id}
                  </span>
                </div>
              </div>

              {isLoadingDoc ? (
                <div className="thinking-status" style={{ padding: '40px 0' }}>
                  <span className="pulse-indicator" />
                  <span>Loading chunks from Pinecone...</span>
                </div>
              ) : activeDocDetails ? (
                <div className="inspector-grid">
                  <div className="chunks-list">
                    <h2 className="inspector-subheading">
                      Vector Chunks ({activeDocDetails.chunks.length})
                    </h2>
                    {activeDocDetails.chunks.map((chunk) => (
                      <div key={chunk.id} className="chunk-card">
                        <div className="chunk-header">
                          <span className="chunk-index-badge">
                            Chunk #{chunk.index}
                          </span>
                          <span className="chunk-id-text">{chunk.id}</span>
                        </div>
                        <p className="chunk-text">{chunk.text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="fulltext-panel">
                    <h2 className="inspector-subheading">Reconstructed Text</h2>
                    <pre className="fulltext-pre">
                      {activeDocDetails.fullText}
                    </pre>
                  </div>
                </div>
              ) : (
                <p>Document not found or could not be loaded.</p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Modal for Document Deletion */}
      {docToDelete && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!deletingDocId) setDocToDelete(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-icon-badge danger">
                <IconAlertTriangle />
              </div>
              <div className="modal-title-group">
                <h2 id="delete-dialog-title" className="modal-title">
                  Delete Document
                </h2>
                <span className="modal-subtitle">
                  This action cannot be undone
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDocToDelete(null)}
                disabled={Boolean(deletingDocId)}
                aria-label="Close dialog"
              >
                <IconX />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-prompt-text">
                Are you sure you want to permanently delete this document from the
                knowledge base?
              </p>

              <div className="modal-doc-summary">
                <div className="modal-doc-summary-title">
                  {docToDelete.title}
                </div>
                <div className="modal-doc-summary-meta">
                  <span className="summary-pill">
                    {docToDelete.chunksCount ?? 1}{' '}
                    {(docToDelete.chunksCount ?? 1) === 1 ? 'chunk' : 'chunks'}
                  </span>
                  <span className="summary-id">
                    {docToDelete.originalname || docToDelete.id}
                  </span>
                </div>
              </div>

              <p className="modal-warning-subtext">
                All associated embeddings in the Pinecone vector index and uploaded
                source files on disk will be immediately purged.
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setDocToDelete(null)}
                disabled={Boolean(deletingDocId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-delete"
                onClick={() => void handleConfirmDelete()}
                disabled={Boolean(deletingDocId)}
              >
                {deletingDocId === docToDelete.id ? (
                  <>
                    <span className="btn-spinner" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <IconTrash />
                    <span>Delete Document</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconAudioWave,
  IconCheck,
  IconChevronsUpDown,
  IconDatabase,
  IconLibrary,
  IconPin,
  IconPlus,
  IconSearch,
  IconSidebar,
  IconSquarePen,
  IconTrash,
  IconUpload,
  IconX,
} from '../components/Icons';
import { fileUploadSchema } from '../schemas/api';
import { useRagStore } from '../store/useRagStore';
import { VSCODE_THEMES } from '../types/chat';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    theme,
    sidebarOpen,
    sessions,
    activeSessionId,
    indexedDocs,
    indexStatus,
    docToDelete,
    deletingDocId,
    isIngesting,
    ingestFeedback,
    isSending,
    setTheme,
    setSidebarOpen,
    createNewChat,
    selectSession,
    togglePinSession,
    deleteSession,
    clearMessages,
    clearIngestFeedback,
    fetchStatus,
    fetchDocs,
    ingestFileDoc,
    deleteDoc,
    setDocToDelete,
  } = useRagStore();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const messages = activeSession?.messages || [];

  const activeTheme =
    VSCODE_THEMES.find((t) => t.id === theme) || VSCODE_THEMES[0];
  const aiThemes = VSCODE_THEMES.filter((t) => t.category === 'ai-hud');
  const darkThemes = VSCODE_THEMES.filter((t) => t.category === 'dark');
  const lightThemes = VSCODE_THEMES.filter((t) => t.category === 'light');

  // Determine current active section from location
  const isLibraryView = location.pathname.startsWith('/library');
  const isDocView = location.pathname.startsWith('/documents/');
  const isSfxView = location.pathname.startsWith('/sfx');
  const isChatView = !isLibraryView && !isDocView && !isSfxView;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    void fetchStatus();
    void fetchDocs();
  }, [fetchStatus, fetchDocs]);

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
  }, [docToDelete, userMenuOpen, setDocToDelete]);

  function goToChat(targetSessionId?: string) {
    const id = targetSessionId || activeSessionId;
    selectSession(id);
    navigate('/c/' + id);
  }

  function goToNewChat() {
    const newId = createNewChat();
    navigate('/c/' + newId);
  }

  function goToLibrary() {
    navigate('/library');
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    clearIngestFeedback();
  }

  async function handleFileUpload() {
    if (!selectedFile || isIngesting) return;
    const validated = fileUploadSchema.safeParse({
      name: selectedFile.name,
      size: selectedFile.size,
    });
    if (!validated.success) {
      alert(validated.error.issues[0]?.message || 'Invalid file');
      return;
    }
    const ok = await ingestFileDoc(selectedFile);
    if (ok) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleConfirmDelete() {
    if (!docToDelete) return;
    const targetId = docToDelete.id;
    const ok = await deleteDoc(targetId);
    if (ok) {
      if (location.pathname.startsWith('/documents/' + encodeURIComponent(targetId))) {
        navigate('/library');
      }
    }
  }

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

      {/* ChatGPT-Style Sidebar */}
      <aside
        className={`sidebar ${sidebarOpen ? '' : 'closed'}`}
        aria-label="Navigation and Workspace Sidebar"
      >
        {/* Sidebar Header: Brand + Search & Collapse Controls */}
        <div className="sidebar-header">
          <div
            className="brand-link"
            onClick={() => goToChat()}
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
            className={`nav-action-btn ${isChatView && activeSession?.messages.length === 0 ? 'active' : ''}`}
            onClick={goToNewChat}
          >
            <IconSquarePen />
            <span>New chat</span>
          </button>

          <Link
            to="/library"
            className={`nav-action-btn ${isLibraryView || isDocView ? 'active' : ''}`}
          >
            <IconLibrary />
            <span className="nav-action-label">Knowledge Library</span>
            <span className="nav-action-pill">{indexedDocs.length}</span>
          </Link>

          <Link
            to="/sfx"
            className={`nav-action-btn ${isSfxView ? 'active' : ''}`}
          >
            <IconAudioWave />
            <span className="nav-action-label">SFX Studio</span>
            <span className="nav-action-pill">DSP</span>
          </Link>
        </div>

        {/* Scrollable Center: Pinned, Knowledge Files, and Recents */}
        <div className="sidebar-body">
          {/* Pinned Chats Section */}
          {pinnedSessions.length > 0 && (
            <section className="sidebar-section" aria-label="Pinned Chats">
              <div className="sidebar-section-label">Pinned</div>
              <div className="session-list">
                {pinnedSessions.map((session) => {
                  const isActive = isChatView && session.id === activeSession?.id;
                  return (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      className={`session-item ${isActive ? 'active' : ''}`}
                      onClick={() => goToChat(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToChat(session.id);
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
                onClick={goToLibrary}
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
                  const isActive = isChatView && session.id === activeSession?.id;
                  return (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      className={`session-item ${isActive ? 'active' : ''}`}
                      onClick={() => goToChat(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goToChat(session.id);
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
            onClick={goToLibrary}
            title="Inspect Vector Knowledge Base"
          >
            <IconDatabase />
            <span>
              {indexStatus?.totalRecordCount ?? 99} Chunks in Knowledge Base
            </span>
          </button>
        </div>
      </aside>

      {/* Main Stage */}
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
                onClick={() => goToChat()}
              >
                VectorMind
              </span>
              <span className="crumb-separator">/</span>
              <span
                className="crumb-active"
                onClick={() => {
                  if (isDocView) goToLibrary();
                }}
              >
                {isChatView && (activeSession?.title || 'New chat')}
                {isLibraryView && 'Knowledge Library'}
                {isDocView && 'Document Inspector'}
                {isSfxView && 'Game SFX Studio'}
              </span>
            </div>

            {/* ChatGPT-style Active Chat Tab */}
            {isChatView && activeSession && (
              <div
                className="topbar-chat-tab"
                title={`Current Chat: ${activeSession.title}`}
              >
                <span className="topbar-tab-icon">
                  <IconSquarePen />
                </span>
                <span className="topbar-tab-title">
                  {activeSession.title}
                </span>
                <span className="topbar-tab-badge">
                  {messages.length}
                </span>
              </div>
            )}

            <div className="grounding-tag">
              <IconDatabase />
              <span>Grounded with Pinecone</span>
            </div>
          </div>

          <div className="top-bar-right">
            {!isChatView && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => goToChat()}
              >
                <IconArrowLeft />
                <span>Back to chat</span>
              </button>
            )}

            {isChatView && (
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

        {/* Outlet renders the page for current route */}
        <Outlet />
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

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconFileText,
  IconFilter,
  IconLayers,
  IconSearch,
  IconSend,
  IconX,
} from '../components/Icons';
import { chatInputSchema } from '../schemas/api';
import { useRagStore } from '../store/useRagStore';

const PROMPT_SUGGESTIONS = [
  'Summarize the key points from my uploaded documents',
  'What are the core technical constraints or policies mentioned?',
  'Explain how Gemini embeddings ground responses in this pipeline',
  'Identify any gaps or missing context in the knowledge base',
];

export default function ChatPage() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();

  const {
    sessions,
    activeSessionId,
    selectSession,
    isSending,
    expandedSources,
    selectedDocIds,
    strictDocs,
    agenticMode,
    activeToolStatus,
    indexedDocs,
    setSelectedDocIds,
    toggleDocSelection,
    clearDocSelection,
    setStrictDocs,
    setAgenticMode,
    sendMessage,
    stopStreaming,
    toggleSourceExpansion,
    setActiveView,
  } = useRagStore();

  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [scopeSearchQuery, setScopeSearchQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync route param with store active session
  useEffect(() => {
    setActiveView('chat');
    if (sessionId && sessionId !== activeSessionId) {
      const match = sessions.find((s) => s.id === sessionId);
      if (match) {
        selectSession(sessionId);
      }
    }
  }, [sessionId, activeSessionId, sessions, selectSession, setActiveView]);

  const activeSession =
    sessions.find((s) => s.id === (sessionId || activeSessionId)) || sessions[0];
  const messages = activeSession?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  // Handle escape to close scope menu
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape' && scopeMenuOpen) {
        setScopeMenuOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scopeMenuOpen]);

  async function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    // Validate chat input with Zod
    const validated = chatInputSchema.safeParse(trimmed);
    if (!validated.success) return;

    setInput('');

    // Ensure URL has current session id
    if (!sessionId && activeSession) {
      navigate('/c/' + activeSession.id, { replace: true });
    }

    await sendMessage(trimmed);
  }

  function handleChatSubmit(e: FormEvent) {
    e.preventDefault();
    void submitMessage(input);
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
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

  return (
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
                Ask questions grounded on your uploaded PDFs, notes, and markdown
                files.
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
            messages.map((msg, msgIndex) => {
              // Render User Message as ChatGPT-style Prompt Tab
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="user-prompt-tab-row">
                    <div className="user-prompt-tab">
                      <div className="user-prompt-tab-header">
                        <span className="user-prompt-tab-label">Prompt</span>
                        <div className="user-prompt-tab-actions">
                          <span className="message-timestamp">
                            {msg.timestamp}
                          </span>
                          <button
                            type="button"
                            className="action-icon-btn compact"
                            onClick={() => void handleCopy(msg.id, msg.content)}
                            aria-label="Copy prompt"
                            title="Copy prompt"
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
                        </div>
                      </div>
                      <div className="user-prompt-tab-content">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              }

              // Render Assistant Message
              return (
                <article
                  key={msg.id}
                  className={`message-card assistant ${msg.isError ? 'error' : ''}`}
                >
                  <div className="message-meta-bar">
                    <div className="author-info">
                      <span className="author-name">VectorMind</span>
                      {!msg.isError && (
                        <span className="model-pill">gemini-3.5-flash-lite</span>
                      )}
                    </div>

                    <div className="author-info">
                      <span className="message-timestamp">{msg.timestamp}</span>
                      {!msg.isError && (
                        <button
                          type="button"
                          className="action-icon-btn"
                          onClick={() => void handleCopy(msg.id, msg.content)}
                          aria-label="Copy message text"
                        >
                          {copiedId === msg.id ? <IconCheck /> : <IconCopy />}
                          <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {!msg.content &&
                  isSending &&
                  msgIndex === messages.length - 1 ? (
                    <div className="thinking-status" aria-live="polite">
                      <span className="pulse-indicator" aria-hidden="true" />
                      <span>
                        {activeToolStatus ||
                          (agenticMode
                            ? 'Agent reasoning...'
                            : 'Thinking & querying Pinecone...')}
                      </span>
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
              );
            })
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating Composer Area */}
      <footer className="composer-dock">
        <div className="composer-shell">
          {/* Knowledge Scope Filter Bar + Agentic Toggle */}
          <div className="composer-scope-bar">
            <button
              type="button"
              className={`scope-pill-btn ${agenticMode ? 'active' : ''}`}
              onClick={() => setAgenticMode(!agenticMode)}
              aria-pressed={agenticMode}
              title={
                agenticMode
                  ? 'Agentic Mode ON: AI decides when to search or list docs'
                  : 'Fast RAG Mode: Always queries Pinecone directly'
              }
            >
              <IconLayers />
              <span className="scope-pill-label">
                {agenticMode ? 'Agentic' : 'Fast RAG'}
              </span>
            </button>

            <div className="scope-popover-wrapper">
              <button
                type="button"
                className={`scope-pill-btn ${selectedDocIds.length > 0 ? 'active' : ''}`}
                onClick={() => setScopeMenuOpen((prev) => !prev)}
                aria-expanded={scopeMenuOpen}
                aria-haspopup="dialog"
                title="Manage knowledge documents scope"
              >
                <IconFilter />
                <span className="scope-pill-label">
                  {selectedDocIds.length === 0
                    ? `All Knowledge (${indexedDocs.length})`
                    : selectedDocIds.length === 1
                    ? (indexedDocs.find((d) => d.id === selectedDocIds[0])
                        ?.title || '1 Document')
                    : `${selectedDocIds.length} Docs Scoped`}
                </span>
                <IconChevronDown
                  className={`scope-chevron ${scopeMenuOpen ? 'open' : ''}`}
                />
              </button>

              {scopeMenuOpen && (
                <>
                  <div
                    className="scope-popover-backdrop"
                    onClick={() => setScopeMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    className="scope-popover-menu"
                    role="dialog"
                    aria-label="Knowledge Scope Selector"
                  >
                    <div className="scope-popover-header">
                      <div>
                        <div className="scope-popover-title">Knowledge Scope</div>
                        <div className="scope-popover-sub">
                          {selectedDocIds.length === 0
                            ? 'Searching all indexed documents'
                            : `Restricted to ${selectedDocIds.length} document${selectedDocIds.length === 1 ? '' : 's'}`}
                        </div>
                      </div>
                      <div className="scope-popover-actions">
                        {selectedDocIds.length > 0 ? (
                          <button
                            type="button"
                            className="scope-action-link"
                            onClick={() => clearDocSelection()}
                          >
                            Reset to All
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="scope-action-link"
                            onClick={() =>
                              setSelectedDocIds(indexedDocs.map((d) => d.id))
                            }
                            disabled={indexedDocs.length === 0}
                          >
                            Select All
                          </button>
                        )}
                      </div>
                    </div>

                    {indexedDocs.length > 4 && (
                      <div className="scope-search-box">
                        <IconSearch />
                        <input
                          type="text"
                          placeholder="Filter documents..."
                          value={scopeSearchQuery}
                          onChange={(e) => setScopeSearchQuery(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="scope-docs-list">
                      <button
                        type="button"
                        className={`scope-doc-item ${selectedDocIds.length === 0 ? 'selected' : ''}`}
                        onClick={() => {
                          clearDocSelection();
                          setScopeMenuOpen(false);
                        }}
                      >
                        <div className="scope-doc-checkbox">
                          {selectedDocIds.length === 0 && <IconCheck />}
                        </div>
                        <div className="scope-doc-info">
                          <span className="scope-doc-name">
                            All Documents (Global)
                          </span>
                          <span className="scope-doc-meta">
                            Query entire Pinecone index ({indexedDocs.length} docs)
                          </span>
                        </div>
                      </button>

                      <div className="scope-list-divider" />

                      {indexedDocs.length === 0 ? (
                        <div className="scope-empty-text">
                          No indexed documents found. Upload files in Library.
                        </div>
                      ) : (
                        indexedDocs
                          .filter((d) =>
                            d.title
                              .toLowerCase()
                              .includes(scopeSearchQuery.toLowerCase().trim())
                          )
                          .map((d) => {
                            const isChecked = selectedDocIds.includes(d.id);
                            return (
                              <button
                                key={d.id}
                                type="button"
                                className={`scope-doc-item ${isChecked ? 'selected' : ''}`}
                                onClick={() => toggleDocSelection(d.id)}
                              >
                                <div className="scope-doc-checkbox">
                                  {isChecked && <IconCheck />}
                                </div>
                                <div className="scope-doc-info">
                                  <span className="scope-doc-name">
                                    {d.title}
                                  </span>
                                  <span className="scope-doc-meta">
                                    {d.chunksCount ?? 1} chunks •{' '}
                                    {d.originalname || d.id}
                                  </span>
                                </div>
                              </button>
                            );
                          })
                      )}
                    </div>

                    <div className="scope-popover-footer">
                      <label className="scope-strict-toggle">
                        <input
                          type="checkbox"
                          checked={strictDocs}
                          onChange={(e) => setStrictDocs(e.target.checked)}
                        />
                        <span className="strict-toggle-text">
                          <strong>Strict Docs Only</strong>
                          <small>Refuse answer if not in context</small>
                        </span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Active chips row */}
            {selectedDocIds.length > 0 && (
              <div className="active-scope-chips">
                {selectedDocIds.map((id) => {
                  const doc = indexedDocs.find((d) => d.id === id);
                  return (
                    <span key={id} className="scope-chip">
                      <span
                        className="scope-chip-title"
                        title={doc?.title || id}
                      >
                        {doc?.title || id}
                      </span>
                      <button
                        type="button"
                        className="scope-chip-close"
                        onClick={() => toggleDocSelection(id)}
                        aria-label={`Remove ${doc?.title || id} from scope`}
                      >
                        <IconX />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  className="scope-chip-clear-all"
                  onClick={clearDocSelection}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

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
              onKeyDown={handleInputKeyDown}
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
  );
}

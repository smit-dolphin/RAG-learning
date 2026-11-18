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
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDatabase,
  IconFileText,
  IconLayers,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSend,
  IconSidebar,
  IconSpark,
  IconSun,
  IconTrash,
} from './components/Icons';
import { useRagStore } from './store/useRagStore';

const PROMPT_SUGGESTIONS = [
  'Summarize the core points from my indexed documents',
  'What does the uploaded document say about leave policy?',
  'Explain how Gemini embeddings ground responses in this pipeline',
  'Identify any gaps or missing context in the knowledge base',
];

const SAMPLE_TECH_DOC = {
  title: 'RAG Pipeline Specification v2',
  content: `Architecture Overview:
1. Ingestion: Documents are processed, converted into 768-dimensional dense vector embeddings using Google's gemini-embedding-001 model with outputDimensionality configured to 768.
2. Storage: Vectors are stored in a Pinecone serverless index named 'rag-project' using Cosine similarity metric.
3. Retrieval: Incoming user queries are embedded on-the-fly and matched against top_k=3 nearest document records in Pinecone.
4. Grounding & Generation: Retrieved chunk metadata is formatted into an authoritative context block passed to Gemini with strict instructions to answer truthfully based on the retrieved context.`,
};

function App() {
  const {
    theme,
    sidebarOpen,
    sidebarTab,
    messages,
    isSending,
    expandedSources,
    isIngesting,
    ingestFeedback,
    indexedDocs,
    searchQuery,
    indexStatus,
    toggleTheme,
    setSidebarOpen,
    setSidebarTab,
    setSearchQuery,
    clearMessages,
    clearIngestFeedback,
    toggleSourceExpansion,
    fetchStatus,
    sendMessage,
    ingestTextDoc,
    ingestFileDoc,
  } = useRagStore();

  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  function loadSampleDoc() {
    setDocTitle(SAMPLE_TECH_DOC.title);
    setDocContent(SAMPLE_TECH_DOC.content);
    setSelectedFile(null);
    setSidebarTab('ingest');
    clearIngestFeedback();
  }

  async function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setInput('');
    await sendMessage(trimmed);
  }

  async function handleTextIngest(e: FormEvent) {
    e.preventDefault();
    const ok = await ingestTextDoc(docTitle, docContent);
    if (ok) {
      setDocTitle('');
      setDocContent('');
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    clearIngestFeedback();
  }

  async function handleFileUpload() {
    if (!selectedFile || isIngesting) return;
    const ok = await ingestFileDoc(selectedFile, docTitle);
    if (ok) {
      setSelectedFile(null);
      setDocTitle('');
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

  const filteredDocs = indexedDocs.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const estimatedTokens = Math.ceil(docContent.length / 4);

  return (
    <div className="app-container">
      {sidebarOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: Knowledge Base & Vector Ingestion */}
      <aside
        className={`sidebar ${sidebarOpen ? '' : 'closed'}`}
        aria-label="Knowledge Base & Ingestion"
      >
        <div className="sidebar-header">
          <div className="brand-wrapper">
            <div className="brand-badge">
              <IconSpark />
            </div>
            <div className="brand-title-group">
              <span className="brand-title">RAG Agent Studio</span>
              <span className="brand-meta">Gemini + Pinecone</span>
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setSidebarOpen(false)}
            aria-label="Collapse sidebar"
          >
            <IconSidebar />
          </button>
        </div>

        {/* Live Vector Telemetry */}
        <div className="sidebar-telemetry">
          <div className="telemetry-row">
            <span className="telemetry-label">Vector Index</span>
            <span className="telemetry-value">
              <span className="status-dot-sm" />
              {indexStatus?.index || 'rag-project'}
            </span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-label">Dimensions / Vectors</span>
            <span className="telemetry-value">
              {indexStatus?.dimension ?? 768}d •{' '}
              {indexStatus?.totalRecordCount ?? 0} records
            </span>
          </div>
        </div>

        {/* Sidebar Navigation Tabs */}
        <div className="sidebar-tabs">
          <button
            type="button"
            className={`tab-btn ${sidebarTab === 'ingest' ? 'active' : ''}`}
            onClick={() => setSidebarTab('ingest')}
          >
            Ingest Data
          </button>
          <button
            type="button"
            className={`tab-btn ${sidebarTab === 'documents' ? 'active' : ''}`}
            onClick={() => setSidebarTab('documents')}
          >
            Session ({indexedDocs.length})
          </button>
        </div>

        <div className="sidebar-body">
          {sidebarTab === 'ingest' ? (
            <div className="ingest-form">
              <div className="form-group">
                <label htmlFor="doc-file-input" className="form-label">
                  Upload File (.pdf, .txt, .md)
                </label>
                <label htmlFor="doc-file-input" className="file-dropzone">
                  <IconFileText />
                  <span className="file-dropzone-name">
                    {selectedFile ? selectedFile.name : 'Choose a file to index'}
                  </span>
                  <span className="file-dropzone-hint">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                      : 'PDF, TXT, or Markdown up to 10 MB'}
                  </span>
                  <input
                    id="doc-file-input"
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
                    className="btn-primary"
                    onClick={() => void handleFileUpload()}
                    disabled={isIngesting}
                  >
                    <IconPlus />
                    <span>
                      {isIngesting ? 'Uploading & Indexing...' : 'Upload & Index File'}
                    </span>
                  </button>
                )}
              </div>

              <div className="ingest-divider">or paste text</div>

              <form className="ingest-form" onSubmit={handleTextIngest}>
                <div className="form-group">
                  <div className="form-label-row">
                    <label htmlFor="doc-title-input" className="form-label">
                      Document Title
                    </label>
                    <button
                      type="button"
                      className="preset-trigger-btn"
                      onClick={loadSampleDoc}
                    >
                      Load sample doc
                    </button>
                  </div>
                  <input
                    id="doc-title-input"
                    type="text"
                    className="input-text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="e.g. System Security Spec"
                    disabled={isIngesting}
                  />
                </div>

                <div className="form-group">
                  <div className="form-label-row">
                    <label htmlFor="doc-content-input" className="form-label">
                      Document Text
                    </label>
                    <span className="form-meta">
                      {docContent.length} chars (~{estimatedTokens} tok)
                    </span>
                  </div>
                  <textarea
                    id="doc-content-input"
                    className="input-textarea"
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    placeholder="Paste documentation, schemas, or knowledge chunks to embed into Pinecone..."
                    disabled={isIngesting}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!docContent.trim() || isIngesting}
                >
                  <IconPlus />
                  <span>
                    {isIngesting ? 'Embedding & Indexing...' : 'Index Text to Pinecone'}
                  </span>
                </button>
              </form>

              {ingestFeedback && (
                <div className={`alert-box ${ingestFeedback.type}`} role="status">
                  {ingestFeedback.text}
                </div>
              )}
            </div>
          ) : (
            <div className="form-group">
              <div className="search-box">
                <IconSearch />
                <input
                  type="text"
                  placeholder="Filter session records..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Filter indexed documents"
                />
              </div>

              <div className="doc-list">
                {filteredDocs.length === 0 ? (
                  <p className="doc-empty-hint">
                    {indexedDocs.length === 0
                      ? 'No documents indexed in this session yet.'
                      : `No indexed documents matching "${searchQuery}".`}
                  </p>
                ) : (
                  filteredDocs.map((doc) => (
                    <article key={doc.id} className="doc-card">
                      <div className="doc-card-title">{doc.title}</div>
                      <div className="doc-card-meta">
                        <span>
                          {doc.chunksCount
                            ? `${doc.chunksCount} chunk${doc.chunksCount === 1 ? '' : 's'}`
                            : doc.id}
                        </span>
                        <span>{doc.indexedAt}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Agent Workspace */}
      <main className="main-stage">
        <header className="top-bar">
          <div className="top-bar-left">
            {!sidebarOpen && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open knowledge base sidebar"
              >
                <IconSidebar />
              </button>
            )}

            <div className="breadcrumbs">
              <span>rag-studio</span>
              <span className="crumb-separator">/</span>
              <span className="crumb-active">knowledge-agent</span>
            </div>

            <div className="grounding-tag">
              <IconDatabase />
              <span>Grounded with Pinecone</span>
            </div>
          </div>

          <div className="top-bar-right">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </button>

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
          </div>
        </header>

        <div className="chat-scroll">
          <div className="chat-center-container">
            {messages.length === 0 ? (
              <div className="zero-state">
                <span className="zero-badge">
                  <IconLayers />
                  <span>Agent Model: gemini-3.5-flash-lite</span>
                </span>
                <h1>Domain-Grounded Intelligence</h1>
                <p>
                  Upload `.pdf`, `.txt`, or `.md` files in the sidebar or ask
                  questions against your Pinecone vector index.
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
              messages.map((msg) => (
                <article
                  key={msg.id}
                  className={`message-card ${msg.role} ${msg.isError ? 'error' : ''}`}
                >
                  <div className="message-meta-bar">
                    <div className="author-info">
                      <span className="author-name">
                        {msg.role === 'user' ? 'You' : 'Gemini Agent'}
                      </span>
                      {msg.role === 'assistant' && !msg.isError && (
                        <span className="model-pill">gemini-3.5-flash-lite</span>
                      )}
                    </div>

                    <div className="author-info">
                      <span className="message-timestamp">{msg.timestamp}</span>
                      {msg.role === 'assistant' && !msg.isError && (
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

                  <div className="message-text">{msg.content}</div>

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
                          Retrieved Context ({msg.sources.length} Pinecone chunks)
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
                                  <span>{src.metadata?.title || src.id}</span>
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

            {isSending && (
              <div className="message-card assistant" aria-live="polite">
                <div className="thinking-status">
                  <span className="pulse-indicator" aria-hidden="true" />
                  <span>Searching Pinecone & synthesizing response...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <footer className="composer-dock">
          <div className="composer-shell">
            <form className="composer-box" onSubmit={handleChatSubmit}>
              <label htmlFor="agent-chat-input" className="sr-only">
                Ask the RAG Agent
              </label>
              <textarea
                id="agent-chat-input"
                ref={composerInputRef}
                rows={1}
                className="composer-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask questions about your indexed documents..."
                disabled={isSending}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={!input.trim() || isSending}
                aria-label="Send query"
              >
                <span>{isSending ? 'Sending' : 'Send'}</span>
                <IconSend />
              </button>
            </form>

            <div className="composer-footer">
              <span>Press Enter to send, Shift + Enter for multiline</span>
              <span>Model: gemini-3.5-flash-lite</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;

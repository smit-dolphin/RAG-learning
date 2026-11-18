import {
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconFileText,
  IconFilter,
  IconPlus,
  IconTrash,
  IconUpload,
} from '../components/Icons';
import { fileUploadSchema } from '../schemas/api';
import { useRagStore } from '../store/useRagStore';

export default function LibraryPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const {
    indexedDocs,
    isIngesting,
    ingestFeedback,
    deletingDocId,
    selectedDocIds,
    activeSessionId,
    clearIngestFeedback,
    ingestFileDoc,
    setDocToDelete,
    setSelectedDocIds,
  } = useRagStore();

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    clearIngestFeedback();
  }

  async function handleFileUpload() {
    if (!selectedFile || isIngesting) return;

    // Validate with Zod
    const validated = fileUploadSchema.safeParse({
      name: selectedFile.name,
      size: selectedFile.size,
    });

    if (!validated.success) {
      alert(validated.error.issues[0]?.message || 'Invalid file format or size');
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

  function handleStartChatWithDoc(docId: string) {
    setSelectedDocIds([docId]);
    navigate('/c/' + activeSessionId);
  }

  function handleInspectDoc(docId: string) {
    navigate('/documents/' + encodeURIComponent(docId));
  }

  return (
    <div className="library-view-container">
      <div className="library-view-content">
        <div className="library-header">
          <div>
            <h1 className="library-title">Knowledge Library</h1>
            <p className="library-subtitle">
              Manage and inspect documents ingested into your Pinecone vector
              index.
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
            <div
              className={`alert-box ${ingestFeedback.type}`}
              style={{ marginTop: '10px' }}
            >
              {ingestFeedback.text}
            </div>
          )}
        </div>

        {/* Documents Grid */}
        <div className="library-docs-section">
          <div className="library-section-title">
            <span>Indexed Documents ({indexedDocs.length})</span>
          </div>

          {indexedDocs.length === 0 ? (
            <div className="scope-empty-text" style={{ padding: '40px 0', textAlign: 'center' }}>
              No indexed documents in knowledge base yet. Upload your first PDF, TXT or MD file above.
            </div>
          ) : (
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
                    <div className="library-doc-footer-actions">
                      <button
                        type="button"
                        className={`doc-chat-filter-btn ${selectedDocIds.includes(doc.id) ? 'active' : ''}`}
                        onClick={() => handleStartChatWithDoc(doc.id)}
                        title="Chat with only this document"
                      >
                        <IconFilter />
                        <span>
                          {selectedDocIds.includes(doc.id) ? 'Scoped' : 'Chat'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="inspect-doc-btn"
                        onClick={() => handleInspectDoc(doc.id)}
                      >
                        Inspect Chunks →
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IconArrowLeft,
  IconFilter,
  IconTrash,
} from '../components/Icons';
import { fetchDocumentById, type DocumentDetails } from '../services/chatApi';
import { useRagStore } from '../store/useRagStore';

export default function DocumentInspectorPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();

  const [activeDocDetails, setActiveDocDetails] = useState<DocumentDetails | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const {
    activeSessionId,
    deletingDocId,
    setDocToDelete,
    setSelectedDocIds,
    setActiveView,
  } = useRagStore();

  useEffect(() => {
    if (!docId) return;
    const currentDocId = docId;
    setActiveView('document', currentDocId);

    let isMounted = true;

    async function loadDocument() {
      try {
        const details = await fetchDocumentById(currentDocId);
        if (isMounted) {
          setActiveDocDetails(details);
          setFetchError(null);
        }
      } catch (err) {
        if (isMounted) {
          setFetchError(err instanceof Error ? err.message : 'Failed to load document');
        }
      } finally {
        if (isMounted) {
          setIsLoadingDoc(false);
        }
      }
    }

    void loadDocument();

    return () => {
      isMounted = false;
    };
  }, [docId, setActiveView]);

  function handleBackToLibrary() {
    navigate('/library');
  }

  function handleChatWithDoc() {
    if (!activeDocDetails) return;
    setSelectedDocIds([activeDocDetails.id]);
    navigate('/c/' + activeSessionId);
  }

  function handleDeleteClick() {
    if (!activeDocDetails) return;
    setDocToDelete({
      id: activeDocDetails.id,
      title: activeDocDetails.title,
      chunksCount: activeDocDetails.chunksCount,
      originalname: activeDocDetails.filename,
    });
  }

  return (
    <div className="inspector-view-container">
      <div className="inspector-view-content">
        <div className="inspector-header">
          <div className="inspector-header-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleBackToLibrary}
            >
              <IconArrowLeft />
              <span>Back to Library</span>
            </button>

            {activeDocDetails && (
              <>
                <button
                  type="button"
                  className="btn-ghost doc-inspector-chat-btn"
                  onClick={handleChatWithDoc}
                  title="Focus chat on this document only"
                >
                  <IconFilter />
                  <span>Chat with this doc</span>
                </button>

                <button
                  type="button"
                  className="btn-ghost doc-inspector-delete-btn"
                  onClick={handleDeleteClick}
                  disabled={deletingDocId === activeDocDetails.id}
                >
                  <IconTrash />
                  <span>Delete Document</span>
                </button>
              </>
            )}
          </div>

          <div className="inspector-title-group">
            <h1 className="inspector-title">
              {activeDocDetails?.title || (isLoadingDoc ? 'Loading document...' : 'Document Details')}
            </h1>
            <span className="inspector-meta">
              {activeDocDetails?.chunksCount ?? 0} Pinecone chunks • Base ID:{' '}
              {activeDocDetails?.id || docId}
            </span>
          </div>
        </div>

        {isLoadingDoc ? (
          <div className="thinking-status" style={{ padding: '40px 0' }}>
            <span className="pulse-indicator" />
            <span>Loading chunks from Pinecone...</span>
          </div>
        ) : fetchError ? (
          <div className="alert-box error" style={{ margin: '20px 0' }}>
            {fetchError}
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
              <pre className="fulltext-pre">{activeDocDetails.fullText}</pre>
            </div>
          </div>
        ) : (
          <p>Document not found or could not be loaded.</p>
        )}
      </div>
    </div>
  );
}

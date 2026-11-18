import { Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import AppLayout from './layouts/AppLayout';
import ChatPage from './pages/ChatPage';
import DocumentInspectorPage from './pages/DocumentInspectorPage';
import LibraryPage from './pages/LibraryPage';
import SfxStudioPage from './pages/SfxStudioPage';

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<ChatPage />} />
        <Route path="c/:sessionId" element={<ChatPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="documents/:docId" element={<DocumentInspectorPage />} />
        <Route path="sfx" element={<SfxStudioPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage.jsx';
import Dashboard from './components/Dashboard.jsx';
import ConsentScreen from './components/ConsentScreen.jsx';
import CalibrationScreen from './components/CalibrationScreen.jsx';
import TutorView from './components/TutorView.jsx';
import StudentView from './components/StudentView.jsx';
import PostSessionReport from './components/PostSessionReport.jsx';

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/session" element={<ProtectedRoute><ConsentScreen /></ProtectedRoute>} />
      <Route path="/calibrate/:role/:sessionId" element={<ProtectedRoute><CalibrationScreen /></ProtectedRoute>} />
      <Route path="/tutor/:sessionId" element={<ProtectedRoute role="tutor"><TutorView /></ProtectedRoute>} />
      <Route path="/student/:sessionId" element={<ProtectedRoute role="student"><StudentView /></ProtectedRoute>} />
      <Route path="/report/:sessionId" element={<ProtectedRoute><PostSessionReport /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

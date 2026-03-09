import { Routes, Route, Navigate } from 'react-router-dom';
import ConsentScreen from './components/ConsentScreen.jsx';
import CalibrationScreen from './components/CalibrationScreen.jsx';
import TutorView from './components/TutorView.jsx';
import StudentView from './components/StudentView.jsx';
import PostSessionReport from './components/PostSessionReport.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<ConsentScreen />} />
      <Route path="/calibration/:role/:sessionId" element={<CalibrationScreen />} />
      <Route path="/tutor/:sessionId" element={<TutorView />} />
      <Route path="/student/:sessionId" element={<StudentView />} />
      <Route path="/report/:sessionId" element={<PostSessionReport />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

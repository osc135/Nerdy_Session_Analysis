import { useParams } from 'react-router-dom';

function PostSessionReport() {
  const { sessionId } = useParams();

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Post-Session Report</h1>
      <p>Session: {sessionId}</p>
      <p>Full report view coming in Day 3.</p>
    </div>
  );
}

export default PostSessionReport;

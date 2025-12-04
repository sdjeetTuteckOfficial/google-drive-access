import './App.css';
// import GoogleDriveViewer from './GoogleDriveViewer2/GoogleDriveViewer2';
import GoogleDriveViewer from './GoogleDriveViewer3/GoogleDriveViewer3';
// import GoogleDriveViewer from './GoogleDriveViewer/GoogleDriveViewer';
import { GoogleOAuthProvider } from '@react-oauth/google';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function App() {
  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <GoogleDriveViewer />
    </GoogleOAuthProvider>
  );
}

export default App;

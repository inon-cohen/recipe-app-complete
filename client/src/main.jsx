import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { GoogleOAuthProvider } from '@react-oauth/google';

// --- שים כאן את הקוד הארוך שהעתקת מגוגל (Client ID) ---
const GOOGLE_CLIENT_ID = "364335641740-577ob12k8r2r9pmpp4oacmodrud2iknc.apps.googleusercontent.com"; 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
)
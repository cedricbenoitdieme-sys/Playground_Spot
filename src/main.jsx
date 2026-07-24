import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { UserProvider } from './context/UserContext.jsx'
import * as amplitude from '@amplitude/unified';

// amplitude.initAll('76ae6217b9165b8d86d33ca292743f5c', {
//   "analytics": { "autocapture": true },
//   "sessionReplay": { "sampleRate": 1 }
// });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserProvider>
      <App />
    </UserProvider>
  </React.StrictMode>,
)

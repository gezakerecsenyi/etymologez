import { initializeFirestore } from 'firebase/firestore';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { initializeApp } from "firebase/app";
import { firebaseConfig } from './firebaseConfig';

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
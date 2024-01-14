import { initializeFirestore } from 'firebase/firestore';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { initializeApp } from "firebase/app";

const firebaseConfig = {
    apiKey: "AIzaSyA_e5jF_HKxWvveGAt30V6DVNY59Ym-_Ls",
    authDomain: "etymologez.firebaseapp.com",
    projectId: "etymologez",
    storageBucket: "etymologez.appspot.com",
    messagingSenderId: "183745502940",
    appId: "1:183745502940:web:c4a6c45f5d0a300a635e19"
};

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
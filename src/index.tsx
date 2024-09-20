import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { firebaseConfig } from './firebaseConfig';

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
});
export const functions = getFunctions(app, 'us-central1');
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
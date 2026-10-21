import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Typography: Inter Tight (variable) across the whole product.
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/inter-tight/wght-italic.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

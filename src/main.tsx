import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { testSupabaseConnection } from './lib/testSupabase';
import { loadAndSyncSupabaseData } from './services/supabaseData';

// Run connection diagnostic and hydrate live Supabase data if available
testSupabaseConnection().then(status => {
  if (status.isConfigured && status.databaseConnected) {
    loadAndSyncSupabaseData();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

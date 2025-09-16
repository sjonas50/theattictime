
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from '@/components/theme-provider';

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="lovable-ui-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

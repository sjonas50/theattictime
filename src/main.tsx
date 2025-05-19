
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Outlet } from 'react-router-dom';
import App from './App.tsx'; // Assuming App.tsx provides a basic structure or Outlet
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import Index from './pages/Index';
import AuthPage from './pages/AuthPage';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout'; // General layout for non-protected pages like AuthPage

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <Routes>
          {/* App component from template might be an Outlet container or simple wrapper */}
          {/* Using ProtectedRoute for the main content */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Index />} />
            {/* Add other protected routes here */}
          </Route>
          
          {/* AuthPage should not be under ProtectedRoute, but can use a simpler Layout if needed */}
          <Route element={<Layout><Outlet/></Layout>}> {/* Simple layout for auth page */}
            <Route path="/auth" element={<AuthPage />} />
          </Route>

          <Route path="*" element={<Layout><NotFound /></Layout>} /> 
        </Routes>
      </AuthProvider>
    </Router>
  </React.StrictMode>
);


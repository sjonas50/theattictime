
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import TimeEntriesPage from "./pages/TimeEntriesPage";
import SupervisorDashboardPage from "./pages/SupervisorDashboardPage";
import AdminPage from "./pages/AdminPage";
import ExportPage from "./pages/ExportPage"; // Import ExportPage
import ReportsPage from "./pages/ReportsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner richColors />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Index />} />
              <Route path="/time-entries" element={<TimeEntriesPage />} />
              <Route path="/supervisor-dashboard" element={<SupervisorDashboardPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/exports" element={<ExportPage />} /> {/* Add ExportPage route */}
              <Route path="/reports" element={<ReportsPage />} />
              {/* Add other protected routes here */}
            </Route>
            
            {/* Public Routes with Layout */}
            <Route element={<Layout><Outlet/></Layout>}>
              <Route path="/auth" element={<AuthPage />} />
            </Route>

            {/* Catch-all Not Found Route */}
            <Route path="*" element={<Layout><NotFound /></Layout>} /> 
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

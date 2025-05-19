
import { ReactNode } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
// Toaster import removed as it's now global in App.tsx
import { LogOut, List } from 'lucide-react'; // Added List icon

const Layout = ({ children }: { children?: ReactNode }) => {
  const { user, signOut, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-800 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-bold">TimeTrack</Link>
          <nav className="flex items-center space-x-4">
            {user && (
              <>
                <Button onClick={() => navigate('/time-entries')} variant="ghost" className="text-white hover:bg-gray-700">
                  <List className="mr-2 h-4 w-4" /> Time Entries
                </Button>
                <Button onClick={signOut} variant="ghost" className="text-white hover:bg-gray-700">
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </Button>
              </>
            )}
            {!user && (
              <Button onClick={() => navigate('/auth')} variant="outline" className="text-white border-white hover:bg-gray-700">
                Sign In
              </Button>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-grow container mx-auto p-4">
        {children || <Outlet />}
      </main>
      {/* Toaster component removed from here */}
    </div>
  );
};

export default Layout;


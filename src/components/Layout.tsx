
import { ReactNode, useState, useEffect } from 'react'; // Added useState, useEffect
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client'; // Added supabase import
import { Enums } from '@/integrations/supabase/types'; // Added Enums import
import { LogOut, List, ShieldAlert } from 'lucide-react'; // Added ShieldAlert icon

type UserRole = Enums<'app_role'>;

const Layout = ({ children }: { children?: ReactNode }) => {
  const { user, signOut, isLoading: authIsLoading } = useAuth();
  const navigate = useNavigate();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    if (user && !authIsLoading) {
      setRolesLoading(true);
      const fetchUserRoles = async () => {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching user roles in Layout:', error);
          // Don't toast here, might be too noisy
        } else if (data) {
          const roles = data.map(r => r.role as UserRole);
          setUserRoles(roles);
          setIsSupervisor(roles.includes('supervisor'));
        }
        setRolesLoading(false);
      };
      fetchUserRoles();
    } else if (!user && !authIsLoading) {
      // No user, clear roles
      setUserRoles([]);
      setIsSupervisor(false);
      setRolesLoading(false);
    }
  }, [user, authIsLoading]);

  if (authIsLoading || (user && rolesLoading)) { // Wait for auth and roles if user exists
    return <div className="min-h-screen flex items-center justify-center">Loading user data...</div>;
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
                  <List className="mr-2 h-4 w-4" /> My Time Entries
                </Button>
                {isSupervisor && (
                  <Button onClick={() => navigate('/supervisor-dashboard')} variant="ghost" className="text-white hover:bg-gray-700">
                    <ShieldAlert className="mr-2 h-4 w-4" /> Supervisor Dashboard
                  </Button>
                )}
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
    </div>
  );
};

export default Layout;

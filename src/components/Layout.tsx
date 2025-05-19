
import { ReactNode, useState, useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Enums } from '@/integrations/supabase/types';
import { LogOut, List, ShieldAlert, UserCog } from 'lucide-react'; // Added UserCog for Admin

type UserRole = Enums<'app_role'>;

const Layout = ({ children }: { children?: ReactNode }) => {
  const { user, signOut, isLoading: authIsLoading } = useAuth();
  const navigate = useNavigate();
  // const [userRoles, setUserRoles] = useState<UserRole[]>([]); // No longer needed here, AdminPage checks its own
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); // Added isAdmin state
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
        } else if (data) {
          const roles = data.map(r => r.role as UserRole);
          // setUserRoles(roles); // No longer setting userRoles state here
          setIsSupervisor(roles.includes('supervisor'));
          setIsAdmin(roles.includes('admin')); // Set isAdmin based on roles
        }
        setRolesLoading(false);
      };
      fetchUserRoles();
    } else if (!user && !authIsLoading) {
      // setUserRoles([]);
      setIsSupervisor(false);
      setIsAdmin(false); // Reset isAdmin
      setRolesLoading(false);
    }
  }, [user, authIsLoading]);

  if (authIsLoading || (user && rolesLoading)) {
    return <div className="min-h-screen flex items-center justify-center">Loading user data...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-800 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-bold">TimeTrack</Link>
          <nav className="flex items-center space-x-2 md:space-x-4"> {/* Adjusted spacing for more items */}
            {user && (
              <>
                <Button onClick={() => navigate('/time-entries')} variant="ghost" className="text-white hover:bg-gray-700 px-2 md:px-3">
                  <List className="mr-1 md:mr-2 h-4 w-4" /> My Time
                </Button>
                {isSupervisor && (
                  <Button onClick={() => navigate('/supervisor-dashboard')} variant="ghost" className="text-white hover:bg-gray-700 px-2 md:px-3">
                    <ShieldAlert className="mr-1 md:mr-2 h-4 w-4" /> Supervisor
                  </Button>
                )}
                {isAdmin && ( // Add Admin link if user is admin
                  <Button onClick={() => navigate('/admin')} variant="ghost" className="text-white hover:bg-gray-700 px-2 md:px-3">
                    <UserCog className="mr-1 md:mr-2 h-4 w-4" /> Admin
                  </Button>
                )}
                <Button onClick={signOut} variant="ghost" className="text-white hover:bg-gray-700 px-2 md:px-3">
                  <LogOut className="mr-1 md:mr-2 h-4 w-4" /> Sign Out
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

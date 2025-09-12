
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Clock, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

type UserRole = 'admin' | 'supervisor' | 'employee';

const Index = () => {
  const { user } = useAuth();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);

  // Fetch user roles
  useEffect(() => {
    const fetchUserRoles = async () => {
      if (!user) {
        setIsLoadingRoles(false);
        return;
      }

      try {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (roles) {
          setUserRoles(roles.map(r => r.role as UserRole));
        }
      } catch (error) {
        console.error('Error fetching user roles:', error);
      } finally {
        setIsLoadingRoles(false);
      }
    };

    fetchUserRoles();
  }, [user]);

  // Fetch employee data for current user
  const { data: currentEmployee } = useQuery({
    queryKey: ['current_employee', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  // Fetch recent time entries for employee dashboard
  const { data: recentTimeEntries } = useQuery({
    queryKey: ['recent_time_entries', currentEmployee?.id],
    queryFn: async () => {
      if (!currentEmployee) return [];
      const { data } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', currentEmployee.id)
        .order('entry_date', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!currentEmployee,
  });

  // Fetch team stats for supervisors
  const { data: teamStats } = useQuery({
    queryKey: ['team_stats', currentEmployee?.id],
    queryFn: async () => {
      if (!currentEmployee || !userRoles.includes('supervisor')) return null;
      
      const { data: teamMembers } = await supabase
        .from('employees')
        .select('id')
        .eq('supervisor_id', currentEmployee.id);

      if (!teamMembers?.length) return { teamSize: 0, pendingEntries: 0, totalHours: 0 };

      const teamMemberIds = teamMembers.map(m => m.id);
      
      const { data: pendingEntries } = await supabase
        .from('time_entries')
        .select('id')
        .in('employee_id', teamMemberIds)
        .eq('is_finalized', true)
        .is('approved_at', null)
        .is('rejected_at', null);

      const { data: thisWeekEntries } = await supabase
        .from('time_entries')
        .select('hours_worked')
        .in('employee_id', teamMemberIds)
        .gte('entry_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      const totalHours = thisWeekEntries?.reduce((sum, entry) => sum + Number(entry.hours_worked), 0) || 0;

      return {
        teamSize: teamMembers.length,
        pendingEntries: pendingEntries?.length || 0,
        totalHours,
      };
    },
    enabled: !!currentEmployee && userRoles.includes('supervisor'),
  });

  // Fetch system stats for admins
  const { data: systemStats } = useQuery({
    queryKey: ['system_stats'],
    queryFn: async () => {
      if (!userRoles.includes('admin')) return null;

      const [employeesResult, entriesResult, pendingResult] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact' }),
        supabase.from('time_entries').select('hours_worked').gte('entry_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
        supabase.from('time_entries').select('id', { count: 'exact' }).eq('is_finalized', true).is('approved_at', null).is('rejected_at', null),
      ]);

      const totalHours = entriesResult.data?.reduce((sum, entry) => sum + Number(entry.hours_worked), 0) || 0;

      return {
        totalEmployees: employeesResult.count || 0,
        weeklyHours: totalHours,
        pendingApprovals: pendingResult.count || 0,
      };
    },
    enabled: userRoles.includes('admin'),
  });

  if (!user) {
    return <p>Loading user information or you are not logged in.</p>;
  }

  if (isLoadingRoles) {
    return <div className="min-h-screen flex items-center justify-center">Loading dashboard...</div>;
  }

  const isAdmin = userRoles.includes('admin');
  const isSupervisor = userRoles.includes('supervisor');
  const isEmployee = userRoles.length === 0 || userRoles.includes('employee');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          {userRoles.map(role => (
            <Badge key={role} variant="secondary" className="capitalize">
              {role}
            </Badge>
          ))}
        </div>
      </div>

      {/* Admin Dashboard */}
      {isAdmin && systemStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{systemStats.totalEmployees}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Weekly Hours</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{systemStats.weeklyHours.toFixed(1)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{systemStats.pendingApprovals}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Supervisor Dashboard */}
      {isSupervisor && teamStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Size</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{teamStats.teamSize}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Hours (Week)</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{teamStats.totalHours.toFixed(1)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{teamStats.pendingEntries}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Employee Dashboard */}
      {isEmployee && (
        <Card>
          <CardHeader>
            <CardTitle>Welcome, {user.email}!</CardTitle>
            <CardDescription>Your recent time entries</CardDescription>
          </CardHeader>
          <CardContent>
            {recentTimeEntries && recentTimeEntries.length > 0 ? (
              <div className="space-y-3">
                {recentTimeEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {entry.approved_at ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : entry.rejected_at ? (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        ) : entry.is_finalized ? (
                          <Clock className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-gray-400" />
                        )}
                        <span className="font-medium">{format(new Date(entry.entry_date), 'MMM dd, yyyy')}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{entry.project_code}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.hours_worked}h</span>
                      <Badge variant={
                        entry.approved_at ? "default" : 
                        entry.rejected_at ? "destructive" : 
                        entry.is_finalized ? "secondary" : "outline"
                      }>
                        {entry.approved_at ? "Approved" : 
                         entry.rejected_at ? "Rejected" : 
                         entry.is_finalized ? "Pending" : "Draft"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No time entries yet. Start tracking your time!</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Index;

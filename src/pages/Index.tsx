
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { Clock, Users, CheckCircle, AlertCircle, TrendingUp, Calendar, Target, BarChart3 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

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

  // Fetch enhanced time entries data for employee dashboard
  const { data: timeEntriesData } = useQuery({
    queryKey: ['employee_time_data', currentEmployee?.id],
    queryFn: async () => {
      if (!currentEmployee) return null;
      
      const weekStart = startOfWeek(new Date()).toISOString().split('T')[0];
      const monthStart = startOfMonth(new Date()).toISOString().split('T')[0];
      
      // Recent entries
      const { data: recentEntries } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', currentEmployee.id)
        .order('entry_date', { ascending: false })
        .limit(5);

      // This week's hours
      const { data: weekEntries } = await supabase
        .from('time_entries')
        .select('hours_worked, entry_date')
        .eq('employee_id', currentEmployee.id)
        .gte('entry_date', weekStart);

      // This month's hours by project
      const { data: monthEntries } = await supabase
        .from('time_entries')
        .select('hours_worked, project_code')
        .eq('employee_id', currentEmployee.id)
        .gte('entry_date', monthStart);

      // Status counts
      const { data: statusCounts } = await supabase
        .from('time_entries')
        .select('is_finalized, approved_at, rejected_at')
        .eq('employee_id', currentEmployee.id)
        .gte('entry_date', monthStart);

      const weeklyHours = weekEntries?.reduce((sum, entry) => sum + Number(entry.hours_worked), 0) || 0;
      const monthlyHours = monthEntries?.reduce((sum, entry) => sum + Number(entry.hours_worked), 0) || 0;
      
      // Group by project for pie chart
      const projectHours = monthEntries?.reduce((acc, entry) => {
        acc[entry.project_code] = (acc[entry.project_code] || 0) + Number(entry.hours_worked);
        return acc;
      }, {} as Record<string, number>) || {};

      const projectData = Object.entries(projectHours).map(([project, hours]) => ({
        name: project,
        value: hours,
        fill: `hsl(${Math.random() * 360}, 70%, 50%)` // Random colors
      }));

      // Status breakdown
      const drafts = statusCounts?.filter(e => !e.is_finalized).length || 0;
      const pending = statusCounts?.filter(e => e.is_finalized && !e.approved_at && !e.rejected_at).length || 0;
      const approved = statusCounts?.filter(e => e.approved_at).length || 0;
      const rejected = statusCounts?.filter(e => e.rejected_at).length || 0;

      return {
        recentEntries: recentEntries || [],
        weeklyHours,
        monthlyHours,
        projectData,
        statusCounts: { drafts, pending, approved, rejected }
      };
    },
    enabled: !!currentEmployee,
  });

  // Fetch team stats for supervisors with enhanced data
  const { data: teamStats } = useQuery({
    queryKey: ['team_stats', currentEmployee?.id],
    queryFn: async () => {
      if (!currentEmployee || !userRoles.includes('supervisor')) return null;
      
      const { data: teamMembers } = await supabase
        .from('employees')
        .select('id, name')
        .eq('supervisor_id', currentEmployee.id);

      if (!teamMembers?.length) return { teamSize: 0, pendingEntries: 0, totalHours: 0, teamData: [] };

      const teamMemberIds = teamMembers.map(m => m.id);
      const weekStart = startOfWeek(new Date()).toISOString().split('T')[0];
      
      // Team performance data
      const teamData = await Promise.all(
        teamMembers.map(async (member) => {
          const { data: memberEntries } = await supabase
            .from('time_entries')
            .select('hours_worked')
            .eq('employee_id', member.id)
            .gte('entry_date', weekStart);
          
          const weeklyHours = memberEntries?.reduce((sum, entry) => sum + Number(entry.hours_worked), 0) || 0;
          return { name: member.name, hours: weeklyHours };
        })
      );
      
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
        .gte('entry_date', weekStart);

      const totalHours = thisWeekEntries?.reduce((sum, entry) => sum + Number(entry.hours_worked), 0) || 0;

      return {
        teamSize: teamMembers.length,
        pendingEntries: pendingEntries?.length || 0,
        totalHours,
        teamData,
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

      {/* Enhanced Admin Dashboard */}
      {isAdmin && systemStats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/20 dark:to-violet-900/20 border-violet-200 dark:border-violet-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-violet-700 dark:text-violet-300">Total Employees</CardTitle>
                <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-violet-900 dark:text-violet-100">{systemStats.totalEmployees}</div>
                <div className="text-xs text-violet-600 dark:text-violet-400 mt-1">Active in system</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950/20 dark:to-cyan-900/20 border-cyan-200 dark:border-cyan-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-cyan-700 dark:text-cyan-300">Weekly Hours</CardTitle>
                <Clock className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-cyan-900 dark:text-cyan-100">{systemStats.weeklyHours.toFixed(1)}h</div>
                <div className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">Across all employees</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950/20 dark:to-rose-900/20 border-rose-200 dark:border-rose-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-rose-700 dark:text-rose-300">Pending Approvals</CardTitle>
                <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-900 dark:text-rose-100">{systemStats.pendingApprovals}</div>
                <div className="text-xs text-rose-600 dark:text-rose-400 mt-1">Require attention</div>
              </CardContent>
            </Card>
          </div>
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

      {/* Enhanced Employee Dashboard */}
      {isEmployee && timeEntriesData && (
        <div className="space-y-6">
          {/* Quick Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">This Week</CardTitle>
                <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{timeEntriesData.weeklyHours.toFixed(1)}h</div>
                <div className="text-xs text-blue-600 dark:text-blue-400">
                  <Progress value={(timeEntriesData.weeklyHours / 40) * 100} className="mt-2 h-2" />
                  <span className="mt-1 block">{((timeEntriesData.weeklyHours / 40) * 100).toFixed(0)}% of 40h goal</span>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/20 border-green-200 dark:border-green-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">This Month</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-900 dark:text-green-100">{timeEntriesData.monthlyHours.toFixed(1)}h</div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">Total monthly hours</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/20 dark:to-amber-900/20 border-amber-200 dark:border-amber-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-300">Pending</CardTitle>
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">{timeEntriesData.statusCounts.pending}</div>
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">Awaiting approval</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/20 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">Approved</CardTitle>
                <CheckCircle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">{timeEntriesData.statusCounts.approved}</div>
                <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">This month</div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Project Distribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Project Time Distribution
                </CardTitle>
                <CardDescription>Your time allocation this month</CardDescription>
              </CardHeader>
              <CardContent>
                {timeEntriesData.projectData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={timeEntriesData.projectData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {timeEntriesData.projectData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value}h`, 'Hours']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                    No project data for this month
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Entries */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Time Entries</CardTitle>
                <CardDescription>Your latest submissions</CardDescription>
              </CardHeader>
              <CardContent>
                {timeEntriesData.recentEntries.length > 0 ? (
                  <div className="space-y-3">
                    {timeEntriesData.recentEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg bg-gradient-to-r from-background to-muted/20">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {entry.approved_at ? (
                              <CheckCircle className="h-4 w-4 text-emerald-500" />
                            ) : entry.rejected_at ? (
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            ) : entry.is_finalized ? (
                              <Clock className="h-4 w-4 text-amber-500" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground" />
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
          </div>
        </div>
      )}

      {/* Enhanced Supervisor Dashboard */}
      {isSupervisor && teamStats && (
        <div className="space-y-6">
          {/* Supervisor Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/20 dark:to-indigo-900/20 border-indigo-200 dark:border-indigo-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Team Size</CardTitle>
                <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{teamStats.teamSize}</div>
                <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Active team members</div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950/20 dark:to-teal-900/20 border-teal-200 dark:border-teal-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-teal-700 dark:text-teal-300">Team Hours</CardTitle>
                <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-teal-900 dark:text-teal-100">{teamStats.totalHours.toFixed(1)}h</div>
                <div className="text-xs text-teal-600 dark:text-teal-400 mt-1">This week total</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 border-orange-200 dark:border-orange-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">Pending Reviews</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">{teamStats.pendingEntries}</div>
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">Need your attention</div>
              </CardContent>
            </Card>
          </div>

          {/* Team Performance Chart */}
          {teamStats.teamData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Team Performance This Week
                </CardTitle>
                <CardDescription>Hours worked by each team member</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={teamStats.teamData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${value}h`, 'Hours']} />
                    <Legend />
                    <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default Index;

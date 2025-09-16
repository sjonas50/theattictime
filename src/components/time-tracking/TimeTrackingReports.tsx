import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Clock, TrendingUp, Users } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

type TimeEntryWithEmployee = {
  id: string;
  employee_id: string;
  hours_worked: number;
  entry_date: string;
  project_code: string;
  notes?: string;
  employees: {
    name: string;
    employee_id_internal: string;
  } | null;
};

type ReportPeriod = 'today' | 'week' | 'month' | 'quarter';
type ViewType = 'summary' | 'by-employee' | 'by-project' | 'trends';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

const TimeTrackingReports = () => {
  const { user } = useAuth();
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('week');
  const [viewType, setViewType] = useState<ViewType>('summary');
  const [userRoles, setUserRoles] = useState<string[]>([]);

  // Fetch user roles
  useQuery({
    queryKey: ['userRoles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      if (error) throw error;
      const roles = data.map(r => r.role);
      setUserRoles(roles);
      return roles;
    },
    enabled: !!user,
  });

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (reportPeriod) {
      case 'today':
        startDate = new Date(now);
        endDate = new Date(now);
        break;
      case 'week':
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'month':
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case 'quarter':
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        startDate = quarterStart;
        endDate = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 0);
        break;
      default:
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
    }

    return {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd')
    };
  };

  const { data: timeEntries, isLoading } = useQuery({
    queryKey: ['timeEntries', reportPeriod, userRoles],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      
      // First get employee ID for current user if not admin/supervisor
      let employeeFilter = '';
      if (!userRoles.includes('admin') && !userRoles.includes('supervisor')) {
        const { data: empData } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', user?.id)
          .single();
        
        if (!empData) return [];
        employeeFilter = empData.id;
      }

      // Get time entries
      let query = supabase
        .from('time_entries')
        .select('*')
        .gte('entry_date', startDate)
        .lte('entry_date', endDate);
      
      // Only filter for finalized entries if user is not admin
      if (!userRoles.includes('admin')) {
        query = query.eq('is_finalized', true);
      }

      // Apply employee filter if needed
      if (employeeFilter) {
        query = query.eq('employee_id', employeeFilter);
      }

      const { data: entries, error } = await query.order('entry_date', { ascending: false });
      
      if (error) throw error;
      if (!entries) return [];

      // Get employee details for all entries
      const employeeIds = [...new Set(entries.map(e => e.employee_id))];
      const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('id, name, employee_id_internal')
        .in('id', employeeIds);

      if (empError) throw empError;

      // Combine data
      const enrichedEntries = entries.map(entry => ({
        ...entry,
        employees: employees?.find(emp => emp.id === entry.employee_id) || null
      }));

      return enrichedEntries;
    },
    enabled: !!user && userRoles.length > 0,
  });

  const summaryStats = useMemo(() => {
    if (!timeEntries) return null;

    const totalHours = timeEntries.reduce((sum, entry) => sum + Number(entry.hours_worked), 0);
    const uniqueEmployees = new Set(timeEntries.map(entry => entry.employee_id)).size;
    const uniqueProjects = new Set(timeEntries.map(entry => entry.project_code)).size;
    const avgHoursPerDay = totalHours / Math.max(1, new Set(timeEntries.map(entry => entry.entry_date)).size);

    return {
      totalHours: totalHours.toFixed(1),
      uniqueEmployees,
      uniqueProjects,
      avgHoursPerDay: avgHoursPerDay.toFixed(1),
      totalEntries: timeEntries.length
    };
  }, [timeEntries]);

  const employeeBreakdown = useMemo(() => {
    if (!timeEntries) return [];
    
    const employeeMap = new Map();
    timeEntries.forEach(entry => {
      const key = entry.employee_id;
      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          name: entry.employees?.name || 'Unknown',
          employee_id: entry.employees?.employee_id_internal || 'N/A',
          totalHours: 0,
          projects: new Set(),
          entries: 0
        });
      }
      const emp = employeeMap.get(key);
      emp.totalHours += Number(entry.hours_worked);
      emp.projects.add(entry.project_code);
      emp.entries += 1;
    });

    return Array.from(employeeMap.values())
      .map(emp => ({
        ...emp,
        projects: emp.projects.size,
        avgHoursPerEntry: (emp.totalHours / emp.entries).toFixed(1)
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [timeEntries]);

  const projectBreakdown = useMemo(() => {
    if (!timeEntries) return [];
    
    const projectMap = new Map();
    timeEntries.forEach(entry => {
      const key = entry.project_code;
      if (!projectMap.has(key)) {
        projectMap.set(key, {
          project_code: key,
          totalHours: 0,
          employees: new Set(),
          entries: 0
        });
      }
      const proj = projectMap.get(key);
      proj.totalHours += Number(entry.hours_worked);
      proj.employees.add(entry.employee_id);
      proj.entries += 1;
    });

    return Array.from(projectMap.values())
      .map(proj => ({
        ...proj,
        employees: proj.employees.size,
        avgHoursPerEntry: (proj.totalHours / proj.entries).toFixed(1)
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [timeEntries]);

  const chartData = useMemo(() => {
    if (!timeEntries) return [];
    
    const dateMap = new Map();
    timeEntries.forEach(entry => {
      const date = entry.entry_date;
      if (!dateMap.has(date)) {
        dateMap.set(date, 0);
      }
      dateMap.set(date, dateMap.get(date) + Number(entry.hours_worked));
    });

    return Array.from(dateMap.entries())
      .map(([date, hours]) => ({
        date: format(new Date(date), 'MMM dd'),
        hours: Number(hours.toFixed(1))
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [timeEntries]);

  const renderSummaryView = () => (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-2xl font-bold">{summaryStats?.totalHours}</p>
                <p className="text-xs text-muted-foreground">Total Hours</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-2xl font-bold">{summaryStats?.uniqueEmployees}</p>
                <p className="text-xs text-muted-foreground">Active Employees</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-2xl font-bold">{summaryStats?.uniqueProjects}</p>
                <p className="text-xs text-muted-foreground">Projects</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-2xl font-bold">{summaryStats?.avgHoursPerDay}</p>
                <p className="text-xs text-muted-foreground">Avg Hours/Day</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Time Tracking Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="hours" 
                stroke="#8884d8" 
                strokeWidth={2}
                dot={{ fill: '#8884d8' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Project Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Hours by Project</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={projectBreakdown.slice(0, 6)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ project_code, percentage }) => `${project_code} (${percentage}%)`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="totalHours"
              >
                {projectBreakdown.slice(0, 6).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );

  const renderEmployeeView = () => (
    <Card>
      <CardHeader>
        <CardTitle>Hours by Employee</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Total Hours</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead>Entries</TableHead>
              <TableHead>Avg Hours/Entry</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employeeBreakdown.map((employee, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{employee.name}</TableCell>
                <TableCell>{employee.employee_id}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{employee.totalHours.toFixed(1)}h</Badge>
                </TableCell>
                <TableCell>{employee.projects}</TableCell>
                <TableCell>{employee.entries}</TableCell>
                <TableCell>{employee.avgHoursPerEntry}h</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderProjectView = () => (
    <Card>
      <CardHeader>
        <CardTitle>Hours by Project</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project Code</TableHead>
              <TableHead>Total Hours</TableHead>
              <TableHead>Employees</TableHead>
              <TableHead>Entries</TableHead>
              <TableHead>Avg Hours/Entry</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projectBreakdown.map((project, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{project.project_code}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{project.totalHours.toFixed(1)}h</Badge>
                </TableCell>
                <TableCell>{project.employees}</TableCell>
                <TableCell>{project.entries}</TableCell>
                <TableCell>{project.avgHoursPerEntry}h</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderTrendsView = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily Hours Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="hours" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employee Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={employeeBreakdown} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={120} />
              <Tooltip />
              <Bar dataKey="totalHours" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );

  if (isLoading) {
    return <div className="p-4">Loading time tracking reports...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h1 className="text-3xl font-bold">Time Tracking Reports</h1>
        <div className="flex gap-2">
          <Select value={reportPeriod} onValueChange={(value: ReportPeriod) => setReportPeriod(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
            </SelectContent>
          </Select>
          <Select value={viewType} onValueChange={(value: ViewType) => setViewType(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="summary">Summary</SelectItem>
              <SelectItem value="by-employee">By Employee</SelectItem>
              <SelectItem value="by-project">By Project</SelectItem>
              <SelectItem value="trends">Trends</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {viewType === 'summary' && renderSummaryView()}
      {viewType === 'by-employee' && renderEmployeeView()}
      {viewType === 'by-project' && renderProjectView()}
      {viewType === 'trends' && renderTrendsView()}
    </div>
  );
};

export default TimeTrackingReports;
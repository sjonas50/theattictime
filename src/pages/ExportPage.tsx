import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Enums, Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  format as formatDate,
} from 'date-fns';

type UserRole = Enums<'app_role'>;
type TimeEntryRow = Tables<'time_entries'>;
type EmployeeRow = Tables<'employees'>;

// Define a type for the data we fetch (time entries with employee names)
type ExportDataRow = TimeEntryRow & {
  employees: Pick<EmployeeRow, 'name'> | null; // employees can be null if FK allows or join fails
};

const ExportPage = () => {
  const { user, isLoading: authIsLoading } = useAuth();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [exportPeriod, setExportPeriod] = useState<string>("current_month");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (user && !authIsLoading) {
      setRolesLoading(true);
      const fetchUserRoles = async () => {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching user roles for ExportPage:', error);
          toast.error('Failed to verify user permissions.');
          setIsAuthorized(false);
        } else if (data) {
          const roles = data.map(r => r.role as UserRole);
          setUserRoles(roles);
          if (roles.includes('admin') || roles.includes('supervisor')) {
            setIsAuthorized(true);
          } else {
            setIsAuthorized(false);
          }
        }
        setRolesLoading(false);
      };
      fetchUserRoles();
    } else if (!authIsLoading && !user) {
      setIsAuthorized(false);
      setRolesLoading(false);
    }
  }, [user, authIsLoading]);

  const getTargetDateRange = (): { startDate: Date; endDate: Date } => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (exportPeriod) {
      case 'current_week':
        startDate = startOfWeek(now, { weekStartsOn: 1 }); // Assuming week starts on Monday
        endDate = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'last_week':
        const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        startDate = lastWeekStart;
        endDate = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
        break;
      case 'current_month':
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case 'last_month':
        const lastMonthStart = startOfMonth(subMonths(now, 1));
        startDate = lastMonthStart;
        endDate = endOfMonth(lastMonthStart);
        break;
      default: // Should not happen with select
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
    }
    return { startDate, endDate };
  };
  
  const arrayToCSV = (data: Record<string, any>[]) => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));

    for (const row of data) {
      const values = headers.map(header => {
        let cell = row[header] === null || row[header] === undefined ? '' : String(row[header]);
        if (/[",\r\n]/.test(cell)) { // Basic CSV escaping for quotes and newlines
            cell = `"${cell.replace(/"/g, '""')}"`;
        } else if (cell.includes(',')) { // Always quote if there's a comma
            cell = `"${cell}"`;
        }
        return cell;
      });
      csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
  };

  const downloadCSV = (csvString: string, filename: string) => {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      toast.error("CSV download is not supported in your browser.");
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    toast.info(`Preparing export for: ${exportPeriod}...`);

    const { startDate, endDate } = getTargetDateRange();
    const formattedStartDate = formatDate(startDate, 'yyyy-MM-dd');
    const formattedEndDate = formatDate(endDate, 'yyyy-MM-dd');

    console.log(`Fetching time entries from ${formattedStartDate} to ${formattedEndDate}`);

    const { data: timeEntries, error } = await supabase
      .from('time_entries')
      .select(`
        entry_date,
        project_code,
        hours_worked,
        notes,
        employees ( name )
      `)
      .gte('entry_date', formattedStartDate)
      .lte('entry_date', formattedEndDate)
      .order('entry_date', { ascending: true }) as { data: ExportDataRow[] | null; error: any };

    if (error) {
      console.error('Error fetching time entries for export:', error);
      toast.error('Failed to fetch time entries. Please try again.');
      setIsExporting(false);
      return;
    }

    if (!timeEntries || timeEntries.length === 0) {
      toast.info('No time entries found for the selected period.');
      setIsExporting(false);
      return;
    }
    
    console.log(`Fetched ${timeEntries.length} time entries.`);

    // Prepare data for CSV: Date, Employee Name, Job, Hours Worked, Notes
    const dataToExport = timeEntries.map(item => ({
      'Date': item.entry_date,
      'Employee Name': item.employees?.name || 'N/A',
      'Job': item.project_code, // As per user: project_code is Job
      'Hours Worked': item.hours_worked,
      'Notes': item.notes || '',
    }));

    const csvString = arrayToCSV(dataToExport);
    const filename = `quickbooks_export_${exportPeriod}_${formatDate(new Date(), 'yyyyMMddHHmmss')}.csv`;
    
    downloadCSV(csvString, filename);

    toast.success('Data exported successfully!');
    setIsExporting(false);
  };

  if (authIsLoading || rolesLoading) {
    return <div className="container mx-auto p-4">Loading permissions...</div>;
  }

  if (!isAuthorized) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p>You do not have permission to view this page. Access is restricted to supervisors and administrators.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-3xl font-bold">Export Time Data</h1>
      <Card>
        <CardHeader>
          <CardTitle>Export for QuickBooks Online</CardTitle>
          <CardDescription>Select a period and export time entries in a CSV format compatible with QuickBooks Online.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="export-period">Select Period</Label>
            <Select value={exportPeriod} onValueChange={setExportPeriod} disabled={isExporting}>
              <SelectTrigger id="export-period" className="w-[280px]">
                <SelectValue placeholder="Select export period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_week">Current Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="current_month">Current Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export Data
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
            <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
            <p>1. Select the desired period for the export.</p>
            <p>2. Click "Export Data". A CSV file will be downloaded.</p>
            <p>3. In QuickBooks Online, navigate to your time tracking or import data section.</p>
            <p>4. Upload the CSV file. Ensure fields are mapped correctly (Employee, Date, Customer/Job for Project Code, Hours).</p>
            <p className="font-semibold">Note: This export is designed for QuickBooks Online. Ensure your entries are finalized and approved for accuracy before exporting.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExportPage;

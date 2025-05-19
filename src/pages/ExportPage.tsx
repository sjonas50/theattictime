
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Enums } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { DatePickerWithRange } from '@/components/ui/date-range-picker'; // We'll create this component later
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';

type UserRole = Enums<'app_role'>;

const ExportPage = () => {
  const { user, isLoading: authIsLoading } = useAuth();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [exportPeriod, setExportPeriod] = useState<string>("current_month"); // e.g., 'current_month', 'last_month', 'custom_range'
  // const [dateRange, setDateRange] = useState<DateRange | undefined>(); // For custom range

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

  const handleExport = () => {
    // Placeholder for export logic
    toast.info(`Exporting data for: ${exportPeriod}. This feature is under construction.`);
    // TODO: Implement actual CSV generation and download
    // 1. Fetch data based on exportPeriod and dateRange (if custom)
    // 2. Format data to CSV for QuickBooks Online
    // 3. Trigger download
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
            <Select value={exportPeriod} onValueChange={setExportPeriod}>
              <SelectTrigger id="export-period" className="w-[280px]">
                <SelectValue placeholder="Select export period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_week">Current Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="current_month">Current Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                {/* <SelectItem value="custom_range">Custom Range</SelectItem> */}
              </SelectContent>
            </Select>
          </div>

          {/* 
          {exportPeriod === 'custom_range' && (
            <div>
              <Label>Select Date Range</Label>
              <DatePickerWithRange onRangeChange={setDateRange} /> // Placeholder for actual component
            </div>
          )}
          */}

          <Button onClick={handleExport} disabled={false /* TODO: disable while exporting */}>
            <Download className="mr-2 h-4 w-4" /> Export Data
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

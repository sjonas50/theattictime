import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Tables, TablesUpdate, Enums } from '@/integrations/supabase/types';
import { ShieldCheck, XCircle } from 'lucide-react'; // Icons for approve/reject

type TimeEntry = Tables<'time_entries'>;
type UserRole = Enums<'app_role'>;

const SupervisorDashboardPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  // Fetch current user's employee ID (supervisors are also employees)
  useEffect(() => {
    if (user) {
      const fetchEmployeeDetails = async () => {
        const { data, error } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', user.id)
          .single();
        if (error) {
          console.error('Error fetching supervisor employee_id:', error);
          // toast.error('Error fetching your employee details.'); // Avoid toast if not critical for page load
        } else if (data) {
          setEmployeeId(data.id);
        }
      };
      fetchEmployeeDetails();
    }
  }, [user]);

  // Fetch user roles
  useEffect(() => {
    if (user) {
      const fetchUserRoles = async () => {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching user roles:', error);
          toast.error('Failed to fetch user roles.');
          return;
        }
        if (data) {
          const roles = data.map(r => r.role as UserRole);
          setUserRoles(roles);
          setIsSupervisor(roles.includes('supervisor'));
          setIsAdmin(roles.includes('admin'));
        }
      };
      fetchUserRoles();
    }
  }, [user]);

  // Fetch time entries for review (admin sees all; supervisor sees their team)
  const { data: timeEntries, isLoading: isLoadingEntries } = useQuery<TimeEntry[], Error>({
    queryKey: ['reviewTimeEntries', isAdmin, employeeId],
    queryFn: async () => {
      // Admin: see all entries
      if (isAdmin) {
        const { data, error } = await supabase
          .from('time_entries')
          .select(`
            *,
            employees!inner (
              name,
              supervisor_id
            )
          `)
          .order('submitted_at', { ascending: true, nullsFirst: false })
          .order('entry_date', { ascending: false });
        if (error) throw new Error(error.message);
        return data || [];
      }

      // Supervisor: only team entries
      if (!employeeId) {
        throw new Error("Supervisor employee ID not found");
      }

      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          employees!inner ( 
            name,
            supervisor_id
          ) 
        `)
        .eq('employees.supervisor_id', employeeId)
        .order('submitted_at', { ascending: true, nullsFirst: false })
        .order('entry_date', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: isAdmin || (isSupervisor && !!employeeId),
  });

  // Mutation to approve a time entry
  const approveTimeEntryMutation = useMutation<TimeEntry, Error, string>({
    mutationFn: async (entryId) => {
      if (!employeeId && !isAdmin) throw new Error("Supervisor employee ID not found.");
      const updates: TablesUpdate<'time_entries'> = {
        is_finalized: true, // Should already be true if submitted
        approved_at: new Date().toISOString(),
        approved_by_supervisor_id: employeeId ?? null,
        rejected_at: null, // Clear any previous rejection
        rejection_reason: null,
      };
      const { data, error } = await supabase
        .from('time_entries')
        .update(updates)
        .eq('id', entryId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Failed to approve time entry: no data returned.");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviewTimeEntries'] });
      toast.success('Time entry approved!');
    },
    onError: (error) => {
      toast.error(`Failed to approve entry: ${error.message}`);
    },
  });

  // Mutation to reject a time entry
  const rejectTimeEntryMutation = useMutation<TimeEntry, Error, { entryId: string; reason: string }>({
    mutationFn: async ({ entryId, reason }) => {
      if (!reason || reason.trim() === '') throw new Error("Rejection reason is required.");
      const updates: TablesUpdate<'time_entries'> = {
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        approved_at: null, // Clear any previous approval
        approved_by_supervisor_id: null,
        // is_finalized remains true, but it's now in a rejected state.
        // Or, business logic might require is_finalized = false to send it back to draft.
        // For DCAA, keeping it finalized but rejected is likely better for audit.
      };
      const { data, error } = await supabase
        .from('time_entries')
        .update(updates)
        .eq('id', entryId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Failed to reject time entry: no data returned.");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviewTimeEntries'] });
      toast.success('Time entry rejected!');
    },
    onError: (error) => {
      toast.error(`Failed to reject entry: ${error.message}`);
    },
  });

  const handleReject = (entryId: string) => {
    const reason = prompt("Please provide a reason for rejection:");
    if (reason !== null) { // prompt returns null if cancelled
      if (reason.trim() === "") {
        toast.error("Rejection reason cannot be empty.");
        return;
      }
      rejectTimeEntryMutation.mutate({ entryId, reason });
    }
  };


  if (!user) {
    return <p>Please sign in.</p>;
  }

  if (userRoles.length === 0 && !isAdmin && !isSupervisor) { // Still loading roles
     return <p>Loading user data or unauthorized...</p>;
  }

  if (!isAdmin && !isSupervisor) {
    return <p>Access Denied. This page is for supervisors or admins only.</p>;
  }
  
  const entriesToReview = timeEntries?.filter(entry => entry.is_finalized && !entry.approved_at && !entry.rejected_at);
  const approvedEntries = timeEntries?.filter(entry => entry.approved_at);
  const rejectedEntries = timeEntries?.filter(entry => entry.rejected_at);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Supervisor Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Time Entries for Review</CardTitle>
          <CardDescription>Approve or reject submitted time entries.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingEntries && <p>Loading entries...</p>}
          {!isLoadingEntries && (!entriesToReview || entriesToReview.length === 0) && (
            <p>No time entries currently awaiting review.</p>
          )}
          {!isLoadingEntries && entriesToReview && entriesToReview.length > 0 && (
            <ul className="space-y-4">
              {entriesToReview.map((entry) => (
                <li key={entry.id} className="p-4 border rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-yellow-50 border-yellow-200">
                  <div>
                    {/* @ts-expect-error employees is not directly on TimeEntry type but fetched via join */}
                    <p className="font-semibold">Employee: {entry.employees?.name || 'N/A'} (Project: {entry.project_code})</p>
                    <p className="text-sm">Date: {format(new Date(entry.entry_date), "PPP")}</p>
                    <p className="text-sm">Hours: {entry.hours_worked}</p>
                    {entry.notes && <p className="text-sm text-muted-foreground">Notes: {entry.notes}</p>}
                     {entry.submitted_at && <p className="text-xs text-gray-500">Submitted: {format(new Date(entry.submitted_at), "PPP p")}</p>}
                  </div>
                  <div className="flex space-x-2 self-start sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-green-500 hover:bg-green-600 text-white"
                      onClick={() => approveTimeEntryMutation.mutate(entry.id)}
                      disabled={approveTimeEntryMutation.isPending && approveTimeEntryMutation.variables === entry.id}
                    >
                      <ShieldCheck className="mr-1 h-4 w-4" />
                      {approveTimeEntryMutation.isPending && approveTimeEntryMutation.variables === entry.id ? 'Approving...' : 'Approve'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleReject(entry.id)}
                      disabled={rejectTimeEntryMutation.isPending && rejectTimeEntryMutation.variables?.entryId === entry.id}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                       {rejectTimeEntryMutation.isPending && rejectTimeEntryMutation.variables?.entryId === entry.id ? 'Rejecting...' : 'Reject'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      
      {/* Section for Approved Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Recently Approved Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingEntries && <p>Loading...</p>}
          {!isLoadingEntries && (!approvedEntries || approvedEntries.length === 0) && <p>No entries approved yet.</p>}
          {!isLoadingEntries && approvedEntries && approvedEntries.length > 0 && (
            <ul className="space-y-2">
              {approvedEntries.slice(0, 5).map(entry => ( // Show last 5
                <li key={entry.id} className="p-3 border rounded-md bg-green-50 border-green-200">
                  {/* @ts-expect-error employees is not directly on TimeEntry type but fetched via join */}
                  <p className="font-medium">Employee: {entry.employees?.name || 'N/A'} (Project: {entry.project_code}) - {entry.hours_worked} hrs on {format(new Date(entry.entry_date), "PPP")}</p>
                  {entry.approved_at && <p className="text-xs text-gray-600">Approved: {format(new Date(entry.approved_at), "PPP p")}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Section for Rejected Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Recently Rejected Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingEntries && <p>Loading...</p>}
          {!isLoadingEntries && (!rejectedEntries || rejectedEntries.length === 0) && <p>No entries rejected yet.</p>}
          {!isLoadingEntries && rejectedEntries && rejectedEntries.length > 0 && (
            <ul className="space-y-2">
              {rejectedEntries.slice(0, 5).map(entry => ( // Show last 5
                <li key={entry.id} className="p-3 border rounded-md bg-red-50 border-red-200">
                  {/* @ts-expect-error employees is not directly on TimeEntry type but fetched via join */}
                  <p className="font-medium">Employee: {entry.employees?.name || 'N/A'} (Project: {entry.project_code}) - {entry.hours_worked} hrs on {format(new Date(entry.entry_date), "PPP")}</p>
                  {entry.rejected_at && <p className="text-xs text-gray-600">Rejected: {format(new Date(entry.rejected_at), "PPP p")}</p>}
                  {entry.rejection_reason && <p className="text-xs text-red-700">Reason: {entry.rejection_reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SupervisorDashboardPage;

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// Define the form schema based on the time_entries table
const timeEntrySchema = z.object({
  project_code: z.string().min(1, "Project code is required"),
  hours_worked: z.coerce.number().min(0.1, "Hours worked must be greater than 0").max(24, "Hours cannot exceed 24"),
  notes: z.string().optional(),
  entry_date: z.date({ required_error: "Entry date is required" }),
});

type TimeEntryFormValues = z.infer<typeof timeEntrySchema>;
type TimeEntry = Tables<'time_entries'>;

// Define the specific shape of data passed to the addTimeEntryMutation
type AddTimeEntryVariables = {
  project_code: string;
  hours_worked: number;
  notes?: string;
  entry_date: string; // Formatted as yyyy-MM-dd
};

const TimeEntriesPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  // Fetch employee_id for the current user
  useEffect(() => {
    if (user) {
      const fetchEmployeeId = async () => {
        const { data, error } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', user.id)
          .single();
        if (error) {
          console.error('Error fetching employee_id:', error);
          toast.error('Error fetching employee details. Please ensure you are registered as an employee.');
        } else if (data) {
          setEmployeeId(data.id);
        }
      };
      fetchEmployeeId();
    }
  }, [user]);

  const form = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      project_code: '',
      hours_worked: 0,
      notes: '',
      entry_date: new Date(),
    },
  });

  // Fetch time entries
  const { data: timeEntries, isLoading: isLoadingEntries } = useQuery<TimeEntry[], Error>({
    queryKey: ['timeEntries', employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', employeeId)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false }); // Secondary sort for consistent ordering
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!employeeId,
  });

  // Mutation to add a new time entry
  const addTimeEntryMutation = useMutation<TimeEntry, Error, AddTimeEntryVariables>({
    mutationFn: async (newEntryData) => {
      if (!employeeId) throw new Error("Employee ID not found.");
      
      const entryToInsert: TablesInsert<'time_entries'> = {
        project_code: newEntryData.project_code,
        hours_worked: newEntryData.hours_worked,
        notes: newEntryData.notes, // notes can be undefined, Supabase client handles this
        entry_date: newEntryData.entry_date,
        employee_id: employeeId,
        is_finalized: false, // Default value
        // Other optional fields (approved_at, etc.) default to undefined
      };
      
      const { data, error } = await supabase
        .from('time_entries')
        .insert(entryToInsert)
        .select('*') // Explicitly select all columns to ensure correct return type
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Failed to create time entry: no data returned."); // Ensure data is not null

      return data; // data is now correctly typed as TimeEntry (Tables<'time_entries', 'Row'>)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries', employeeId] });
      toast.success('Time entry added successfully!');
      form.reset();
    },
    onError: (error) => {
      toast.error(`Failed to add time entry: ${error.message}`);
    },
  });

  // Mutation to submit a time entry
  const submitTimeEntryMutation = useMutation<TimeEntry, Error, string>({
    mutationFn: async (entryId) => {
      const updates: TablesUpdate<'time_entries'> = {
        is_finalized: true,
        submitted_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('time_entries')
        .update(updates)
        .eq('id', entryId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Failed to submit time entry: no data returned.");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries', employeeId] });
      toast.success('Time entry submitted successfully!');
    },
    onError: (error) => {
      toast.error(`Failed to submit time entry: ${error.message}`);
    },
  });

  // Mutation to delete a time entry
  const deleteTimeEntryMutation = useMutation<string, Error, string>({
    mutationFn: async (entryId) => {
      // Optionally, add a check here to prevent deleting finalized entries from the backend
      // For now, UI will prevent this.
      const { error } = await supabase.from('time_entries').delete().eq('id', entryId);
      if (error) throw new Error(error.message);
      return entryId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries', employeeId] });
      toast.success(`Time entry deleted successfully!`);
    },
    onError: (error) => {
      toast.error(`Failed to delete time entry: ${error.message}`);
    }
  });

  const onSubmit = (values: TimeEntryFormValues) => {
    if (!employeeId) {
      toast.error("Cannot submit entry: Employee details not found.");
      return;
    }
    const payload: AddTimeEntryVariables = {
      project_code: values.project_code,
      hours_worked: values.hours_worked,
      entry_date: format(values.entry_date, 'yyyy-MM-dd'),
    };
    if (values.notes && values.notes.trim() !== '') { // Only include notes if present and not empty
      payload.notes = values.notes;
    }
    addTimeEntryMutation.mutate(payload);
  };

  if (!user) {
    return <p>Please sign in to manage time entries.</p>;
  }
  
  if (!employeeId && user) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-lg">Loading employee details...</p>
        <p className="text-sm text-muted-foreground">If this takes too long, please ensure your user account is linked to an employee profile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Manage Time Entries</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add New Time Entry</CardTitle>
          <CardDescription>Fill in the details below to log your time. Entries are saved as drafts until submitted.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="entry_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Entry Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={`w-[240px] pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="project_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., PRJ-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hours_worked"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hours Worked</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="e.g., 7.5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Brief description of work done" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={addTimeEntryMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" /> {addTimeEntryMutation.isPending ? 'Adding...' : 'Add Entry as Draft'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Time Entries</CardTitle>
          <CardDescription>Manage your draft and submitted time entries.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingEntries && <p>Loading entries...</p>}
          {!isLoadingEntries && (!timeEntries || timeEntries.length === 0) && (
            <p>No time entries found. Add one using the form above.</p>
          )}
          {!isLoadingEntries && timeEntries && timeEntries.length > 0 && (
            <ul className="space-y-4">
              {timeEntries.map((entry) => (
                <li key={entry.id} className={`p-4 border rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${entry.is_finalized ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">Project: {entry.project_code}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${entry.is_finalized ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {entry.is_finalized ? 'Submitted' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-sm">Date: {format(new Date(entry.entry_date), "PPP")}</p>
                    <p className="text-sm">Hours: {entry.hours_worked}</p>
                    {entry.notes && <p className="text-sm text-muted-foreground">Notes: {entry.notes}</p>}
                    {entry.is_finalized && entry.submitted_at && (
                      <p className="text-xs text-gray-500">Submitted on: {format(new Date(entry.submitted_at), "PPP p")}</p>
                    )}
                  </div>
                  <div className="flex space-x-2 self-start sm:self-center">
                    {!entry.is_finalized && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => submitTimeEntryMutation.mutate(entry.id)}
                          disabled={submitTimeEntryMutation.isPending && submitTimeEntryMutation.variables === entry.id}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          {submitTimeEntryMutation.isPending && submitTimeEntryMutation.variables === entry.id ? 'Submitting...' : 'Submit'}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteTimeEntryMutation.mutate(entry.id)}
                          disabled={deleteTimeEntryMutation.isPending && deleteTimeEntryMutation.variables === entry.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {/* Placeholder for "Request Edit" for submitted entries */}
                    {entry.is_finalized && (
                       <p className="text-xs text-gray-500 italic mt-1">Entry submitted. Contact supervisor for changes.</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TimeEntriesPage;

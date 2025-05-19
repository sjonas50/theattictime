
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
import { Calendar as CalendarIcon, Plus, Trash2 } from 'lucide-react'; // Using Calendar alias for icon
import { Tables } from '@/integrations/supabase/types'; // Import Tables type

// Define the form schema based on the time_entries table
const timeEntrySchema = z.object({
  project_code: z.string().min(1, "Project code is required"),
  hours_worked: z.coerce.number().min(0.1, "Hours worked must be greater than 0").max(24, "Hours cannot exceed 24"),
  notes: z.string().optional(),
  entry_date: z.date({ required_error: "Entry date is required" }),
});

type TimeEntryFormValues = z.infer<typeof timeEntrySchema>;
type TimeEntry = Tables<'time_entries'>;

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
        .order('entry_date', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!employeeId, // Only run query if employeeId is available
  });

  // Mutation to add a new time entry
  const addTimeEntryMutation = useMutation<TimeEntry, Error, Omit<Tables<'time_entries', 'Insert'>, 'employee_id' | 'id' | 'created_at' | 'updated_at' | 'is_finalized'> & { entry_date: string }>({
    mutationFn: async (newEntryData) => {
      if (!employeeId) throw new Error("Employee ID not found.");
      
      const entryToInsert: Tables<'time_entries', 'Insert'> = {
        ...newEntryData,
        employee_id: employeeId,
        is_finalized: false, // Default value
      };
      
      // @ts-ignore - supabase types might not perfectly align with our mutation input here, ensure it's correct
      const { data, error } = await supabase.from('time_entries').insert(entryToInsert).select().single();
      if (error) throw new Error(error.message);
      return data as TimeEntry;
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

  // Mutation to delete a time entry
  const deleteTimeEntryMutation = useMutation<any, Error, string>({
    mutationFn: async (entryId) => {
      const { error } = await supabase.from('time_entries').delete().eq('id', entryId);
      if (error) throw new Error(error.message);
      return entryId;
    },
    onSuccess: (entryId) => {
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
    addTimeEntryMutation.mutate({
      ...values,
      entry_date: format(values.entry_date, 'yyyy-MM-dd'), // Format date for Supabase
    });
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
          <CardDescription>Fill in the details below to log your time.</CardDescription>
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
                <Plus className="mr-2 h-4 w-4" /> {addTimeEntryMutation.isPending ? 'Adding...' : 'Add Entry'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Time Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingEntries && <p>Loading entries...</p>}
          {!isLoadingEntries && (!timeEntries || timeEntries.length === 0) && (
            <p>No time entries found. Add one using the form above.</p>
          )}
          {!isLoadingEntries && timeEntries && timeEntries.length > 0 && (
            <ul className="space-y-4">
              {timeEntries.map((entry) => (
                <li key={entry.id} className="p-4 border rounded-md flex justify-between items-center">
                  <div>
                    <p className="font-semibold">Project: {entry.project_code} ({format(new Date(entry.entry_date), "PPP")})</p>
                    <p>Hours: {entry.hours_worked}</p>
                    {entry.notes && <p className="text-sm text-muted-foreground">Notes: {entry.notes}</p>}
                  </div>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => deleteTimeEntryMutation.mutate(entry.id)}
                    disabled={deleteTimeEntryMutation.isPending && deleteTimeEntryMutation.variables === entry.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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


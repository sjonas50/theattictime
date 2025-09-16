
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
import { Calendar as CalendarIcon, Plus, Trash2, CheckCircle2, Edit3, XCircle, Loader2 } from 'lucide-react';
import VoiceReporter from '@/components/VoiceReporter';
import VoiceAnalysisReview from '@/components/VoiceAnalysisReview';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// Update the form schema to include modification_reason (optional for new, required for edit)
const timeEntrySchema = z.object({
  project_code: z.string().min(1, "Project code is required"), // This remains a string
  hours_worked: z.coerce.number().min(0.1, "Hours worked must be greater than 0").max(24, "Hours cannot exceed 24"),
  notes: z.string().optional(),
  entry_date: z.date({ required_error: "Entry date is required" }),
  modification_reason: z.string().optional(),
});

type TimeEntryFormValues = z.infer<typeof timeEntrySchema>;
type TimeEntry = Tables<'time_entries'>;
type ProjectCode = Tables<'project_codes'>; // Add type for project codes
type TimeEntryModificationInsert = TablesInsert<'time_entry_modifications'>;

// Define the specific shape of data passed to the addTimeEntryMutation
type AddTimeEntryVariables = {
  project_code: string;
  hours_worked: number;
  notes?: string;
  entry_date: string; // Formatted as yyyy-MM-dd
};

// Define variables for updating a time entry
type UpdateTimeEntryVariables = {
  id: string;
  project_code: string;
  hours_worked: number;
  notes?: string;
  entry_date: string; // Formatted as yyyy-MM-dd
  modification_reason: string;
  original_entry: TimeEntry; // To log changes
};


const TimeEntriesPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [showVoiceAnalysis, setShowVoiceAnalysis] = useState(false);
  const [voiceAnalysis, setVoiceAnalysis] = useState<any>(null);

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

  // Fetch active project codes for the dropdown
  const { data: projectCodes, isLoading: isLoadingProjectCodes } = useQuery<ProjectCode[], Error>({
    queryKey: ['projectCodes'], // Use a distinct key if AdminPage also fetches them differently
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_codes')
        .select('*') // Select all fields to match ProjectCode type
        .eq('is_active', true)
        .order('code', { ascending: true });
      if (error) {
        toast.error(`Failed to load project codes: ${error.message}`);
        throw new Error(error.message);
      }
      return data || [];
    },
  });

  const form = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      project_code: '',
      hours_worked: 0,
      notes: '',
      entry_date: new Date(),
      modification_reason: '',
    },
  });

  useEffect(() => {
    if (editingEntry) {
      form.reset({
        project_code: editingEntry.project_code,
        hours_worked: editingEntry.hours_worked,
        entry_date: new Date(editingEntry.entry_date),
        notes: editingEntry.notes || '',
        modification_reason: '', // Clear reason on new edit
      });
    } else {
      form.reset({ // Reset to default for new entry
        project_code: '',
        hours_worked: 0,
        notes: '',
        entry_date: new Date(),
        modification_reason: '',
      });
    }
  }, [editingEntry, form]);

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
      setEditingEntry(null);
    },
    onError: (error) => {
      toast.error(`Failed to add time entry: ${error.message}`);
    },
  });

  // Mutation to update an existing time entry and log modification
  const updateTimeEntryMutation = useMutation<TimeEntry, Error, UpdateTimeEntryVariables>({
    mutationFn: async ({ id, original_entry, modification_reason, ...updatedValues }) => {
      if (!employeeId) throw new Error("Employee ID not found.");

      const entryUpdate: TablesUpdate<'time_entries'> = {
        project_code: updatedValues.project_code,
        hours_worked: updatedValues.hours_worked,
        notes: updatedValues.notes,
        entry_date: updatedValues.entry_date,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedEntry, error: updateError } = await supabase
        .from('time_entries')
        .update(entryUpdate)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw new Error(`Failed to update time entry: ${updateError.message}`);
      if (!updatedEntry) throw new Error("No data returned after update.");

      // Log the modification
      const modificationLog: TimeEntryModificationInsert = {
        time_entry_id: id,
        modified_by_employee_id: employeeId,
        reason_for_change: modification_reason,
        old_project_code: original_entry.project_code !== updatedValues.project_code ? original_entry.project_code : null,
        new_project_code: original_entry.project_code !== updatedValues.project_code ? updatedValues.project_code : null,
        old_hours_worked: original_entry.hours_worked !== updatedValues.hours_worked ? original_entry.hours_worked : null,
        new_hours_worked: original_entry.hours_worked !== updatedValues.hours_worked ? updatedValues.hours_worked : null,
        old_entry_date: original_entry.entry_date !== updatedValues.entry_date ? original_entry.entry_date : null,
        new_entry_date: original_entry.entry_date !== updatedValues.entry_date ? updatedValues.entry_date : null,
        old_notes: (original_entry.notes || '') !== (updatedValues.notes || '') ? original_entry.notes : null,
        new_notes: (original_entry.notes || '') !== (updatedValues.notes || '') ? updatedValues.notes : null,
      };

      // Remove null fields from modification log, as Supabase might error on explicit nulls for non-nullable DB columns if they weren't actually changed.
      // However, our schema type `TimeEntryModificationInsert` uses `| null` for these fields, so Supabase client should handle it.
      // Let's ensure we only send fields that actually changed.

      const { error: logError } = await supabase
        .from('time_entry_modifications')
        .insert(modificationLog);

      if (logError) {
        // Attempt to rollback or notify about logging failure, for now just toast
        toast.error(`Entry updated, but failed to log modification: ${logError.message}`);
      }
      
      return updatedEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries', employeeId] });
      toast.success('Time entry updated successfully!');
      setEditingEntry(null); // Exit editing mode
      // form.reset() is handled by useEffect on editingEntry change
    },
    onError: (error) => {
      toast.error(`Failed to update time entry: ${error.message}`);
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

    if (editingEntry) { // Handle update
      if (!values.modification_reason || values.modification_reason.trim() === '') {
        form.setError("modification_reason", { type: "manual", message: "Reason for change is required when editing." });
        toast.error("Please provide a reason for the change.");
        return;
      }
      const payload: UpdateTimeEntryVariables = {
        id: editingEntry.id,
        project_code: values.project_code,
        hours_worked: values.hours_worked,
        entry_date: format(values.entry_date, 'yyyy-MM-dd'),
        modification_reason: values.modification_reason,
        original_entry: editingEntry, // Pass the original entry for logging
      };
      if (values.notes && values.notes.trim() !== '') {
        payload.notes = values.notes;
      } else {
        payload.notes = null; // Ensure notes are explicitly set to null if empty
      }
      updateTimeEntryMutation.mutate(payload);

    } else { // Handle add new
      const payload: AddTimeEntryVariables = {
        project_code: values.project_code,
        hours_worked: values.hours_worked,
        entry_date: format(values.entry_date, 'yyyy-MM-dd'),
      };
      if (values.notes && values.notes.trim() !== '') {
        payload.notes = values.notes;
      } else {
        payload.notes = undefined; // Or null, depending on how your backend handles it
      }
      addTimeEntryMutation.mutate(payload);
    }
  };

  const handleEdit = (entry: TimeEntry) => {
    setEditingEntry(entry);
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to form
  };

  const cancelEdit = () => {
    setEditingEntry(null);
    // form.reset() handled by useEffect
  };

  const handleVoiceAnalysisComplete = (analysis: any) => {
    setVoiceAnalysis(analysis);
    setShowVoiceAnalysis(true);
  };

  const handleCreateEntriesFromVoice = async (entries: any[]) => {
    const promises = entries.map(entry => {
      const payload: AddTimeEntryVariables = {
        project_code: entry.project_code,
        hours_worked: entry.hours_worked,
        entry_date: entry.entry_date,
        notes: entry.notes || 'Created from voice report'
      };
      return addTimeEntryMutation.mutateAsync(payload);
    });

    await Promise.all(promises);
    setShowVoiceAnalysis(false);
    setVoiceAnalysis(null);
  };

  const handleCancelVoiceAnalysis = () => {
    setShowVoiceAnalysis(false);
    setVoiceAnalysis(null);
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

      {/* Voice Reporter */}
      {employeeId && !showVoiceAnalysis && (
        <VoiceReporter 
          employeeId={employeeId} 
          onAnalysisComplete={handleVoiceAnalysisComplete} 
        />
      )}

      {/* Voice Analysis Review */}
      {showVoiceAnalysis && voiceAnalysis && employeeId && (
        <VoiceAnalysisReview
          analysis={voiceAnalysis}
          projectCodes={projectCodes || []}
          onCreateEntries={handleCreateEntriesFromVoice}
          onCancel={handleCancelVoiceAnalysis}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{editingEntry ? 'Edit Time Entry' : 'Add New Time Entry'}</CardTitle>
          <CardDescription>
            {editingEntry 
              ? 'Modify the details of your time entry below. A reason for change is required.'
              : 'Fill in the details below to log your time. Entries are saved as drafts until submitted.'}
          </CardDescription>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                      <FormControl>
                        <SelectTrigger disabled={isLoadingProjectCodes}>
                          {isLoadingProjectCodes ? (
                            <span className="flex items-center">
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading codes...
                            </span>
                          ) : (
                            <SelectValue placeholder="Select a project code" />
                          )}
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projectCodes && projectCodes.length > 0 ? (
                          projectCodes.map((pc) => (
                            <SelectItem key={pc.id} value={pc.code}>
                              {pc.name ? `${pc.code} - ${pc.name}` : pc.code}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="loading" disabled>
                            {isLoadingProjectCodes ? 'Loading...' : 'No active project codes found.'}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
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
                      <Input type="number" step="0.01" placeholder="e.g., 7.5" {...field} 
                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)} // ensure number type
                      />
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
                      <Textarea placeholder="Brief description of work done" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {editingEntry && (
                <FormField
                  control={form.control}
                  name="modification_reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason for Change (Required)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Explain why this change is being made..." {...field} value={field.value ?? ""}/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <div className="flex space-x-2">
                <Button type="submit" disabled={addTimeEntryMutation.isPending || updateTimeEntryMutation.isPending || isLoadingProjectCodes}>
                  {editingEntry 
                    ? <><CheckCircle2 className="mr-2 h-4 w-4" /> {updateTimeEntryMutation.isPending ? 'Updating...' : 'Update Entry'}</>
                    : <><Plus className="mr-2 h-4 w-4" /> {addTimeEntryMutation.isPending ? 'Adding...' : 'Add Entry as Draft'}</>
                  }
                </Button>
                {editingEntry && (
                  <Button type="button" variant="outline" onClick={cancelEdit} disabled={updateTimeEntryMutation.isPending}>
                    <XCircle className="mr-2 h-4 w-4" /> Cancel Edit
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Time Entries</CardTitle>
          <CardDescription>Manage your draft and submitted time entries. You can edit draft entries.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingEntries && <p>Loading entries...</p>}
          {!isLoadingEntries && (!timeEntries || timeEntries.length === 0) && (
            <p>No time entries found. Add one using the form above.</p>
          )}
          {!isLoadingEntries && timeEntries && timeEntries.length > 0 && (
            <ul className="space-y-4">
              {timeEntries.map((entry) => (
                <li key={entry.id} className={`p-4 border rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${entry.is_finalized ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'}`}>
                   <div>
                     <div className="flex items-center gap-2">
                       <p className="font-semibold text-foreground">Project: {entry.project_code}</p>
                       <span className={`text-xs px-2 py-0.5 rounded-full ${entry.is_finalized ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'}`}>
                         {entry.is_finalized ? 'Submitted' : 'Draft'}
                       </span>
                     </div>
                     <p className="text-sm text-foreground">Date: {format(new Date(entry.entry_date), "PPP")}</p>
                     <p className="text-sm text-foreground">Hours: {entry.hours_worked}</p>
                     {entry.notes && <p className="text-sm text-muted-foreground">Notes: {entry.notes}</p>}
                     {entry.is_finalized && entry.submitted_at && (
                       <p className="text-xs text-muted-foreground">Submitted on: {format(new Date(entry.submitted_at), "PPP p")}</p>
                     )}
                   </div>
                  <div className="flex flex-wrap gap-2 self-start sm:self-center">
                    {!entry.is_finalized && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(entry)}
                          disabled={submitTimeEntryMutation.isPending || deleteTimeEntryMutation.isPending || updateTimeEntryMutation.isPending}
                        >
                          <Edit3 className="mr-1 h-4 w-4" />
                          Edit
                        </Button>
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
                        <p className="text-xs text-muted-foreground italic mt-1">Entry submitted. Contact supervisor for changes.</p>
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


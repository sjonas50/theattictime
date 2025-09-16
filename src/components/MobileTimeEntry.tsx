import React from 'react';
import { useForm } from 'react-hook-form';
import { getCurrentMountainDate } from '@/lib/timezone';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Wifi, WifiOff, Save, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const timeEntrySchema = z.object({
  hours_worked: z.number().min(0.1, 'Hours must be greater than 0').max(24, 'Hours cannot exceed 24'),
  entry_date: z.string().min(1, 'Date is required'),
  project_code: z.string().min(1, 'Project code is required'),
  notes: z.string().optional(),
});

type TimeEntryFormValues = z.infer<typeof timeEntrySchema>;

interface ProjectCode {
  id: string;
  code: string;
  name?: string;
}

interface MobileTimeEntryProps {
  projectCodes: ProjectCode[];
  employeeId: string;
  initialValues?: Partial<TimeEntryFormValues>;
  onSubmit: (data: TimeEntryFormValues) => Promise<void>;
  onCancel?: () => void;
  isEditing?: boolean;
  isLoading?: boolean;
}

export function MobileTimeEntry({
  projectCodes,
  employeeId,
  initialValues,
  onSubmit,
  onCancel,
  isEditing = false,
  isLoading = false,
}: MobileTimeEntryProps) {
  const isMobile = useIsMobile();
  const { isOnline, saveOfflineEntry } = useOfflineSync();
  const { toast } = useToast();

  const form = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      hours_worked: initialValues?.hours_worked || 0,
      entry_date: initialValues?.entry_date || getCurrentMountainDate(),
      project_code: initialValues?.project_code || '',
      notes: initialValues?.notes || '',
    },
  });

  const handleSubmit = async (data: TimeEntryFormValues) => {
    try {
      if (isOnline) {
        await onSubmit(data);
      } else {
        // Save offline
        await saveOfflineEntry({
          employeeId,
          hoursWorked: data.hours_worked,
          entryDate: data.entry_date,
          projectCode: data.project_code,
          notes: data.notes,
        });
        
        form.reset();
        onCancel?.();
      }
    } catch (error) {
      console.error('Error submitting time entry:', error);
    }
  };

  const ConnectionStatus = () => (
    <div className="flex items-center gap-2 text-sm">
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4 text-green-500" />
          <span className="text-green-600">Online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 text-amber-500" />
          <span className="text-amber-600">Offline</span>
        </>
      )}
    </div>
  );

  return (
    <Card className={`w-full ${isMobile ? 'max-w-none' : 'max-w-md'}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {isEditing ? 'Edit Time Entry' : 'Add Time Entry'}
          </CardTitle>
          <ConnectionStatus />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="entry_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input 
                      type="date" 
                      {...field}
                      className={isMobile ? 'h-12 text-base' : ''}
                    />
                  </FormControl>
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className={isMobile ? 'h-12 text-base' : ''}>
                        <SelectValue placeholder="Select a project code" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projectCodes.map((code) => (
                        <SelectItem key={code.id} value={code.code}>
                          <div className="flex flex-col items-start">
                            <span className="font-mono">{code.code}</span>
                            {code.name && (
                              <span className="text-xs text-muted-foreground">{code.name}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
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
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      placeholder="8.0"
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      className={isMobile ? 'h-12 text-base' : ''}
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
                    <Textarea
                      placeholder="Add any notes about your work..."
                      className={`resize-none ${isMobile ? 'min-h-[80px] text-base' : ''}`}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={`flex gap-3 ${isMobile ? 'flex-col' : ''}`}>
              <Button
                type="submit"
                disabled={isLoading}
                className={`flex-1 ${isMobile ? 'h-12 text-base' : ''}`}
              >
                {isOnline ? (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {isEditing ? 'Update Entry' : 'Add Entry'}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Offline
                  </>
                )}
              </Button>
              
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  className={isMobile ? 'h-12 text-base' : ''}
                >
                  Cancel
                </Button>
              )}
            </div>

            {!isOnline && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  You're offline. This entry will be saved locally and synced when you're back online.
                </p>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
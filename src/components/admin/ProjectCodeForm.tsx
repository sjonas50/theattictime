
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { Plus, Save } from 'lucide-react';

export const projectCodeSchema = z.object({
  code: z.string().min(1, "Code is required").max(50, "Code cannot exceed 50 characters."),
  name: z.string().max(100, "Name cannot exceed 100 characters.").optional().nullable(),
  description: z.string().max(255, "Description cannot exceed 255 characters.").optional().nullable(),
  is_active: z.boolean().default(true),
});

export type ProjectCodeFormValues = z.infer<typeof projectCodeSchema>;
type ProjectCode = Tables<'project_codes'>;

interface ProjectCodeFormProps {
  onSubmit: (values: ProjectCodeFormValues, currentProjectCodeId?: string) => void;
  initialData?: ProjectCode | null;
  isSubmitting: boolean;
}

const ProjectCodeForm: React.FC<ProjectCodeFormProps> = ({ onSubmit, initialData, isSubmitting }) => {
  const form = useForm<ProjectCodeFormValues>({
    resolver: zodResolver(projectCodeSchema),
    defaultValues: initialData || {
      code: '',
      name: '',
      description: '',
      is_active: true,
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset(initialData);
    } else {
      form.reset({
        code: '',
        name: '',
        description: '',
        is_active: true,
      });
    }
  }, [initialData, form]);

  const handleSubmit = (values: ProjectCodeFormValues) => {
    onSubmit(values, initialData?.id);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Code *</FormLabel>
              <FormControl>
                <Input placeholder="e.g., PRJ-001" {...field} disabled={!!initialData} className="text-base md:text-sm"/>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Client X Website Redesign" {...field} value={field.value ?? ""} className="text-base md:text-sm"/>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Brief description of the project" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {initialData && ( // Only show is_active toggle when editing
          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>Active</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Inactive project codes cannot be selected for new time entries.
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        )}
        <Button type="submit" disabled={isSubmitting}>
          {initialData ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {isSubmitting ? (initialData ? 'Saving...' : 'Adding...') : (initialData ? 'Save Changes' : 'Add Project Code')}
        </Button>
        {initialData && (
          <Button type="button" variant="outline" onClick={() => form.reset({code: '', name: '', description: '', is_active: true})} className="ml-2">
            Clear to Add New
          </Button>
        )}
      </form>
    </Form>
  );
};

export default ProjectCodeForm;

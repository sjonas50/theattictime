
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const employeeFormSchema = z.object({
  userId: z.string().uuid({ message: "Must be a valid User ID (UUID format)." }),
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  employeeIdInternal: z.string().min(1, { message: "Internal Employee ID is required." }),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

const CreateEmployeeForm = () => {
  const queryClient = useQueryClient();
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      userId: '',
      name: '',
      employeeIdInternal: '',
    },
  });

  const onSubmit = async (values: EmployeeFormValues) => {
    try {
      // Check if user_id exists in auth.users - This is a client-side check limitation.
      // A proper check would be an edge function or ensuring UUIDs are sourced correctly.
      // For now, we proceed assuming the admin provides a valid auth.user.id.

      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .insert([
          {
            user_id: values.userId,
            name: values.name,
            employee_id_internal: values.employeeIdInternal,
          },
        ])
        .select()
        .single();

      if (employeeError) throw employeeError;

      if (employeeData) {
        // Assign default 'employee' role
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({ user_id: values.userId, role: 'employee' });

        if (roleError) {
          // Log role error, but employee creation was successful
          console.warn('Employee created, but failed to assign default role:', roleError);
          toast.warning(`Employee ${values.name} created, but failed to assign default 'employee' role. Please assign manually.`);
        } else {
          toast.success(`Employee ${values.name} created and 'employee' role assigned.`);
        }
      }
      
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['employees_admin'] });
      queryClient.invalidateQueries({ queryKey: ['user_roles_admin'] });
    } catch (error: any) {
      console.error('Error creating employee:', error);
      // Check for unique constraint violation for user_id in employees table
      if (error.code === '23505' && error.message.includes('employees_user_id_key')) {
        toast.error('Error: This User ID is already associated with an employee.');
      } else if (error.code === '23503' && error.message.includes('employees_user_id_fkey')) {
        // This error means the user_id does not exist in auth.users
        // However, Supabase might not return this specific error if RLS prevents the check or if FK is not to auth.users directly.
        // The employees.user_id does not have a direct FK to auth.users in the provided schema.
        // This message is a placeholder for a more robust check.
        toast.error('Error: The provided User ID does not exist or is invalid.');
      }
      else {
        toast.error(`Failed to create employee: ${error.message}`);
      }
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="userId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>User ID (Auth User UUID)</FormLabel>
              <FormControl>
                <Input placeholder="Enter the user's auth.uid()" {...field} />
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
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="Employee's full name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="employeeIdInternal"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Internal Employee ID</FormLabel>
              <FormControl>
                <Input placeholder="e.g., EMP001" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Creating...' : 'Create Employee'}
        </Button>
      </form>
    </Form>
  );
};

export default CreateEmployeeForm;

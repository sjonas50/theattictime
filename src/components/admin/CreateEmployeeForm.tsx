
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
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  employeeIdInternal: z.string().min(1, { message: "Internal Employee ID is required." }),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

const CreateEmployeeForm = () => {
  const queryClient = useQueryClient();
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      email: '',
      password: '',
      name: '',
      employeeIdInternal: '',
    },
  });

  const onSubmit = async (values: EmployeeFormValues) => {
    try {
      const { data: functionData, error: functionError } = await supabase.functions.invoke('create-user-and-employee', {
        body: {
          email: values.email,
          password: values.password,
          name: values.name,
          employeeIdInternal: values.employeeIdInternal,
        }
      });

      if (functionError) {
        // Handle potential network errors or if function itself crashes before returning structured error
        console.error('Error invoking edge function:', functionError);
        toast.error(`Failed to create employee: ${functionError.message}`);
        return;
      }

      // Edge function is expected to return JSON, data could be the parsed JSON or an error object from the function
      const responseData = functionData; // supabase.functions.invoke already parses JSON if Content-Type is application/json

      if (responseData && responseData.error) {
        // Error explicitly returned by the edge function
        console.error('Error from edge function:', responseData.error);
        toast.error(`Failed to create employee: ${responseData.error}`);
      } else if (responseData && responseData.message) {
        toast.success(responseData.message);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ['employees_admin'] });
        queryClient.invalidateQueries({ queryKey: ['user_roles_admin'] });
        // Potentially invalidate auth users list if that's displayed anywhere admin can see
      } else {
        // Fallback for unexpected response structure
        console.error('Unexpected response from edge function:', responseData);
        toast.error('An unexpected error occurred while creating the employee.');
      }

    } catch (error: any) {
      // Catch-all for other unexpected errors during the process
      console.error('Error creating employee (client-side catch):', error);
      toast.error(`Failed to create employee: ${error.message || 'An unknown error occurred.'}`);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>User Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="Enter user's email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Enter a temporary password" {...field} />
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
          {form.formState.isSubmitting ? 'Creating...' : 'Create Employee & User Account'}
        </Button>
      </form>
    </Form>
  );
};

export default CreateEmployeeForm;


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
      name: '',
      employeeIdInternal: '',
    },
  });

  const onSubmit = async (values: EmployeeFormValues) => {
    try {
      const { data: functionData, error: functionError } = await supabase.functions.invoke('create-user-and-employee', {
        body: {
          email: values.email,
          name: values.name,
          employeeIdInternal: values.employeeIdInternal,
        }
      });

      if (functionError) {
        console.error('Error invoking edge function:', functionError);

        let specificErrorMessage = functionError.message;

        // FunctionsHttpError.context is a Response object — read its body to get the real error
        try {
          const ctx = (functionError as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.clone().json();
            if (body?.error) specificErrorMessage = body.error;
          } else if (ctx && typeof ctx === 'object' && ctx.error) {
            specificErrorMessage = ctx.error;
          }
        } catch (e) {
          console.error('Failed to parse function error body:', e);
        }

        toast.error(`Failed to create employee: ${specificErrorMessage}`);
        return;
      }

      const responseData = functionData;

      if (responseData && responseData.error) {
        console.error('Error from edge function (data.error):', responseData.error);
        toast.error(`Failed to create employee: ${responseData.error}`);
      } else if (responseData && responseData.message) {
        toast.success("Employee invited successfully. They will receive an email to set up their account.");
        form.reset();
        queryClient.invalidateQueries({ queryKey: ['employees_admin'] });
        queryClient.invalidateQueries({ queryKey: ['user_roles_admin'] });
      } else {
        console.error('Unexpected response from edge function (no error, no message):', responseData);
        toast.error('An unexpected error occurred while creating the employee.');
      }

    } catch (error: any) {
      console.error('Error creating employee (client-side catch):', error);
      // Ensure error.message exists and is a string
      const errorMessage = error && typeof error.message === 'string' ? error.message : 'An unknown error occurred.';
      toast.error(`Failed to create employee: ${errorMessage}`);
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
          {form.formState.isSubmitting ? 'Sending Invite...' : 'Invite Employee & Create User Account'}
        </Button>
      </form>
    </Form>
  );
};

export default CreateEmployeeForm;

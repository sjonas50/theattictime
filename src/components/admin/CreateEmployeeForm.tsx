
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
        // Log the full error object for debugging, in case the structure is different than expected
        console.error('Error invoking edge function (full object):', JSON.stringify(functionError, null, 2));
        
        let specificErrorMessage = functionError.message; // Default to the generic Supabase client message

        // Attempt to extract a more specific error from the function's response context
        // The 'context' field in FunctionsHttpError often holds the parsed JSON response body
        if (functionError.context && typeof functionError.context === 'object' && functionError.context.error) {
          specificErrorMessage = functionError.context.error;
        } else if (functionError.context && typeof functionError.context === 'string') {
          // If context is a string, try to parse it as JSON
          try {
            const parsedContext = JSON.parse(functionError.context);
            if (parsedContext && parsedContext.error) {
              specificErrorMessage = parsedContext.error;
            } else {
              // If parsing or finding .error fails, but context is a string, it might be the error message itself
              specificErrorMessage = functionError.context;
            }
          } catch (e) {
            // If JSON parsing fails, and context is a string, use context as the message
            // This handles cases where the function might return a plain text error for some reason
             if (functionError.context && functionError.context.length > 0 && functionError.context.length < 200) { // Check length to avoid huge html pages
                specificErrorMessage = functionError.context;
            }
            // else, stick with the original functionError.message
          }
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

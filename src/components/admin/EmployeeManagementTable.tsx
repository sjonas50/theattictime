
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Enums, Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from 'sonner';
import { Trash } from 'lucide-react';

type Employee = Tables<'employees'>;
type UserRoleEntry = Tables<'user_roles'>;
type AppRole = Enums<'app_role'>;

const ALL_ROLES: AppRole[] = ['admin', 'supervisor', 'employee'];

const fetchEmployeesAdmin = async (): Promise<Employee[]> => {
  const { data, error } = await supabase.from('employees').select('*');
  if (error) throw error;
  return data || [];
};

const fetchUserRolesAdmin = async (): Promise<UserRoleEntry[]> => {
  const { data, error } = await supabase.from('user_roles').select('*');
  if (error) throw error;
  return data || [];
};

const EmployeeManagementTable = () => {
  const queryClient = useQueryClient();

  const { data: employees, isLoading: isLoadingEmployees, error: employeesError } = useQuery({
    queryKey: ['employees_admin'],
    queryFn: fetchEmployeesAdmin,
  });

  const { data: userRoles, isLoading: isLoadingUserRoles, error: userRolesError } = useQuery({
    queryKey: ['user_roles_admin'],
    queryFn: fetchUserRolesAdmin,
  });

  const updateUserRolesMutation = useMutation({
    mutationFn: async ({ userId, newRoles }: { userId: string; newRoles: AppRole[] }) => {
      // Delete existing roles for the user
      const { error: deleteError } = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (deleteError) throw deleteError;

      // Insert new roles if any
      if (newRoles.length > 0) {
        const rolesToInsert = newRoles.map(role => ({ user_id: userId, role }));
        const { error: insertError } = await supabase.from('user_roles').insert(rolesToInsert);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      toast.success('User roles updated successfully.');
      queryClient.invalidateQueries({ queryKey: ['user_roles_admin'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to update roles: ${error.message}`);
    },
  });
  
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      // Note: Deleting an employee might require deleting related user_roles first if there's a strict FK or trigger.
      // Assuming cascade delete on user_id for user_roles or manual cleanup.
      // First delete associated roles
      const employeeToDelete = employees?.find(emp => emp.id === employeeId);
      if (employeeToDelete?.user_id) {
         const { error: deleteRolesError } = await supabase.from('user_roles').delete().eq('user_id', employeeToDelete.user_id);
         if (deleteRolesError) {
            console.warn("Could not delete user roles for employee, proceeding with employee deletion:", deleteRolesError.message);
            // toast.warn("Could not clear all roles, but attempting employee deletion.");
         }
      }

      const { error } = await supabase.from('employees').delete().eq('id', employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Employee deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['employees_admin'] });
      queryClient.invalidateQueries({ queryKey: ['user_roles_admin'] }); // Roles might be affected
    },
    onError: (error: any) => {
      toast.error(`Failed to delete employee: ${error.message}`);
    },
  });


  if (isLoadingEmployees || isLoadingUserRoles) return <p>Loading employee data...</p>;
  if (employeesError) return <p className="text-red-500">Error loading employees: {employeesError.message}</p>;
  if (userRolesError) return <p className="text-red-500">Error loading user roles: {userRolesError.message}</p>;

  const getEmployeeRoles = (userId: string): AppRole[] => {
    return userRoles?.filter(ur => ur.user_id === userId).map(ur => ur.role as AppRole) || [];
  };

  const handleRoleChange = (userId: string, role: AppRole, isChecked: boolean) => {
    const currentRoles = getEmployeeRoles(userId);
    let newRoles: AppRole[];
    if (isChecked) {
      newRoles = [...currentRoles, role];
    } else {
      newRoles = currentRoles.filter(r => r !== role);
    }
    updateUserRolesMutation.mutate({ userId, newRoles });
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Internal ID</TableHead>
            <TableHead>User ID (Auth)</TableHead>
            {ALL_ROLES.map(role => <TableHead key={role} className="capitalize">{role}</TableHead>)}
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees?.map(employee => {
            const currentRoles = getEmployeeRoles(employee.user_id);
            return (
              <TableRow key={employee.id}>
                <TableCell>{employee.name}</TableCell>
                <TableCell>{employee.employee_id_internal}</TableCell>
                <TableCell>{employee.user_id}</TableCell>
                {ALL_ROLES.map(role => (
                  <TableCell key={role}>
                    <Checkbox
                      id={`role-${employee.user_id}-${role}`}
                      checked={currentRoles.includes(role)}
                      onCheckedChange={(checked) => handleRoleChange(employee.user_id, role, !!checked)}
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to delete employee ${employee.name}? This action cannot be undone.`)) {
                        deleteEmployeeMutation.mutate(employee.id);
                      }
                    }}
                    disabled={deleteEmployeeMutation.isPending}
                  >
                    <Trash className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {employees?.length === 0 && <p className="text-center py-4">No employees found.</p>}
    </div>
  );
};

export default EmployeeManagementTable;

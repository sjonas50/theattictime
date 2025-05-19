
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Enums } from '@/integrations/supabase/types';
import CreateEmployeeForm from '@/components/admin/CreateEmployeeForm';
import EmployeeManagementTable from '@/components/admin/EmployeeManagementTable';
import ProjectCodeManagement from '@/components/admin/ProjectCodeManagement';
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Added Card components

type UserRole = Enums<'app_role'>;

const AdminPage = () => {
  const { user } = useAuth();
  const [isAdminOrSupervisor, setIsAdminOrSupervisor] = useState(false);
  const [loadingUserRoles, setLoadingUserRoles] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (user) {
      const fetchUserRoles = async () => {
        setLoadingUserRoles(true);
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching user roles:', error);
          toast.error("Error checking user privileges.");
        } else if (data) {
          const roles = data.map(r => r.role as UserRole);
          setIsAdminOrSupervisor(roles.includes('admin') || roles.includes('supervisor'));
        }
        setLoadingUserRoles(false);
      };
      fetchUserRoles();
    } else {
      setIsAdminOrSupervisor(false);
      setLoadingUserRoles(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      const checkAdmin = async () => {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();
        setIsAdmin(!!data);
      };
      checkAdmin();
    } else {
      setIsAdmin(false);
    }
  }, [user]);

  if (loadingUserRoles) {
    return <div className="container mx-auto p-4">Loading access status...</div>;
  }

  if (!isAdminOrSupervisor) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-destructive">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You do not have permission to view this page. Admin or Supervisor role required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
      
      {isAdmin && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-card-foreground">Create New Employee</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateEmployeeForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-card-foreground">Manage Employees & Roles</CardTitle>
            </CardHeader>
            <CardContent>
              <EmployeeManagementTable />
            </CardContent>
          </Card>
        </>
      )}

      {/* ProjectCodeManagement already renders its own Card structure including title */}
      <ProjectCodeManagement />
    </div>
  );
};

export default AdminPage;

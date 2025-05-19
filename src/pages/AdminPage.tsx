
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Enums } from '@/integrations/supabase/types';
import CreateEmployeeForm from '@/components/admin/CreateEmployeeForm';
import EmployeeManagementTable from '@/components/admin/EmployeeManagementTable';
import { toast } from "sonner";

type UserRole = Enums<'app_role'>;

const AdminPage = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingUserRoles, setLoadingUserRoles] = useState(true);

  useEffect(() => {
    if (user) {
      const fetchUserRoles = async () => {
        setLoadingUserRoles(true);
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching user roles for admin check:', error);
          toast.error("Error checking admin privileges.");
        } else if (data) {
          const roles = data.map(r => r.role as UserRole);
          setIsAdmin(roles.includes('admin'));
        }
        setLoadingUserRoles(false);
      };
      fetchUserRoles();
    } else {
      setIsAdmin(false);
      setLoadingUserRoles(false);
    }
  }, [user]);

  if (loadingUserRoles) {
    return <div className="container mx-auto p-4">Loading admin status...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Admin Dashboard</h1>
      
      <div className="mb-8 p-6 bg-white shadow-lg rounded-lg">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Create New Employee</h2>
        <CreateEmployeeForm />
      </div>

      <div className="p-6 bg-white shadow-lg rounded-lg">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Manage Employees & Roles</h2>
        <EmployeeManagementTable />
      </div>
    </div>
  );
};

export default AdminPage;

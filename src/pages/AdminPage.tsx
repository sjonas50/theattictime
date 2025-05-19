
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Enums } from '@/integrations/supabase/types';
import CreateEmployeeForm from '@/components/admin/CreateEmployeeForm';
import EmployeeManagementTable from '@/components/admin/EmployeeManagementTable';
import ProjectCodeManagement from '@/components/admin/ProjectCodeManagement'; // Import the new component
import { toast } from "sonner";

type UserRole = Enums<'app_role'>;

const AdminPage = () => {
  const { user } = useAuth();
  const [isAdminOrSupervisor, setIsAdminOrSupervisor] = useState(false); // Changed for broader access
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
          console.error('Error fetching user roles:', error);
          toast.error("Error checking user privileges.");
        } else if (data) {
          const roles = data.map(r => r.role as UserRole);
          // Allow if user is 'admin' OR 'supervisor'
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

  if (loadingUserRoles) {
    return <div className="container mx-auto p-4">Loading access status...</div>;
  }

  // Updated access check
  if (!isAdminOrSupervisor) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p>You do not have permission to view this page. Admin or Supervisor role required.</p>
      </div>
    );
  }

  // Determine if the user is specifically an admin for certain sections
  // This check can be refined if supervisors should not see employee creation/management
  const [isAdmin, setIsAdmin] = useState(false);
   useEffect(() => {
    if (user) {
      const checkAdmin = async () => {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin') // Specifically check for admin
          .maybeSingle();
        setIsAdmin(!!data);
      };
      checkAdmin();
    }
   }, [user]);


  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Admin Dashboard</h1>
      
      {isAdmin && ( // Only show Employee sections to Admins
        <>
          <div className="mb-8 p-6 bg-white shadow-lg rounded-lg">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">Create New Employee</h2>
            <CreateEmployeeForm />
          </div>

          <div className="p-6 bg-white shadow-lg rounded-lg mb-8"> {/* Added mb-8 */}
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">Manage Employees & Roles</h2>
            <EmployeeManagementTable />
          </div>
        </>
      )}

      {/* Project Code Management for Admins and Supervisors */}
      <div className="p-6 bg-white shadow-lg rounded-lg">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Manage Project Codes</h2>
        <ProjectCodeManagement />
      </div>
    </div>
  );
};

export default AdminPage;

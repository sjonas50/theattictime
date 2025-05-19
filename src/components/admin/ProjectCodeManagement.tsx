
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import ProjectCodeForm, { ProjectCodeFormValues } from './ProjectCodeForm';
import ProjectCodeTable from './ProjectCodeTable';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

type ProjectCode = Tables<'project_codes'>;

const ProjectCodeManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const [editingProjectCode, setEditingProjectCode] = useState<ProjectCode | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<Record<string, boolean>>({});


  const { data: projectCodes, isLoading: isLoadingProjectCodes } = useQuery<ProjectCode[], Error>({
    queryKey: ['projectCodesAdmin'], // Use a different key from TimeEntriesPage to avoid conflicts if filters differ
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_codes')
        .select('*')
        .order('code', { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  const createProjectCodeMutation = useMutation<ProjectCode, Error, TablesInsert<'project_codes'>>({
    mutationFn: async (newProjectCode) => {
      const { data, error } = await supabase.from('project_codes').insert(newProjectCode).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectCodesAdmin'] });
      queryClient.invalidateQueries({ queryKey: ['projectCodes'] }); // Invalidate for TimeEntriesPage
      toast.success('Project code added successfully!');
      setEditingProjectCode(null); // Clear form for new entry
    },
    onError: (error) => {
      toast.error(`Failed to add project code: ${error.message}`);
    },
  });

  const updateProjectCodeMutation = useMutation<ProjectCode, Error, { id: string; updates: TablesUpdate<'project_codes'> }>({
    mutationFn: async ({ id, updates }) => {
      const { data, error } = await supabase.from('project_codes').update(updates).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projectCodesAdmin'] });
      queryClient.invalidateQueries({ queryKey: ['projectCodes'] }); // Invalidate for TimeEntriesPage
      toast.success(`Project code "${data.code}" updated successfully!`);
      setEditingProjectCode(null); // Clear form
    },
    onError: (error) => {
      toast.error(`Failed to update project code: ${error.message}`);
    },
    onSettled: (data) => {
      if (data?.id) {
        setIsUpdatingStatus(prev => ({...prev, [data.id]: false}));
      }
    }
  });
  
  // Delete mutation (optional, as deactivation is primary)
  // const deleteProjectCodeMutation = useMutation ...

  const handleFormSubmit = (values: ProjectCodeFormValues, currentProjectCodeId?: string) => {
    if (currentProjectCodeId) { // Editing existing
      const updates: TablesUpdate<'project_codes'> = {
        name: values.name,
        description: values.description,
        is_active: values.is_active,
        // code cannot be changed after creation
      };
      updateProjectCodeMutation.mutate({ id: currentProjectCodeId, updates });
    } else { // Creating new
      const newProjectCode: TablesInsert<'project_codes'> = {
        code: values.code,
        name: values.name,
        description: values.description,
        is_active: true, // New codes are active by default, form doesn't show toggle for new
      };
      createProjectCodeMutation.mutate(newProjectCode);
    }
  };

  const handleEditProjectCode = (projectCode: ProjectCode) => {
    setEditingProjectCode(projectCode);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleActive = (projectCodeId: string, isActive: boolean) => {
    setIsUpdatingStatus(prev => ({...prev, [projectCodeId]: true}));
    updateProjectCodeMutation.mutate({ id: projectCodeId, updates: { is_active: isActive } });
  };
  
  // const handleDeleteProjectCode = (projectCodeId: string) => { ... }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingProjectCode ? 'Edit Project Code' : 'Add New Project Code'}</CardTitle>
          <CardDescription>
            {editingProjectCode ? `Editing: ${editingProjectCode.code}` : 'Create a new project code for time tracking.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectCodeForm
            onSubmit={handleFormSubmit}
            initialData={editingProjectCode}
            isSubmitting={createProjectCodeMutation.isPending || updateProjectCodeMutation.isPending}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Project Codes</CardTitle>
          <CardDescription>View and manage project codes. Only active codes appear in time entry dropdowns.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingProjectCodes && <p>Loading project codes...</p>}
          {projectCodes && (
            <ProjectCodeTable
              projectCodes={projectCodes}
              onEdit={handleEditProjectCode}
              onToggleActive={handleToggleActive}
              onDelete={() => {}} // Add delete handler if implementing hard delete
              isUpdatingStatus={isUpdatingStatus}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectCodeManagement;

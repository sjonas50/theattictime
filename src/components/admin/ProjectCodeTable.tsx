
import React from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

type ProjectCode = Tables<'project_codes'>;

interface ProjectCodeTableProps {
  projectCodes: ProjectCode[];
  onEdit: (projectCode: ProjectCode) => void;
  onToggleActive: (projectCodeId: string, isActive: boolean) => void;
  onDelete: (projectCodeId: string) => void;
  isUpdatingStatus: Record<string, boolean>;
}

const ProjectCodeTable: React.FC<ProjectCodeTableProps> = ({ 
  projectCodes, 
  onEdit, 
  onToggleActive,
  onDelete,
  isUpdatingStatus 
}) => {
  if (!projectCodes || projectCodes.length === 0) {
    return <p className="text-muted-foreground">No project codes found. Add one using the form above.</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-center">Active</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projectCodes.map((pc) => (
            <TableRow key={pc.id}>
              <TableCell className="font-medium">{pc.code}</TableCell>
              <TableCell>{pc.name || '-'}</TableCell>
              <TableCell className="max-w-xs truncate">{pc.description || '-'}</TableCell>
              <TableCell className="text-center">
                <Switch
                  checked={pc.is_active}
                  onCheckedChange={(checked) => onToggleActive(pc.id, checked)}
                  disabled={isUpdatingStatus[pc.id]}
                  aria-label={pc.is_active ? 'Deactivate project code' : 'Activate project code'}
                />
              </TableCell>
              <TableCell>{format(new Date(pc.created_at), 'PPP')}</TableCell>
              <TableCell>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" onClick={() => onEdit(pc)}>
                    <Edit className="mr-1 h-4 w-4" /> Edit
                  </Button>
                  {/* <Button variant="destructive" size="sm" onClick={() => onDelete(pc.id)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button> */}
                  {/* Delete functionality can be added later if hard delete is needed, for now toggle active is primary */}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ProjectCodeTable;

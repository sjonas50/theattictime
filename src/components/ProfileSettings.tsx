import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function ProfileSettings() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchEmployeeData();
    }
  }, [user]);

  const fetchEmployeeData = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('employees')
        .select('id, name')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching employee data:', error);
        toast.error('Failed to load profile data');
        return;
      }

      if (data) {
        setEmployeeId(data.id);
        setName(data.name || '');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load profile data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!employeeId) {
      toast.error('Employee ID not found');
      return;
    }

    if (!name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }

    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('employees')
        .update({ name: name.trim() })
        .eq('id', employeeId);

      if (error) {
        console.error('Error updating name:', error);
        toast.error('Failed to update name');
        return;
      }

      toast.success('Name updated successfully!');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to update name');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!employeeId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No employee profile found. Please contact your administrator.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Display Name</Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={100}
          />
          <p className="text-xs text-muted-foreground">
            This name will be displayed in time entries and reports.
          </p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={isSaving || !name.trim()}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </CardContent>
    </Card>
  );
}

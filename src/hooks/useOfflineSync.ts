import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface OfflineTimeEntry {
  localId: string;
  employeeId: string;
  hoursWorked: number;
  entryDate: string;
  projectCode: string;
  notes?: string;
  createdAt: string;
}

export function useOfflineSync() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [pendingCount, setPendingCount] = useState(0);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncOfflineEntries();
    }
  }, [isOnline, pendingCount]);

  // Load pending count on mount
  useEffect(() => {
    loadPendingCount();
  }, []);

  const loadPendingCount = () => {
    try {
      const stored = localStorage.getItem('offline_time_entries');
      const entries: OfflineTimeEntry[] = stored ? JSON.parse(stored) : [];
      setPendingCount(entries.length);
    } catch (error) {
      console.error('Error loading pending count:', error);
    }
  };

  const saveOfflineEntry = async (entry: Omit<OfflineTimeEntry, 'localId' | 'createdAt'>) => {
    try {
      const offlineEntry: OfflineTimeEntry = {
        ...entry,
        localId: `offline_${Date.now()}_${Math.random()}`,
        createdAt: new Date().toISOString(),
      };

      const stored = localStorage.getItem('offline_time_entries');
      const entries: OfflineTimeEntry[] = stored ? JSON.parse(stored) : [];
      entries.push(offlineEntry);
      
      localStorage.setItem('offline_time_entries', JSON.stringify(entries));
      setPendingCount(entries.length);

      toast({
        title: "Saved offline",
        description: "Entry will sync when connection is restored.",
      });

      return offlineEntry.localId;
    } catch (error) {
      console.error('Error saving offline entry:', error);
      toast({
        title: "Error",
        description: "Failed to save entry offline.",
        variant: "destructive",
      });
      return null;
    }
  };

  const syncOfflineEntries = async () => {
    if (!user || syncStatus === 'syncing') return;

    setSyncStatus('syncing');
    
    try {
      const stored = localStorage.getItem('offline_time_entries');
      const entries: OfflineTimeEntry[] = stored ? JSON.parse(stored) : [];

      if (entries.length === 0) {
        setSyncStatus('idle');
        return;
      }

      const successfulSyncs: string[] = [];

      for (const entry of entries) {
        try {
          const { error } = await supabase
            .from('time_entries')
            .insert({
              employee_id: entry.employeeId,
              hours_worked: entry.hoursWorked,
              entry_date: entry.entryDate,
              project_code: entry.projectCode,
              notes: entry.notes,
              offline_created_at: entry.createdAt,
              local_id: entry.localId,
              sync_status: 'synced',
            });

          if (!error) {
            successfulSyncs.push(entry.localId);
          }
        } catch (entryError) {
          console.error('Error syncing entry:', entryError);
        }
      }

      // Remove successfully synced entries
      const remainingEntries = entries.filter(
        entry => !successfulSyncs.includes(entry.localId)
      );
      
      localStorage.setItem('offline_time_entries', JSON.stringify(remainingEntries));
      setPendingCount(remainingEntries.length);

      if (successfulSyncs.length > 0) {
        toast({
          title: "Sync complete",
          description: `${successfulSyncs.length} entries synced successfully.`,
        });
      }

      if (remainingEntries.length > 0) {
        toast({
          title: "Partial sync",
          description: `${remainingEntries.length} entries failed to sync.`,
          variant: "destructive",
        });
        setSyncStatus('error');
      } else {
        setSyncStatus('idle');
      }
    } catch (error) {
      console.error('Error during sync:', error);
      setSyncStatus('error');
      toast({
        title: "Sync failed",
        description: "Failed to sync offline entries.",
        variant: "destructive",
      });
    }
  };

  const clearOfflineEntries = () => {
    localStorage.removeItem('offline_time_entries');
    setPendingCount(0);
    setSyncStatus('idle');
  };

  const getOfflineEntries = (): OfflineTimeEntry[] => {
    try {
      const stored = localStorage.getItem('offline_time_entries');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading offline entries:', error);
      return [];
    }
  };

  return {
    isOnline,
    syncStatus,
    pendingCount,
    saveOfflineEntry,
    syncOfflineEntries,
    clearOfflineEntries,
    getOfflineEntries,
  };
}
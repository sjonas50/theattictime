import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NotificationPreferences {
  notification_enabled: boolean;
  daily_reminder_time: string;
  weekly_reminder_enabled: boolean;
  work_days: number[];
  timezone: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  // Request notification permission
  const requestPermission = async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        toast({
          title: "Notifications enabled",
          description: "You'll receive reminders to log your time.",
        });
      }
      
      return result;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  };

  // Load user preferences
  useEffect(() => {
    if (!user) return;

    const loadPreferences = async () => {
      try {
        const { data } = await supabase
          .from('user_preferences')
          .select('notification_enabled, daily_reminder_time, weekly_reminder_enabled, work_days, timezone')
          .eq('user_id', user.id)
          .single();

        if (data) {
          setPreferences(data);
        } else {
          // Create default preferences
          const defaultPrefs = {
            user_id: user.id,
            notification_enabled: true,
            daily_reminder_time: '17:00:00',
            weekly_reminder_enabled: true,
            work_days: [1, 2, 3, 4, 5],
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };

          const { data: newPrefs } = await supabase
            .from('user_preferences')
            .insert(defaultPrefs)
            .select('notification_enabled, daily_reminder_time, weekly_reminder_enabled, work_days, timezone')
            .single();

          if (newPrefs) {
            setPreferences(newPrefs);
          }
        }
      } catch (error) {
        console.error('Error loading notification preferences:', error);
      }
    };

    loadPreferences();
  }, [user]);

  // Check permission status
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Show notification
  const showNotification = (title: string, options?: NotificationOptions) => {
    if (permission === 'granted' && preferences?.notification_enabled) {
      new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options,
      });
    }
  };

  // Schedule daily reminder
  const scheduleDailyReminder = () => {
    if (!preferences?.notification_enabled || !preferences?.daily_reminder_time) return;

    const now = new Date();
    const today = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Check if today is a work day
    if (!preferences.work_days.includes(today === 0 ? 7 : today)) return;

    const [hours, minutes] = preferences.daily_reminder_time.split(':');
    const reminderTime = new Date();
    reminderTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    // If the time has passed today, schedule for tomorrow
    if (reminderTime <= now) {
      reminderTime.setDate(reminderTime.getDate() + 1);
    }

    const timeUntilReminder = reminderTime.getTime() - now.getTime();

    setTimeout(() => {
      showNotification('Time to log your hours!', {
        body: 'Don\'t forget to submit your timesheet for today.',
      });
    }, timeUntilReminder);
  };

  // Check for missing entries
  const checkMissingEntries = async () => {
    if (!user || !preferences?.notification_enabled) return;

    try {
      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!employee) return;

      // Check if user has logged time today
      const today = new Date().toISOString().split('T')[0];
      const { data: todayEntries } = await supabase
        .from('time_entries')
        .select('id')
        .eq('employee_id', employee.id)
        .eq('entry_date', today);

      if (!todayEntries?.length) {
        const now = new Date();
        const currentHour = now.getHours();
        
        // Only remind during work hours (9 AM - 6 PM)
        if (currentHour >= 9 && currentHour <= 18) {
          showNotification('Missing time entry', {
            body: 'You haven\'t logged any time for today yet.',
          });
        }
      }
    } catch (error) {
      console.error('Error checking missing entries:', error);
    }
  };

  // Update preferences
  const updatePreferences = async (newPrefs: Partial<NotificationPreferences>) => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('user_preferences')
        .update(newPrefs)
        .eq('user_id', user.id)
        .select('notification_enabled, daily_reminder_time, weekly_reminder_enabled, work_days, timezone')
        .single();

      if (data) {
        setPreferences(data);
        toast({
          title: "Preferences updated",
          description: "Your notification settings have been saved.",
        });
      }
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast({
        title: "Error",
        description: "Failed to update notification preferences.",
        variant: "destructive",
      });
    }
  };

  return {
    permission,
    preferences,
    requestPermission,
    showNotification,
    scheduleDailyReminder,
    checkMissingEntries,
    updatePreferences,
  };
}
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useNotifications } from '@/hooks/useNotifications';
import { Bell, BellOff, Clock, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function NotificationSettings() {
  const { 
    permission, 
    preferences, 
    requestPermission, 
    updatePreferences 
  } = useNotifications();
  const { toast } = useToast();

  const handlePermissionRequest = async () => {
    const result = await requestPermission();
    if (result === 'denied') {
      toast({
        title: "Notifications blocked",
        description: "Please enable notifications in your browser settings to receive reminders.",
        variant: "destructive",
      });
    }
  };

  const handlePreferenceChange = (key: string, value: any) => {
    if (!preferences) return;
    
    updatePreferences({
      [key]: value,
    });
  };

  const handleWorkDaysChange = (day: number, checked: boolean) => {
    if (!preferences) return;
    
    const newWorkDays = checked
      ? [...preferences.work_days, day].sort()
      : preferences.work_days.filter(d => d !== day);
    
    updatePreferences({
      work_days: newWorkDays,
    });
  };

  if (!preferences) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading notification settings...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Permission Status */}
        <div className="space-y-2">
          <Label className="text-base font-medium">Notification Permission</Label>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              {permission === 'granted' ? (
                <>
                  <Bell className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Notifications enabled</span>
                </>
              ) : (
                <>
                  <BellOff className="h-4 w-4 text-red-500" />
                  <span className="text-sm">
                    {permission === 'denied' ? 'Notifications blocked' : 'Permission not granted'}
                  </span>
                </>
              )}
            </div>
            {permission !== 'granted' && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePermissionRequest}
              >
                Enable Notifications
              </Button>
            )}
          </div>
        </div>

        {/* Main Settings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive reminders to log your time
              </p>
            </div>
            <Switch
              checked={preferences.notification_enabled}
              onCheckedChange={(checked) => 
                handlePreferenceChange('notification_enabled', checked)
              }
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Daily Reminder Time
            </Label>
            <Input
              type="time"
              value={preferences.daily_reminder_time}
              onChange={(e) => 
                handlePreferenceChange('daily_reminder_time', e.target.value)
              }
              disabled={!preferences.notification_enabled}
            />
            <p className="text-xs text-muted-foreground">
              When to remind you to log your time each day
            </p>
          </div>

          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select
              value={preferences.timezone}
              onValueChange={(value) => 
                handlePreferenceChange('timezone', value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Work Days
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`day-${day.value}`}
                    checked={preferences.work_days.includes(day.value)}
                    onCheckedChange={(checked) => 
                      handleWorkDaysChange(day.value, checked as boolean)
                    }
                    disabled={!preferences.notification_enabled}
                  />
                  <Label 
                    htmlFor={`day-${day.value}`}
                    className="text-sm font-normal"
                  >
                    {day.label}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Choose which days you want to receive reminders
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Weekly Summary</Label>
              <p className="text-sm text-muted-foreground">
                Get a weekly summary of your logged hours
              </p>
            </div>
            <Switch
              checked={preferences.weekly_reminder_enabled}
              onCheckedChange={(checked) => 
                handlePreferenceChange('weekly_reminder_enabled', checked)
              }
              disabled={!preferences.notification_enabled}
            />
          </div>
        </div>

        {permission === 'denied' && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <strong>Note:</strong> Notifications are blocked in your browser. 
              To receive reminders, please enable notifications for this site in your browser settings.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
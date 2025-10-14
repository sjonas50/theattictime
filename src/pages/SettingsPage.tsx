import React from 'react';
import { NotificationSettings } from '@/components/NotificationSettings';
import { ProfileSettings } from '@/components/ProfileSettings';

export default function SettingsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <ProfileSettings />
      <NotificationSettings />
    </div>
  );
}
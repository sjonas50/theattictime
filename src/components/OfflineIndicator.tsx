import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';

export function OfflineIndicator() {
  const { isOnline, syncStatus, pendingCount, syncOfflineEntries } = useOfflineSync();

  if (isOnline && pendingCount === 0) {
    return null; // No indicator needed when online with no pending entries
  }

  const getStatusInfo = () => {
    if (!isOnline) {
      return {
        icon: WifiOff,
        label: 'Offline',
        color: 'bg-amber-500',
        description: 'Changes saved locally',
      };
    }

    if (syncStatus === 'syncing') {
      return {
        icon: RefreshCw,
        label: 'Syncing...',
        color: 'bg-blue-500',
        description: `Syncing ${pendingCount} entries`,
      };
    }

    if (syncStatus === 'error') {
      return {
        icon: AlertCircle,
        label: 'Sync Failed',
        color: 'bg-red-500',
        description: `${pendingCount} entries failed to sync`,
      };
    }

    return {
      icon: Wifi,
      label: 'Online',
      color: 'bg-green-500',
      description: pendingCount > 0 ? `${pendingCount} entries pending sync` : 'All synced',
    };
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Status Badge */}
      <Badge 
        variant="secondary" 
        className={`text-white ${statusInfo.color} flex items-center gap-2 px-3 py-1`}
      >
        <StatusIcon 
          className={`h-4 w-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} 
        />
        <span className="font-medium">{statusInfo.label}</span>
        {pendingCount > 0 && (
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
            {pendingCount}
          </span>
        )}
      </Badge>

      {/* Sync Button */}
      {isOnline && pendingCount > 0 && syncStatus !== 'syncing' && (
        <Button
          variant="secondary"
          size="sm"
          onClick={syncOfflineEntries}
          className="h-8 px-3 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry Sync
        </Button>
      )}

      {/* Status Description */}
      <div className="text-xs text-muted-foreground text-right max-w-[200px]">
        {statusInfo.description}
      </div>
    </div>
  );
}
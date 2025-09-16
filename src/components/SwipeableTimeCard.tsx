import React, { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit3, Trash2, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';

interface TimeEntry {
  id: string;
  hours_worked: number;
  entry_date: string;
  project_code: string;
  notes?: string;
  is_finalized: boolean;
  approved_at?: string;
  rejected_at?: string;
  sync_status?: 'synced' | 'pending' | 'failed';
}

interface SwipeableTimeCardProps {
  entry: TimeEntry;
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (id: string) => void;
  onSubmit?: (id: string) => void;
  className?: string;
}

export function SwipeableTimeCard({ 
  entry, 
  onEdit, 
  onDelete, 
  onSubmit,
  className = ""
}: SwipeableTimeCardProps) {
  const isMobile = useIsMobile();
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwipeActive, setIsSwipeActive] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);

  const getStatusInfo = () => {
    if (entry.approved_at) {
      return { label: 'Approved', color: 'bg-green-500', icon: CheckCircle };
    }
    if (entry.rejected_at) {
      return { label: 'Rejected', color: 'bg-red-500', icon: XCircle };
    }
    if (entry.is_finalized) {
      return { label: 'Submitted', color: 'bg-amber-500', icon: Send };
    }
    return { label: 'Draft', color: 'bg-gray-500', icon: Clock };
  };

  const getSyncStatusInfo = () => {
    if (entry.sync_status === 'pending') {
      return { label: 'Syncing...', color: 'bg-blue-500' };
    }
    if (entry.sync_status === 'failed') {
      return { label: 'Sync Failed', color: 'bg-red-500' };
    }
    return null;
  };

  // Touch event handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    startX.current = e.touches[0].clientX;
    setIsSwipeActive(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !isSwipeActive) return;
    
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    
    // Only allow left swipe (negative values) and limit the distance
    const newOffset = Math.max(Math.min(diff, 0), -120);
    setSwipeOffset(newOffset);
  };

  const handleTouchEnd = () => {
    if (!isMobile) return;
    
    setIsSwipeActive(false);
    
    // Snap to position based on swipe distance
    if (swipeOffset < -60) {
      setSwipeOffset(-120); // Show actions
    } else {
      setSwipeOffset(0); // Hide actions
    }
  };

  const statusInfo = getStatusInfo();
  const syncInfo = getSyncStatusInfo();
  const StatusIcon = statusInfo.icon;

  const actionButtons = (
    <div className="flex gap-2">
      {!entry.is_finalized && onEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(entry)}
          className="h-8 w-8 p-0"
        >
          <Edit3 className="h-4 w-4" />
        </Button>
      )}
      {!entry.is_finalized && onSubmit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSubmit(entry.id)}
          className="h-8 w-8 p-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}
      {!entry.is_finalized && onDelete && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(entry.id)}
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Main card */}
      <Card
        className={`transition-transform duration-200 ease-out ${isMobile ? 'touch-pan-y' : ''}`}
        style={{
          transform: isMobile ? `translateX(${swipeOffset}px)` : 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {entry.project_code}
              </Badge>
              <Badge 
                variant="secondary" 
                className={`text-white text-xs ${statusInfo.color}`}
              >
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusInfo.label}
              </Badge>
              {syncInfo && (
                <Badge 
                  variant="secondary"
                  className={`text-white text-xs ${syncInfo.color}`}
                >
                  {syncInfo.label}
                </Badge>
              )}
            </div>
            {!isMobile && actionButtons}
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-semibold">
              {entry.hours_worked}h
            </span>
            <span className="text-sm text-muted-foreground">
              {format(new Date(entry.entry_date), 'MMM d, yyyy')}
            </span>
          </div>
          
          {entry.notes && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {entry.notes}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Swipe action panel (mobile only) */}
      {isMobile && (
        <div 
          className="absolute right-0 top-0 h-full w-32 bg-muted/50 flex items-center justify-center gap-2 px-2"
          style={{
            transform: `translateX(${120 + swipeOffset}px)`,
          }}
        >
          {actionButtons}
        </div>
      )}
    </div>
  );
}
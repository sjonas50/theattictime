-- Update default channel ID to the correct one
ALTER TABLE slack_daily_standup_messages 
ALTER COLUMN slack_channel_id SET DEFAULT 'C06HAQ1SPDF';
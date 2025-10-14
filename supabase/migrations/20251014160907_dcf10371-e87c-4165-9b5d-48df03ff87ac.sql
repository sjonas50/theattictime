-- Add column to track Slack message timestamps for updates (only if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'time_entries' AND column_name = 'slack_message_ts'
  ) THEN
    ALTER TABLE time_entries ADD COLUMN slack_message_ts text;
  END IF;
END $$;

-- Create a table to store Slack message mappings (employee + date -> message_ts)
CREATE TABLE IF NOT EXISTS slack_daily_standup_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  slack_message_ts text NOT NULL,
  slack_channel_id text NOT NULL DEFAULT 'C08680D2ND2',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(employee_id, entry_date)
);

-- Enable RLS
ALTER TABLE slack_daily_standup_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can manage slack messages" ON slack_daily_standup_messages;
DROP POLICY IF EXISTS "Employees can view their own slack messages" ON slack_daily_standup_messages;

-- RLS Policies
CREATE POLICY "Admins can manage slack messages"
  ON slack_daily_standup_messages
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Employees can view their own slack messages"
  ON slack_daily_standup_messages
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = slack_daily_standup_messages.employee_id
    AND e.user_id = auth.uid()
  ));

-- Create trigger function to notify edge function
CREATE OR REPLACE FUNCTION notify_slack_standup()
RETURNS trigger AS $$
BEGIN
  -- Call edge function for insert/update/delete
  PERFORM net.http_post(
    url := 'https://mpbwlrpzltkhagzgkbxn.supabase.co/functions/v1/slack-daily-standup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wYndscnB6bHRraGFnemdrYnhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NzY3MTMsImV4cCI6MjA2MzI1MjcxM30.3xWeOMYMG-loMSUSEtlRHkST1kQcDJuqQZo-jpwUnfs'
    ),
    body := jsonb_build_object(
      'event', TG_OP,
      'employee_id', COALESCE(NEW.employee_id, OLD.employee_id),
      'entry_date', COALESCE(NEW.entry_date, OLD.entry_date),
      'time_entry_id', COALESCE(NEW.id, OLD.id)
    )
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS slack_standup_on_submit ON time_entries;
DROP TRIGGER IF EXISTS slack_standup_on_update ON time_entries;
DROP TRIGGER IF EXISTS slack_standup_on_delete ON time_entries;

-- Create triggers for time entry changes (only when finalized)
CREATE TRIGGER slack_standup_on_submit
  AFTER UPDATE OF is_finalized ON time_entries
  FOR EACH ROW
  WHEN (NEW.is_finalized = true AND OLD.is_finalized = false)
  EXECUTE FUNCTION notify_slack_standup();

CREATE TRIGGER slack_standup_on_update
  AFTER UPDATE ON time_entries
  FOR EACH ROW
  WHEN (NEW.is_finalized = true AND OLD.is_finalized = true)
  EXECUTE FUNCTION notify_slack_standup();

CREATE TRIGGER slack_standup_on_delete
  AFTER DELETE ON time_entries
  FOR EACH ROW
  WHEN (OLD.is_finalized = true)
  EXECUTE FUNCTION notify_slack_standup();
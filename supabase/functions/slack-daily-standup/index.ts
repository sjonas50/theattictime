import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TimeEntry {
  id: string;
  employee_id: string;
  entry_date: string;
  hours_worked: number;
  project_code: string;
  notes: string | null;
  is_finalized: boolean;
}

interface Employee {
  id: string;
  name: string;
  user_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { event, employee_id, entry_date, time_entry_id } = await req.json();

    console.log('Slack standup event:', { event, employee_id, entry_date, time_entry_id });

    // Get employee info
    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('id, name, user_id')
      .eq('id', employee_id)
      .single();

    if (!employee) {
      console.error('Employee not found:', employee_id);
      return new Response(JSON.stringify({ error: 'Employee not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all finalized entries for this employee on this date
    const { data: entries } = await supabaseAdmin
      .from('time_entries')
      .select('*')
      .eq('employee_id', employee_id)
      .eq('entry_date', entry_date)
      .eq('is_finalized', true)
      .order('created_at', { ascending: true });

    console.log('Found entries:', entries?.length || 0);

    // Check if we have an existing Slack message for this employee+date
    const { data: existingMessage } = await supabaseAdmin
      .from('slack_daily_standup_messages')
      .select('*')
      .eq('employee_id', employee_id)
      .eq('entry_date', entry_date)
      .single();

    const messageText = formatSlackMessage(employee.name, entry_date, entries || []);

    if (event === 'DELETE' || !entries || entries.length === 0) {
      // Delete the Slack message if no entries remain
      if (existingMessage?.slack_message_ts) {
        await deleteSlackMessage(existingMessage.slack_channel_id, existingMessage.slack_message_ts);
        await supabaseAdmin
          .from('slack_daily_standup_messages')
          .delete()
          .eq('id', existingMessage.id);
      }
    } else if (existingMessage?.slack_message_ts) {
      // Update existing message
      await updateSlackMessage(
        existingMessage.slack_channel_id,
        existingMessage.slack_message_ts,
        messageText
      );
    } else {
    // Post new message
      const messageTs = await postSlackMessage('C06HAQ1SPDF', messageText);
      
      // Store the message timestamp
      if (messageTs) {
        await supabaseAdmin
          .from('slack_daily_standup_messages')
          .insert({
            employee_id,
            entry_date,
            slack_message_ts: messageTs,
            slack_channel_id: 'C06HAQ1SPDF',
          });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in slack-daily-standup:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function formatSlackMessage(employeeName: string, date: string, entries: TimeEntry[]): string {
  const totalHours = entries.reduce((sum, e) => sum + Number(e.hours_worked), 0);
  
  let message = `*${employeeName}* - ${date} (${totalHours}h total)\n`;
  
  entries.forEach(entry => {
    const notes = entry.notes ? ` - ${entry.notes}` : '';
    message += `• ${entry.project_code}: ${entry.hours_worked}h${notes}\n`;
  });
  
  return message;
}

async function postSlackMessage(channel: string, text: string): Promise<string | null> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const result = await response.json();
  
  if (!result.ok) {
    console.error('Slack API error:', result);
    throw new Error(result.error || 'Failed to post message');
  }

  console.log('Posted Slack message:', result.ts);
  return result.ts;
}

async function updateSlackMessage(channel: string, ts: string, text: string): Promise<void> {
  const response = await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      ts,
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const result = await response.json();
  
  if (!result.ok) {
    console.error('Slack API error:', result);
    throw new Error(result.error || 'Failed to update message');
  }

  console.log('Updated Slack message:', ts);
}

async function deleteSlackMessage(channel: string, ts: string): Promise<void> {
  const response = await fetch('https://slack.com/api/chat.delete', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      ts,
    }),
  });

  const result = await response.json();
  
  if (!result.ok) {
    console.error('Slack API error:', result);
    throw new Error(result.error || 'Failed to delete message');
  }

  console.log('Deleted Slack message:', ts);
}

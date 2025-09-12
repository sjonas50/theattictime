import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log("Voice Transcription Edge Function initializing");

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audioData, employeeId, duration } = await req.json();
    
    console.log("Received transcription request:", { employeeId, duration });

    if (!audioData || !employeeId) {
      return new Response(JSON.stringify({ error: 'Missing audioData or employeeId' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl!, serviceRoleKey!);

    // Create voice report record
    console.log("Creating voice report record");
    const { data: voiceReport, error: reportError } = await supabase
      .from('voice_reports')
      .insert({
        employee_id: employeeId,
        audio_duration_seconds: duration,
        status: 'processing'
      })
      .select()
      .single();

    if (reportError) {
      console.error('Error creating voice report:', reportError);
      throw new Error(`Failed to create voice report: ${reportError.message}`);
    }

    console.log("Voice report created:", voiceReport.id);

    try {
      // Convert base64 audio to binary
      const binaryAudio = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
      
      // Prepare form data for OpenAI Whisper
      const formData = new FormData();
      const blob = new Blob([binaryAudio], { type: 'audio/webm' });
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'json');

      console.log("Sending audio to OpenAI Whisper");
      
      // Send to OpenAI Whisper
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const transcriptionResult = await response.json();
      console.log("Transcription completed:", transcriptionResult.text.substring(0, 100) + "...");

      // Update voice report with transcription
      const { error: updateError } = await supabase
        .from('voice_reports')
        .update({
          transcription: transcriptionResult.text,
          status: 'completed'
        })
        .eq('id', voiceReport.id);

      if (updateError) {
        console.error('Error updating voice report:', updateError);
        throw new Error(`Failed to update voice report: ${updateError.message}`);
      }

      return new Response(JSON.stringify({ 
        voiceReportId: voiceReport.id,
        transcription: transcriptionResult.text 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (transcriptionError) {
      console.error('Transcription error:', transcriptionError);
      
      // Update voice report status to failed
      await supabase
        .from('voice_reports')
        .update({ status: 'failed' })
        .eq('id', voiceReport.id);

      throw transcriptionError;
    }

  } catch (error) {
    console.error('Error in voice transcription function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
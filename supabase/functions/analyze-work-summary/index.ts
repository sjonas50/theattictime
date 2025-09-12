import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log("Analyze Work Summary Edge Function initializing");

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { voiceReportId, transcription } = await req.json();
    
    console.log("Received analysis request for voice report:", voiceReportId);

    if (!voiceReportId || !transcription) {
      return new Response(JSON.stringify({ error: 'Missing voiceReportId or transcription' }), {
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

    // Fetch available project codes
    console.log("Fetching available project codes");
    const { data: projectCodes, error: codesError } = await supabase
      .from('project_codes')
      .select('code, name, description')
      .eq('is_active', true);

    if (codesError) {
      console.error('Error fetching project codes:', codesError);
      throw new Error(`Failed to fetch project codes: ${codesError.message}`);
    }

    const projectCodesText = projectCodes.map(pc => 
      `${pc.code}${pc.name ? ` - ${pc.name}` : ''}${pc.description ? ` (${pc.description})` : ''}`
    ).join('\n');

    // Prepare AI prompt
    const systemPrompt = `You are a time tracking assistant that analyzes daily work summaries and extracts structured time entries.

Available Project Codes:
${projectCodesText}

Your task is to analyze the work summary and extract time entries with the following information:
- project_code: Match activities to the most appropriate project code from the list above
- hours_worked: Extract or estimate time spent (in decimal hours, e.g., 1.5 for 1 hour 30 minutes)
- entry_date: Use today's date if not specified (format: YYYY-MM-DD)
- notes: Brief description of the work done
- confidence: Your confidence level in the extraction (0-1)

Rules:
1. Only use project codes from the provided list
2. If you can't match an activity to a project code, use "UNKNOWN" as the project_code
3. Break down the summary into separate entries for different projects/activities
4. Be conservative with time estimates - better to underestimate than overestimate
5. If total time seems unrealistic (>8 hours for a day), proportionally reduce all entries

Respond with valid JSON in this exact format:
{
  "entries": [
    {
      "project_code": "PROJECT_CODE",
      "hours_worked": 2.5,
      "entry_date": "2024-01-15",
      "notes": "Brief description of work",
      "confidence": 0.8
    }
  ],
  "summary": "Brief summary of the analysis",
  "total_hours": 2.5
}`;

    const userPrompt = `Analyze this work summary and extract time entries:

"${transcription}"

Today's date: ${new Date().toISOString().split('T')[0]}`;

    console.log("Sending to OpenAI for analysis");

    // Send to OpenAI for analysis
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const aiResult = await response.json();
    const analysisContent = aiResult.choices[0].message.content;
    
    console.log("AI analysis completed");

    let analysisData;
    try {
      analysisData = JSON.parse(analysisContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', analysisContent);
      throw new Error('Failed to parse AI analysis response');
    }

    // Update voice report with AI analysis
    const { error: updateError } = await supabase
      .from('voice_reports')
      .update({
        ai_analysis: analysisData
      })
      .eq('id', voiceReportId);

    if (updateError) {
      console.error('Error updating voice report with analysis:', updateError);
      throw new Error(`Failed to update voice report: ${updateError.message}`);
    }

    console.log("Analysis saved successfully");

    return new Response(JSON.stringify({ 
      voiceReportId,
      analysis: analysisData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze work summary function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
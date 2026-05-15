import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const appOrigin = req.headers.get('origin') || 'https://theattictime.lovable.app';
    const passwordSetupRedirectTo = `${appOrigin}/auth?setup=true`;

    // Caller must be admin
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userRes.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // Look up target user's email
    const { data: targetUser, error: getErr } = await admin.auth.admin.getUserById(userId);
    if (getErr || !targetUser?.user?.email) {
      return new Response(JSON.stringify({ error: 'Target user not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const email = targetUser.user.email;

    // If user already confirmed, send a password recovery (so they can set password).
    // Otherwise re-send the invite.
    const isConfirmed = !!targetUser.user.email_confirmed_at || !!targetUser.user.confirmed_at;

    if (isConfirmed) {
      const { error } = await admin.auth.resetPasswordForEmail(email, {
        redirectTo: passwordSetupRedirectTo,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ message: `Password setup email sent to ${email}.` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: passwordSetupRedirectTo,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ message: `Invitation re-sent to ${email}.` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
  } catch (err: any) {
    console.error('resend-employee-invite error:', err.message);
    return new Response(JSON.stringify({ error: err.message ?? 'Unexpected error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

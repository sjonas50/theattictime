import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const hashSetupToken = async (token: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(hash));
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, token, password } = await req.json();

    if (!userId || !token || !password) {
      return new Response(JSON.stringify({ error: 'Missing setup link details or password.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters long.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: getUserError } = await admin.auth.admin.getUserById(userId);

    if (getUserError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'This setup link is invalid or expired.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const metadata = userData.user.user_metadata ?? {};
    const expectedTokenHash = metadata.employee_setup_token_hash;
    const expiresAt = metadata.employee_setup_token_expires_at;
    const suppliedTokenHash = await hashSetupToken(token);

    if (!expectedTokenHash || expectedTokenHash !== suppliedTokenHash || !expiresAt || Date.parse(expiresAt) < Date.now()) {
      return new Response(JSON.stringify({ error: 'This setup link is invalid or expired. Please ask an admin for a new setup link.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: {
        ...metadata,
        employee_setup_token_hash: null,
        employee_setup_token_expires_at: null,
        employee_password_setup_completed_at: new Date().toISOString(),
      },
    });

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ message: 'Password created successfully. Please sign in.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error('complete-employee-setup error:', err.message);
    return new Response(JSON.stringify({ error: err.message ?? 'Unexpected error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

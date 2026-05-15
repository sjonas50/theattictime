import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'npm:resend@3.5.0';
import { corsHeaders } from '../_shared/cors.ts';

const SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const createSetupToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

const hashSetupToken = async (token: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(hash));
};

const sendSetupEmail = async (email: string, setupLink: string) => {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) throw new Error('Email service is not configured.');

  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: 'The Attic Time <steve@theattic.ai>',
    to: [email],
    subject: 'Set up your The Attic Time password',
    html: `
      <p>Use this secure link to set your The Attic Time password:</p>
      <p><a href="${setupLink}">Create your password</a></p>
      <p>This link expires in 7 days.</p>
    `,
  });

  if (error) throw new Error(error.message ?? 'Failed to send setup email.');
};

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

    const token = createSetupToken();
    const tokenHash = await hashSetupToken(token);
    const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_MS).toISOString();

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
      user_metadata: {
        ...(targetUser.user.user_metadata ?? {}),
        employee_setup_token_hash: tokenHash,
        employee_setup_token_expires_at: expiresAt,
      },
    });
    if (updateError) throw updateError;

    const setupLink = `${appOrigin}/auth?setup_user=${encodeURIComponent(userId)}&setup_token=${encodeURIComponent(token)}`;
    await sendSetupEmail(targetUser.user.email, setupLink);

    return new Response(JSON.stringify({
      message: `Setup link sent to ${targetUser.user.email}. It was also copied so you can send it manually if needed.`,
      setupLink,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error('resend-employee-invite error:', err.message);
    return new Response(JSON.stringify({ error: err.message ?? 'Unexpected error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

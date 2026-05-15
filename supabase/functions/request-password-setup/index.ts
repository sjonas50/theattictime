import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'npm:resend@3.5.0';
import { corsHeaders } from '../_shared/cors.ts';

const SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_DOMAINS = ['theattic.ai'];

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

const findUserByEmail = async (admin: any, email: string) => {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = data.users.find((candidate: any) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < perPage) return null;
    page += 1;
  }
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
      <p>This link expires in 7 days. If you did not request it, you can ignore this email.</p>
    `,
  });

  if (error) throw new Error(error.message ?? 'Failed to send setup email.');
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const emailDomain = normalizedEmail.split('@')[1];

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return new Response(JSON.stringify({ error: 'Please enter a valid email address.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (!ALLOWED_DOMAINS.includes(emailDomain)) {
      return new Response(JSON.stringify({ error: 'Password setup is only available for @theattic.ai email addresses.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Server configuration error.');

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const user = await findUserByEmail(admin, normalizedEmail);

    if (user) {
      const token = createSetupToken();
      const tokenHash = await hashSetupToken(token);
      const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_MS).toISOString();

      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        email_confirm: true,
        user_metadata: {
          ...(user.user_metadata ?? {}),
          employee_setup_token_hash: tokenHash,
          employee_setup_token_expires_at: expiresAt,
        },
      });
      if (updateError) throw updateError;

      const appOrigin = req.headers.get('origin') || 'https://theattictime.lovable.app';
      const setupLink = `${appOrigin}/auth?setup_user=${encodeURIComponent(user.id)}&setup_token=${encodeURIComponent(token)}`;
      await sendSetupEmail(normalizedEmail, setupLink);
    }

    return new Response(JSON.stringify({ message: 'If an account exists for this email, a setup link has been sent.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error('request-password-setup error:', err.message);
    return new Response(JSON.stringify({ error: err.message ?? 'Unexpected error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
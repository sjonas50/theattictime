import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@3.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SignupRequest {
  email: string;
  password: string;
}

const ALLOWED_DOMAINS = ['theattic.ai'];
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
    html: `<p>Use this secure link to set your password:</p><p><a href="${setupLink}">Create your password</a></p><p>This link expires in 7 days.</p>`,
  });

  if (error) throw new Error(error.message ?? 'Failed to send setup email.');
};

const createPasswordSetupLink = async (supabaseAdmin: any, userId: string, appOrigin: string) => {
  const token = createSetupToken();
  const tokenHash = await hashSetupToken(token);
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_MS).toISOString();

  const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (getUserError || !userData?.user) throw new Error(getUserError?.message ?? 'Unable to load user.');

  const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email_confirm: true,
    user_metadata: {
      ...(userData.user.user_metadata ?? {}),
      employee_setup_token_hash: tokenHash,
      employee_setup_token_expires_at: expiresAt,
    },
  });

  if (updateUserError) throw new Error(`Failed to prepare setup link: ${updateUserError.message}`);

  return `${appOrigin}/auth?setup_user=${encodeURIComponent(userId)}&setup_token=${encodeURIComponent(token)}`;
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password }: SignupRequest = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Check if email domain is allowed
    const emailDomain = email.split('@')[1]?.toLowerCase();
    
    if (!ALLOWED_DOMAINS.includes(emailDomain)) {
      return new Response(
        JSON.stringify({ 
          error: `Sign up is restricted to @${ALLOWED_DOMAINS.join(', @')} email addresses only` 
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Initialize Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Attempting to create user for email:', email);

    // Create the user directly - Supabase will handle the duplicate check
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for domain-restricted signups
    });

    if (error) {
      console.error('Error creating user:', error);
      
      // Handle the specific case of user already existing
      if ((error as any).code === 'email_exists' || error.message.includes('already been registered')) {
        try {
          const appOrigin = req.headers.get('origin') || 'https://theattictime.lovable.app';
          const setupLink = await createPasswordSetupLink(supabaseAdmin, (error as any).user_id ?? '', appOrigin);
          await sendSetupEmail(email, setupLink);

          return new Response(
            JSON.stringify({
              message: 'An account already exists. A password reset link has been sent to your email if it is valid.'
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            }
          );
        } catch (existingUserError) {
          console.error('Error while handling existing user case:', existingUserError);
          return new Response(
            JSON.stringify({
              error: 'Account exists. Please use "Forgot password" to reset your password.'
            }),
            {
              status: 409,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            }
          );
        }
      }
      
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    console.log('User created successfully:', data.user?.email);

    // Create employee record for the new user
    const employeeName = email.split('@')[0]; // Use email prefix as default name
    const { data: employeeData, error: employeeError } = await supabaseAdmin
      .from('employees')
      .insert({
        user_id: data.user!.id,
        name: employeeName,
        employee_id_internal: `EMP-${Date.now()}` // Generate a simple employee ID
      })
      .select()
      .single();

    if (employeeError) {
      console.error('Error creating employee record:', employeeError);
      // Try to cleanup the auth user if employee creation fails
      await supabaseAdmin.auth.admin.deleteUser(data.user!.id);
      return new Response(
        JSON.stringify({ error: 'Failed to create employee record' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Assign default 'employee' role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: data.user!.id,
        role: 'employee'
      });

    if (roleError) {
      console.error('Error assigning employee role:', roleError);
      // Note: We don't rollback here as the user and employee are created
      // An admin can manually assign roles later
    }

    console.log('Employee record created:', employeeData.name);

    return new Response(
      JSON.stringify({ 
        message: 'User and employee record created successfully',
        user: { id: data.user?.id, email: data.user?.email },
        employee: { id: employeeData.id, name: employeeData.name }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in restricted-signup function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);
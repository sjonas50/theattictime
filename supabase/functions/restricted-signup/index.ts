import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SignupRequest {
  email: string;
  password: string;
}

const ALLOWED_DOMAINS = ['theattic.ai'];

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
          // Use the configured site URL for redirect
          const redirectTo = 'https://theattictime.lovable.app/auth?reset=true';
          const supabasePublic = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? ''
          );

          const { error: resetError } = await supabasePublic.auth.resetPasswordForEmail(email, {
            redirectTo: redirectTo,
          });

          if (resetError) {
            console.error('Failed to send password reset email:', resetError);
            return new Response(
              JSON.stringify({
                error: 'An account already exists for this email. Please use "Forgot password" to reset your password.'
              }),
              {
                status: 409, // Conflict status code
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              }
            );
          }

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
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

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000 // Should be enough for most cases
    });

    const userExists = existingUser.users.find(user => user.email === email);

    if (userExists) {
      return new Response(
        JSON.stringify({ 
          error: 'A user with this email address has already been registered. Please sign in instead.' 
        }),
        {
          status: 409, // Conflict status code
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Create the user
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for domain-restricted signups
    });

    if (error) {
      console.error('Error creating user:', error);
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
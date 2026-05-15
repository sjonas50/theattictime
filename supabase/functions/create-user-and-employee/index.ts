import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log("Create User and Employee Edge Function initializing");

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

const createPasswordSetupLink = async (supabaseAdmin: any, userId: string, appOrigin: string) => {
  const token = createSetupToken();
  const tokenHash = await hashSetupToken(token);
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_MS).toISOString();

  const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (getUserError || !userData?.user) {
    throw new Error(getUserError?.message ?? 'Unable to load user for setup link.');
  }

  const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email_confirm: true,
    user_metadata: {
      ...(userData.user.user_metadata ?? {}),
      employee_setup_token_hash: tokenHash,
      employee_setup_token_expires_at: expiresAt,
    },
  });

  if (updateUserError) {
    throw new Error(`Failed to prepare setup link: ${updateUserError.message}`);
  }

  return `${appOrigin}/auth?setup_user=${encodeURIComponent(userId)}&setup_token=${encodeURIComponent(token)}`;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, name, employeeIdInternal } = body;

    console.log("Received request to create user and employee (invitation flow):", { email, name, employeeIdInternal });

    if (!email || !name || !employeeIdInternal) {
      console.log("Missing required fields");
      return new Response(JSON.stringify({ error: 'Missing required fields: email, name, and employeeIdInternal are required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Supabase URL or Service Role Key is not configured in environment variables.');
      return new Response(JSON.stringify({ error: 'Server configuration error.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const appOrigin = req.headers.get('origin') || 'https://theattictime.lovable.app';

    // Check if user already exists
    console.log(`Checking if user already exists for email: ${email}`);
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers.users.find(user => user.email === email);

    let newUserId: string;
    let userWasCreated = false;

    if (existingUser) {
      // User exists — check if they already have an employee record
      const { data: existingEmployee } = await supabaseAdmin
        .from('employees')
        .select('id')
        .eq('user_id', existingUser.id)
        .maybeSingle();

      if (existingEmployee) {
        console.log(`User and employee record already exist for: ${email}`);
        return new Response(JSON.stringify({
          error: 'A user with this email already exists and is already set up as an employee.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409,
        });
      }

      console.log(`User exists but has no employee record — creating employee for existing user: ${existingUser.id}`);
      newUserId = existingUser.id;
    } else {
      console.log(`Attempting to create auth user for: ${email}`);
      const { data: authUserResponse, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
      });

      if (authError) {
        console.error('Error creating auth user:', authError.message);
        return new Response(JSON.stringify({ error: `Failed to create auth user: ${authError.message}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      newUserId = authUserResponse.user.id;
      userWasCreated = true;
      console.log(`Auth user created successfully: ${newUserId} for email: ${email}`);
    }

    console.log(`Attempting to create employee record for user ID: ${newUserId}`);
    const { data: employeeData, error: employeeError } = await supabaseAdmin
      .from('employees')
      .insert({
        user_id: newUserId,
        name: name,
        employee_id_internal: employeeIdInternal,
      })
      .select()
      .single();

    if (employeeError) {
      console.error('Error creating employee record:', employeeError.message);
      if (userWasCreated) {
        console.log(`Attempting to roll back auth user creation for ID: ${newUserId}`);
        const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(newUserId);
        if (deleteUserError) {
          console.error('Failed to roll back auth user:', deleteUserError.message);
        } else {
          console.log('Rolled back auth user creation successfully.');
        }
      }
      return new Response(JSON.stringify({ error: `Failed to create employee record: ${employeeError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    console.log(`Employee record created successfully for user ID: ${newUserId}`, employeeData);

    const setupLink = await createPasswordSetupLink(supabaseAdmin, newUserId, appOrigin);

    console.log(`Attempting to assign 'employee' role to user ID: ${newUserId}`);
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: newUserId, role: 'employee' });

    if (roleError) {
      console.warn(`User and employee created for ${email}, but failed to assign default 'employee' role: ${roleError.message}`);
    } else {
      console.log(`Successfully assigned 'employee' role to user ID: ${newUserId}`);
    }
    
    return new Response(JSON.stringify({ 
      message: 'Employee account created successfully. Share the setup link with the employee so they can create their password.', 
      employee: employeeData,
      userId: newUserId,
      setupLink,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201,
    });

  } catch (error) {
    console.error('Unhandled error in create-user-and-employee function:', error.message, error.stack);
    return new Response(JSON.stringify({ error: 'An unexpected error occurred.', details: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

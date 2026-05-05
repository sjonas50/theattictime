import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log("Create User and Employee Edge Function initializing");

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
      console.log(`Attempting to create auth user (invitation flow) for: ${email}`);
      const { data: authUserResponse, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
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
      console.log(`Auth user created successfully (invitation sent): ${newUserId} for email: ${email}`);
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
      message: 'Employee invited and user account created successfully. Role assignment attempted. User will receive an invitation email.', 
      employee: employeeData,
      userId: newUserId
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

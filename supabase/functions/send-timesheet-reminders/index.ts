
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.44.4"; // Ensure version is compatible or just @supabase/supabase-js
import { Resend } from "npm:resend@3.5.0"; // Use a recent version of Resend

// Initialize Resend client
const resendApiKey = Deno.env.get("RESEND_API_KEY");
if (!resendApiKey) {
  console.error("RESEND_API_KEY is not set.");
  // Optionally, throw an error or handle it gracefully
}
const resend = new Resend(resendApiKey);

// Initialize Supabase admin client
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Supabase URL or Service Role Key is not set.");
  // Optionally, throw an error or handle it gracefully
}

const supabaseAdmin: SupabaseClient = createClient(supabaseUrl!, supabaseServiceRoleKey!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("send-timesheet-reminders function invoked.");

  try {
    // 1. Fetch all employees from the 'employees' table
    const { data: employees, error: employeesError } = await supabaseAdmin
      .from("employees")
      .select("id, name, user_id");

    if (employeesError) {
      console.error("Error fetching employees:", employeesError);
      return new Response(JSON.stringify({ error: `Failed to fetch employees: ${employeesError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!employees || employees.length === 0) {
      console.log("No employees found to send reminders to.");
      return new Response(JSON.stringify({ message: "No employees found." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${employees.length} employees. Processing reminders...`);
    const emailPromises = [];

    for (const employee of employees) {
      // 2. Get user email using user_id
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(employee.user_id);

      if (userError) {
        console.error(`Error fetching user ${employee.user_id}:`, userError.message);
        continue; // Skip this employee
      }

      if (!userData || !userData.user || !userData.user.email) {
        console.warn(`No email found for user ${employee.user_id}. Skipping.`);
        continue;
      }

      const employeeEmail = userData.user.email;
      const employeeName = employee.name || "Valued Employee";

      console.log(`Preparing to send email to ${employeeName} (${employeeEmail})`);

      // 3. Send email using Resend
      emailPromises.push(
        resend.emails.send({
          from: "Timesheet System <onboarding@resend.dev>", // Replace with your desired sender email
          to: [employeeEmail],
          subject: "Friendly Reminder: Please Submit Your Timesheet",
          html: `
            <p>Hi ${employeeName},</p>
            <p>This is a friendly reminder to please submit your timesheet for the week.</p>
            <p>Ensuring your timesheet is up-to-date helps us with accurate project tracking and payroll processing.</p>
            <p>If you've already submitted it, thank you!</p>
            <br>
            <p>Best regards,</p>
            <p>The Team</p>
          `,
        }).then(response => {
          if (response.error) {
            console.error(`Failed to send email to ${employeeEmail}:`, response.error);
          } else {
            console.log(`Email sent successfully to ${employeeEmail}, ID: ${response.data?.id}`);
          }
          return response;
        })
      );
    }

    await Promise.allSettled(emailPromises);
    console.log("All reminder emails processed.");

    return new Response(JSON.stringify({ message: "Timesheet reminders processed successfully." }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in send-timesheet-reminders function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

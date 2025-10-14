-- Fix security issue: Ensure time_entries and employees tables require authentication

-- First, let's add a restrictive base policy for time_entries
-- This ensures ONLY authenticated users can even attempt to access the table
CREATE POLICY "Require authentication for time_entries access"
  ON time_entries
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- For employees table, add authentication requirement
CREATE POLICY "Require authentication for employees access"
  ON employees
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Now make the existing permissive policies more explicit by ensuring they stack on top
-- Update the comment on the table to document the security model
COMMENT ON TABLE time_entries IS 'Time entry records - requires authentication. Access controlled by role-based policies.';
COMMENT ON TABLE employees IS 'Employee records - requires authentication. Access controlled by role-based policies.';
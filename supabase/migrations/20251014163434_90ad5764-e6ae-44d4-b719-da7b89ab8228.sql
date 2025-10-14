-- Fix public exposure of project_codes table
-- Add authentication requirement to the SELECT policy

-- Drop the existing policy that allows unauthenticated access
DROP POLICY IF EXISTS "Allow authenticated users to read active project codes" ON public.project_codes;

-- Create a new policy that properly requires authentication
CREATE POLICY "Authenticated users can read active project codes"
ON public.project_codes
FOR SELECT
TO authenticated
USING (is_active = true AND auth.uid() IS NOT NULL);

-- Also add a general authentication requirement policy
CREATE POLICY "Require authentication for project codes access"
ON public.project_codes
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Add documentation
COMMENT ON TABLE public.project_codes IS 'Project codes for time tracking. All access requires authentication to prevent public exposure of business operations.';
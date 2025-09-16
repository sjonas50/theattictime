-- First, let's properly drop the existing policies and recreate them
DROP POLICY "Admins can insert user roles" ON public.user_roles;

-- Create a new policy that avoids the circular dependency
CREATE POLICY "Admins can insert user roles" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (
  -- Direct check without using has_role function to avoid recursion
  EXISTS (
    SELECT 1 
    FROM public.user_roles existing_roles 
    WHERE existing_roles.user_id = auth.uid() 
    AND existing_roles.role = 'admin'
  )
  OR
  -- Allow if no admins exist yet (bootstrap case)
  NOT EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE role = 'admin'
  )
);
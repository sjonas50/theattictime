-- Drop the problematic policy if it exists
DROP POLICY IF EXISTS "Allow initial admin role creation" ON public.user_roles;

-- Create a simplified policy that allows admins to insert roles
-- This replaces the problematic recursive policy
CREATE POLICY "Admins can insert user roles" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (
  -- Check if the current user already has an admin role (avoids recursion)
  EXISTS (
    SELECT 1 
    FROM public.user_roles existing_roles 
    WHERE existing_roles.user_id = auth.uid() 
    AND existing_roles.role = 'admin'
  )
);

-- Also allow inserting the first admin role if no admins exist yet
CREATE POLICY "Allow bootstrap admin creation" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (
  -- Allow admin role creation if no admins exist yet
  (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') = 0
);
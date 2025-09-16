-- Drop the existing problematic policies
DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;

-- Create a better policy that allows admins to insert roles
-- but avoids the circular dependency issue
CREATE POLICY "Admins can insert user roles" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (
  -- Allow if the user already has admin role (direct check to avoid recursion)
  EXISTS (
    SELECT 1 
    FROM public.user_roles existing_roles 
    WHERE existing_roles.user_id = auth.uid() 
    AND existing_roles.role = 'admin'
  )
);

-- Also allow users to insert their first admin role if they're the first user
-- (for initial setup scenarios)
CREATE POLICY "Allow initial admin role creation" 
ON public.user_roles 
FOR INSERT 
TO authenticated
WITH CHECK (
  -- Allow if there are no existing admin users in the system
  NOT EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE role = 'admin'
  )
  AND NEW.role = 'admin'
);
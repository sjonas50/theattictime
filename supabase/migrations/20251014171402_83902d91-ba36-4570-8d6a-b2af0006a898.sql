-- Allow employees to update their own name
CREATE POLICY "Employees can update their own name"
ON public.employees
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

COMMENT ON POLICY "Employees can update their own name" ON public.employees IS 'Allows employees to edit their own name in the system';
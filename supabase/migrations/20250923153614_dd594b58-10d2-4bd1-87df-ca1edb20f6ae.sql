DO $$
BEGIN
  CREATE POLICY "Employees can submit their own entries"
  ON public.time_entries
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = time_entries.employee_id
        AND e.user_id = auth.uid()
    )
    AND is_finalized = false
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = time_entries.employee_id
        AND e.user_id = auth.uid()
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

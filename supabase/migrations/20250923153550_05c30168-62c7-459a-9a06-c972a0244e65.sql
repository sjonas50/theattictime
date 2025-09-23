-- Allow employees to submit their own time entries by setting is_finalized = true
-- Existing policy requires is_finalized = false in WITH CHECK, which blocks submission
-- This new policy permits the update when the user owns the entry and the current row is a draft

CREATE POLICY IF NOT EXISTS "Employees can submit their own entries"
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

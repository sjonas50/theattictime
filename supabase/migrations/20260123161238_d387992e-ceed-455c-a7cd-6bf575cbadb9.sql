-- Fix employees RLS: convert to PERMISSIVE policies so any-one match grants access
-- Drop all existing restrictive policies on employees
DROP POLICY IF EXISTS "Admins can manage all employee records" ON public.employees;
DROP POLICY IF EXISTS "Admins can manage employee records" ON public.employees;
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Employees can update their own name" ON public.employees;
DROP POLICY IF EXISTS "Employees can view their own record" ON public.employees;
DROP POLICY IF EXISTS "Require authentication for employees access" ON public.employees;
DROP POLICY IF EXISTS "Supervisors can view all employee records" ON public.employees;
DROP POLICY IF EXISTS "supervisor_view_all_employee_records" ON public.employees;

-- Recreate policies as PERMISSIVE (default) for correct OR-logic
-- 1. Admins can do everything
CREATE POLICY "Admins manage employees"
  ON public.employees
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 2. Supervisors can read all employees (needed to join for their team's time entries)
CREATE POLICY "Supervisors read employees"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'supervisor'));

-- 3. Any employee can read their own row
CREATE POLICY "Employees read own record"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 4. Any employee can update their own row (e.g. name)
CREATE POLICY "Employees update own record"
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
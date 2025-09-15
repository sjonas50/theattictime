-- Create employee records for existing auth users who don't have employee records
INSERT INTO public.employees (user_id, name, employee_id_internal)
SELECT 
  auth.users.id,
  COALESCE(auth.users.raw_user_meta_data->>'name', split_part(auth.users.email, '@', 1)) as name,
  'EMP-' || extract(epoch from auth.users.created_at)::bigint as employee_id_internal
FROM auth.users
LEFT JOIN public.employees ON auth.users.id = employees.user_id
WHERE employees.id IS NULL;

-- Assign default 'employee' role to users who don't have any roles
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT
  auth.users.id,
  'employee'::app_role
FROM auth.users
LEFT JOIN public.user_roles ON auth.users.id = user_roles.user_id
WHERE user_roles.id IS NULL;
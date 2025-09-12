-- Update supervisor relationships
-- Let's set Steve Admin as supervisor for the other employees since he's the admin
UPDATE employees 
SET supervisor_id = (
  SELECT id FROM employees WHERE employee_id_internal = 'ADMIN001'
)
WHERE employee_id_internal IN ('EMP001', 'EMP003', 'EMP004');
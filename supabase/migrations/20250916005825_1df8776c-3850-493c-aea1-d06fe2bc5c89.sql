-- Clean up conflicting RLS policies on time_entries table

-- Drop the overly broad supervisor policies that allow ALL supervisors to see ALL entries
DROP POLICY IF EXISTS "Supervisors can view all time entries" ON time_entries;
DROP POLICY IF EXISTS "Supervisors can approve or reject entries" ON time_entries;
DROP POLICY IF EXISTS "Supervisors can approve/reject time entries" ON time_entries;

-- Drop duplicate employee policies (keep the most specific ones)
DROP POLICY IF EXISTS "Employees can manage their own time entries" ON time_entries;
DROP POLICY IF EXISTS "Employees can view their own submitted entries" ON time_entries;

-- Keep these policies as they are correct:
-- "Admins can manage all time entries" - Admins can see everything
-- "Admins can view all time entries" - Duplicate but harmless
-- "Employees can manage their own draft entries" - Employees can only edit non-finalized entries
-- "Employees can manage their own non-finalized time entries" - Similar to above
-- "Employees can view their own finalized time entries" - Employees can view their own entries
-- "Supervisor can read team time entries" - Supervisors can only see their team's entries
-- "Supervisor can update team time entries" - Supervisors can update their team's entries
-- "supervisor_manage_all_submitted_entries" - Supervisors can manage submitted entries

-- Ensure the correct team-based supervisor policies are working
-- The existing "Supervisor can read team time entries" and "Supervisor can update team time entries" 
-- policies are correct and properly restrict supervisors to only their team's entries
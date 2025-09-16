-- First, let's find the user ID for steve@theattic.ai
DO $$
DECLARE
    steve_user_id UUID;
BEGIN
    -- Get the user ID for steve@theattic.ai
    SELECT id INTO steve_user_id 
    FROM auth.users 
    WHERE email = 'steve@theattic.ai';
    
    IF steve_user_id IS NOT NULL THEN
        -- Add admin role
        INSERT INTO public.user_roles (user_id, role) 
        VALUES (steve_user_id, 'admin'::app_role)
        ON CONFLICT (user_id, role) DO NOTHING;
        
        -- Add supervisor role
        INSERT INTO public.user_roles (user_id, role) 
        VALUES (steve_user_id, 'supervisor'::app_role)
        ON CONFLICT (user_id, role) DO NOTHING;
        
        -- Add employee role
        INSERT INTO public.user_roles (user_id, role) 
        VALUES (steve_user_id, 'employee'::app_role)
        ON CONFLICT (user_id, role) DO NOTHING;
        
        -- Create employee record if it doesn't exist
        INSERT INTO public.employees (user_id, name, employee_id_internal)
        VALUES (steve_user_id, 'Steve Admin', 'STEVE001')
        ON CONFLICT (user_id) DO UPDATE SET
            name = EXCLUDED.name,
            employee_id_internal = EXCLUDED.employee_id_internal;
            
        RAISE NOTICE 'Successfully set up steve@theattic.ai with all roles and employee record';
    ELSE
        RAISE NOTICE 'User steve@theattic.ai not found in auth.users table';
    END IF;
END $$;
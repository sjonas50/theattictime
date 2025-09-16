-- Grant admin and supervisor roles to steve@theattic.ai
INSERT INTO user_roles (user_id, role) VALUES 
('8ffdd7d2-41ad-4a2b-b8ef-559cc2d68165', 'admin'),
('8ffdd7d2-41ad-4a2b-b8ef-559cc2d68165', 'supervisor')
ON CONFLICT (user_id, role) DO NOTHING;
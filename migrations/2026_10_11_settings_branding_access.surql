-- Grant settings.branding to every user_role that already has the settings
-- parent module so existing venues can save a login brand logo without
-- editing roles by hand. array::union keeps the update idempotent.

UPDATE user_role SET roles = array::union(roles ?? [], ['settings.branding'])
WHERE 'settings' IN roles;

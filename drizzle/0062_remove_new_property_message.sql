-- The ready made message "A new apartment is released" is no longer offered.
-- Campaigns already written from it keep their own words.
DELETE FROM "email_templates" WHERE "key" = 'new_property';

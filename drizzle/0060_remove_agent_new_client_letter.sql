-- The letter telling an agent that their potential client became a client is no longer sent.
-- What it already sent stays in the history.
DELETE FROM "email_templates" WHERE "key" = 'agent_new_client';

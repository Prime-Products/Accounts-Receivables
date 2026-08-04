-- Certificate expiry reminders (Prime 247).
-- Equipment certificates expire annually; the contract requires the customer to be
-- warned 60 and 15 days before expiry. Reminders are surfaced as rows in the existing
-- task list, so `tasks.type` needs a dedicated value.
ALTER TABLE tasks MODIFY COLUMN type enum(
  'Follow-up +2','Follow-up +15','Follow-up +20 SOA','Escalation +30',
  'Contract Expiry','Certificate Expiry','Manual','Help'
) NOT NULL;


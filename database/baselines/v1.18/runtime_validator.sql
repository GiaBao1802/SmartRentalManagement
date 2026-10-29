-- Read-only V1.18 candidate runtime checks. Exact structure is checked by expected-catalog.json.
SELECT
  (SELECT count(*) = 58 FROM pg_tables WHERE schemaname='public') AS table_count,
  NOT EXISTS (
    SELECT 1 FROM accounts WHERE NOT (
      (role='admin' AND owner_id IS NOT NULL AND resident_id IS NULL) OR
      (role='resident' AND owner_id IS NULL AND resident_id IS NOT NULL) OR
      (role='superadmin' AND owner_id IS NULL AND resident_id IS NULL)
    )
  ) AS account_role_scope,
  NOT EXISTS (
    SELECT 1 FROM accounts WHERE email IS NOT NULL GROUP BY lower(trim(email)) HAVING count(*)>1
  ) AS account_email_unique,
  NOT EXISTS (
    SELECT 1 FROM owners WHERE contact_email IS NOT NULL GROUP BY lower(trim(contact_email)) HAVING count(*)>1
  ) AS owner_email_unique,
  NOT EXISTS (
    SELECT 1 FROM owners o JOIN accounts a ON lower(trim(o.contact_email))=lower(trim(a.email))
    WHERE a.owner_id IS DISTINCT FROM o.owner_id
  ) AS owner_account_scope,
  NOT EXISTS (
    SELECT 1 FROM properties WHERE public_report_code IS NULL
  ) AS report_codes_present,
  NOT EXISTS (
    SELECT 1 FROM properties GROUP BY public_report_code HAVING count(*)>1
  ) AS report_codes_unique,
  NOT EXISTS (
    SELECT 1 FROM owner_account_invitations WHERE delivery_status NOT IN ('demo_not_sent','unknown')
  ) AS invitation_delivery_state,
  NOT EXISTS (
    SELECT 1 FROM owner_password_resets WHERE delivery_status NOT IN ('demo_not_sent','unknown')
  ) AS reset_delivery_state;

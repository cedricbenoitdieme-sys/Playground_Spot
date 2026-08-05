SELECT
  n.nspname AS schema,
  p.proname AS name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  (d.objid IS NOT NULL) AS is_extension_owned
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
WHERE n.nspname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg WHERE cfg LIKE 'search_path=%'
  )
ORDER BY is_extension_owned, p.proname;

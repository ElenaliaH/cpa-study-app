BEGIN;
SET LOCAL lock_timeout = '10s';
CREATE SCHEMA release_backup_20260914;
REVOKE ALL ON SCHEMA release_backup_20260914 FROM PUBLIC, anon, authenticated;
DO $backup$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN SHARE MODE',t.tablename);
    EXECUTE format('CREATE TABLE release_backup_20260914.%I AS TABLE public.%I',t.tablename,t.tablename);
    EXECUTE format('REVOKE ALL ON release_backup_20260914.%I FROM PUBLIC,anon,authenticated',t.tablename);
  END LOOP;
END $backup$;
CREATE TABLE release_backup_20260914.schema_catalog AS
SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'ddl',pg_get_functiondef(p.oid),'acl',p.proacl)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'),
 'columns',(SELECT jsonb_agg(to_jsonb(c)) FROM information_schema.columns c WHERE table_schema='public'),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',conname,'ddl',pg_get_constraintdef(c.oid))) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),
 'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public'),
 'grants',(SELECT jsonb_agg(to_jsonb(g)) FROM information_schema.role_table_grants g WHERE table_schema='public'),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'ddl',pg_get_triggerdef(t.oid))) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
 'indexes',(SELECT jsonb_agg(to_jsonb(i)) FROM pg_indexes i WHERE schemaname='public'),
 'backed_up_at',now()
) AS snapshot;
REVOKE ALL ON ALL TABLES IN SCHEMA release_backup_20260914 FROM PUBLIC,anon,authenticated;
COMMIT;

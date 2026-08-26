-- Remove legacy/default anonymous EXECUTE grants from existing tax-practice RPCs.

REVOKE ALL ON FUNCTION public.record_tax_answer(uuid, text, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tax_answer(uuid, text, jsonb, integer) FROM anon;
REVOKE ALL ON FUNCTION public.consume_tax_ai_quota(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_tax_ai_quota(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.update_tax_question_preferences(text, boolean, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tax_question_preferences(text, boolean, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.record_tax_ai_usage(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tax_ai_usage(integer, integer) FROM anon;

GRANT EXECUTE ON FUNCTION public.record_tax_answer(uuid, text, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_tax_ai_quota(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tax_question_preferences(text, boolean, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_tax_ai_usage(integer, integer) TO authenticated;

-- Explicitly remove legacy/default anonymous EXECUTE grants from subjective RPCs.

REVOKE ALL ON FUNCTION public.record_tax_subjective_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tax_subjective_review(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_tax_session_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_tax_session_counts(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.save_tax_subjective_answer(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_tax_subjective_answer(uuid, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.record_tax_subjective_review(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_tax_session_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_tax_subjective_answer(uuid, text, text) TO authenticated;

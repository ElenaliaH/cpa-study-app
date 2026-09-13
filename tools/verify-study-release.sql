BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.study_workspaces ORDER BY created_at LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE w public.study_workspaces; tw public.study_workspaces; q public.tax_questions; s uuid; r record; j jsonb; bank text; denied boolean;
BEGIN
 SELECT * INTO w FROM public.initialize_study_workspaces() WHERE exam_type='cpa' AND year=2026;
 IF w.id IS NULL THEN RAISE EXCEPTION 'CPA workspace missing'; END IF;
 SELECT public.save_study_workspace(w.id,w.revision,w.data,'release-rollback-check') INTO j;
 IF (j->>'conflict')::boolean THEN RAISE EXCEPTION 'Save failed'; END IF;
 SELECT public.save_study_workspace(w.id,w.revision,w.data,'release-stale-check') INTO j;
 IF NOT (j->>'conflict')::boolean THEN RAISE EXCEPTION 'Conflict protection failed'; END IF;
 SELECT * INTO tw FROM public.create_study_workspace('tax_advisor',2099,'{"subjects":[],"focus_sessions":[]}');
 FOREACH bank IN ARRAY ARRAY['tax-advisor-tax-law-i-550-2026','tax-advisor-tax-law-ii-550-2026'] LOOP
   SELECT * INTO q FROM public.tax_questions WHERE bank_id=bank AND is_published ORDER BY sequence_no LIMIT 1;
   IF q.id IS NULL THEN RAISE EXCEPTION 'Published bank inaccessible'; END IF;
   INSERT INTO public.tax_practice_sessions(user_id,workspace_id,bank_id,chapter_id,mode,question_ids)
     VALUES(auth.uid(),tw.id,bank,q.chapter_id,'sequential',ARRAY[q.id]) RETURNING id INTO s;
   SELECT * INTO r FROM public.record_tax_answer(s,q.id,q.correct_answer,30);
   IF NOT r.is_correct THEN RAISE EXCEPTION 'Grading failed'; END IF;
   PERFORM public.update_study_question_preferences(tw.id,q.id,true,'release rollback check',false);
   IF NOT EXISTS(SELECT 1 FROM public.tax_question_user_state WHERE workspace_id=tw.id AND question_id=q.id AND correct_count=1 AND is_favorite AND note='release rollback check') THEN RAISE EXCEPTION 'State persistence failed'; END IF;
   denied:=false;
   BEGIN
     PERFORM public.update_study_question_preferences(w.id,q.id,true,NULL,false);
   EXCEPTION WHEN OTHERS THEN denied:=true;
   END;
   IF NOT denied THEN RAISE EXCEPTION 'Cross-exam access allowed'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
 IF EXISTS(SELECT 1 FROM public.study_workspaces) THEN RAISE EXCEPTION 'Cross-account data visible'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT true AS authenticated_read_write_grading_conflict_and_isolation_passed;

-- Review and validate in an isolated database before production cutover.
BEGIN;
LOCK TABLE public.user_app_data IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.study_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_type text NOT NULL CHECK (exam_type IN ('cpa', 'tax_advisor')),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  data jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object'),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  last_write_id text,
  migrated_from_legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exam_type, year),
  UNIQUE (id, user_id)
);
ALTER TABLE public.study_workspaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_workspaces FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.study_workspaces TO authenticated;
CREATE POLICY study_workspaces_select_own ON public.study_workspaces FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- Copy verbatim. Original JSON, subject IDs, check-ins and focus IDs stay intact.
INSERT INTO public.study_workspaces (user_id, exam_type, year, data, migrated_from_legacy)
SELECT u.id, 'cpa', 2026, COALESCE(d.data, '{"examDate":"","subjects":[],"manualTasks":[],"mistakes":[],"focus_sessions":[],"schemaVersion":2}'::jsonb), true
FROM auth.users u LEFT JOIN public.user_app_data d ON d.user_id = u.id;

CREATE FUNCTION public.initialize_study_workspaces()
RETURNS SETOF public.study_workspaces LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.study_workspaces (user_id, exam_type, year, data, migrated_from_legacy)
  VALUES (auth.uid(), 'cpa', 2026, '{"examDate":"","subjects":[],"manualTasks":[],"mistakes":[],"focus_sessions":[],"schemaVersion":2}', true)
  ON CONFLICT (user_id, exam_type, year) DO NOTHING;
  RETURN QUERY SELECT * FROM public.study_workspaces WHERE user_id = auth.uid() ORDER BY exam_type, year;
END;
$$;

CREATE FUNCTION public.create_study_workspace(p_exam_type text, p_year integer, p_data jsonb)
RETURNS public.study_workspaces LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.study_workspaces;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'subjects') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid workspace data'; END IF;
  INSERT INTO public.study_workspaces (user_id, exam_type, year, data) VALUES (auth.uid(), p_exam_type, p_year, p_data) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE FUNCTION public.save_study_workspace(p_workspace_id uuid, p_revision bigint, p_data jsonb, p_write_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.study_workspaces;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM public.study_workspaces WHERE id = p_workspace_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found'; END IF;
  IF p_write_id IS NULL OR length(p_write_id) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid write ID'; END IF;
  IF p_revision IS NULL OR p_revision < 0 THEN RAISE EXCEPTION 'Expected revision is required'; END IF;
  IF v_row.last_write_id = p_write_id THEN RETURN jsonb_build_object('conflict', false, 'row', to_jsonb(v_row)); END IF;
  IF v_row.revision <> p_revision OR v_row.status <> 'active' THEN RETURN jsonb_build_object('conflict', true, 'row', to_jsonb(v_row)); END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'subjects') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid workspace data'; END IF;
  UPDATE public.study_workspaces SET data = p_data, revision = revision + 1, last_write_id = p_write_id, updated_at = now()
  WHERE id = p_workspace_id RETURNING * INTO v_row;
  RETURN jsonb_build_object('conflict', false, 'row', to_jsonb(v_row));
END;
$$;

CREATE FUNCTION public.set_study_workspace_status(p_workspace_id uuid, p_revision bigint, p_status text)
RETURNS public.study_workspaces LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.study_workspaces;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.study_workspaces SET status = p_status, revision = revision + 1, updated_at = now()
  WHERE id = p_workspace_id AND user_id = auth.uid() AND revision = p_revision RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace changed; refresh before archiving'; END IF;
  RETURN v_row;
END;
$$;

-- A stale frontend must not keep writing the old snapshot after cutover.
CREATE FUNCTION public.reject_legacy_study_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Study data has moved to workspaces. Refresh the application before saving.';
END;
$$;
CREATE TRIGGER legacy_study_cutover BEFORE INSERT OR UPDATE OR DELETE ON public.user_app_data FOR EACH ROW EXECUTE FUNCTION public.reject_legacy_study_write();

REVOKE ALL ON FUNCTION public.initialize_study_workspaces() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_study_workspace(text, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_study_workspace(uuid, bigint, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_study_workspace_status(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_legacy_study_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_study_workspaces(), public.create_study_workspace(text, integer, jsonb), public.save_study_workspace(uuid, bigint, jsonb, text), public.set_study_workspace_status(uuid, bigint, text) TO authenticated;

CREATE TABLE public.practice_banks (
  id text PRIMARY KEY,
  exam_type text NOT NULL CHECK (exam_type IN ('cpa', 'tax_advisor')),
  subject text NOT NULL,
  subject_code text NOT NULL,
  edition_year integer NOT NULL CHECK (edition_year BETWEEN 2000 AND 2100),
  title text NOT NULL,
  source_versions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_bank_exam_subject CHECK (
    (exam_type = 'cpa' AND subject_code IN ('accounting', 'audit', 'financial_management', 'tax_law', 'economic_law', 'strategy')) OR
    (exam_type = 'tax_advisor' AND subject_code IN ('tax_law_i', 'tax_law_ii', 'tax_practice', 'tax_related_law', 'finance_accounting'))
  )
);
ALTER TABLE public.practice_banks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practice_banks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.practice_banks TO authenticated;
CREATE POLICY practice_banks_published ON public.practice_banks FOR SELECT TO authenticated USING (status IN ('published', 'archived'));
INSERT INTO public.practice_banks (id, exam_type, subject, subject_code, edition_year, title, source_versions, status)
VALUES ('cpa-tax-2026-wang', 'cpa', '税法', 'tax_law', 2026, '王亭喜核心母题', ARRAY['wang-tingxi-word-v2-complete-20260826', 'wang-tingxi-word-v2-subjective-table-20260826'], 'published');

ALTER TABLE public.tax_chapters ADD COLUMN bank_id text NOT NULL DEFAULT 'cpa-tax-2026-wang' REFERENCES public.practice_banks(id);
ALTER TABLE public.tax_questions ADD COLUMN bank_id text NOT NULL DEFAULT 'cpa-tax-2026-wang' REFERENCES public.practice_banks(id);
ALTER TABLE public.tax_chapters ALTER COLUMN bank_id DROP DEFAULT;
ALTER TABLE public.tax_questions ALTER COLUMN bank_id DROP DEFAULT;
ALTER TABLE public.tax_chapters DROP CONSTRAINT tax_chapters_order_no_key;
ALTER TABLE public.tax_chapters ADD UNIQUE (bank_id, order_no);
ALTER TABLE public.tax_chapters ADD UNIQUE (id, bank_id);
ALTER TABLE public.tax_questions ADD FOREIGN KEY (chapter_id, bank_id) REFERENCES public.tax_chapters(id, bank_id);
ALTER TABLE public.tax_questions DROP CONSTRAINT tax_questions_content_hash_key;
ALTER TABLE public.tax_questions ADD UNIQUE (bank_id, content_hash);
CREATE INDEX tax_questions_bank_idx ON public.tax_questions(bank_id, chapter_id, sequence_no);

-- All existing personal practice history belongs to its owner's original CPA year.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tax_practice_sessions','tax_question_attempts','tax_question_user_state','tax_subjective_reviews','tax_subjective_attempts','tax_ai_threads','tax_ai_messages'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN workspace_id uuid', t);
    EXECUTE format('UPDATE public.%I p SET workspace_id = w.id FROM public.study_workspaces w WHERE w.user_id = p.user_id AND w.exam_type = ''cpa'' AND w.year = 2026', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD FOREIGN KEY (workspace_id, user_id) REFERENCES public.study_workspaces(id, user_id)', t);
    EXECUTE format('CREATE INDEX %I ON public.%I(workspace_id, user_id)', t || '_workspace_idx', t);
  END LOOP;
END;
$$;
ALTER TABLE public.tax_question_user_state DROP CONSTRAINT tax_question_user_state_pkey;
ALTER TABLE public.tax_question_user_state ADD PRIMARY KEY (user_id, workspace_id, question_id);
ALTER TABLE public.tax_practice_sessions ADD COLUMN bank_id text NOT NULL DEFAULT 'cpa-tax-2026-wang' REFERENCES public.practice_banks(id);
ALTER TABLE public.tax_practice_sessions ALTER COLUMN bank_id DROP DEFAULT;

CREATE FUNCTION public.assert_study_question(p_workspace_id uuid, p_question_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.study_workspaces w JOIN public.practice_banks b ON b.exam_type = w.exam_type
    JOIN public.tax_questions q ON q.bank_id = b.id
    WHERE w.id = p_workspace_id AND w.user_id = auth.uid() AND w.status = 'active'
      AND q.id = p_question_id AND q.is_published AND b.status = 'published'
  ) THEN RAISE EXCEPTION 'Workspace or question unavailable'; END IF;
END;
$$;

-- Also runs for SECURITY DEFINER RPC writes. Never trust a caller's user/workspace association.
CREATE FUNCTION public.guard_study_practice_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid; v_user uuid; v_question text; v_bank text; v_ids text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF TG_TABLE_NAME = 'tax_practice_sessions' THEN
    IF TG_OP = 'UPDATE' AND (NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.bank_id IS DISTINCT FROM OLD.bank_id) THEN RAISE EXCEPTION 'Practice scope is immutable'; END IF;
    IF NEW.user_id <> auth.uid() OR NOT EXISTS (SELECT 1 FROM public.study_workspaces w JOIN public.practice_banks b ON b.exam_type = w.exam_type WHERE w.id = NEW.workspace_id AND w.user_id = auth.uid() AND w.status = 'active' AND b.id = NEW.bank_id AND b.status = 'published') THEN RAISE EXCEPTION 'Workspace or bank unavailable'; END IF;
    IF NEW.chapter_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tax_chapters c WHERE c.id = NEW.chapter_id AND c.bank_id = NEW.bank_id) THEN RAISE EXCEPTION 'Chapter belongs to another bank'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(NEW.question_ids) qid WHERE NOT EXISTS (SELECT 1 FROM public.tax_questions q WHERE q.id = qid AND q.bank_id = NEW.bank_id AND q.is_published AND (NEW.chapter_id IS NULL OR q.chapter_id = NEW.chapter_id))) THEN RAISE EXCEPTION 'Question belongs to another bank or chapter'; END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'tax_ai_messages' THEN
    SELECT t.workspace_id, t.user_id, t.question_id INTO v_workspace, v_user, v_question FROM public.tax_ai_threads t WHERE t.id = NEW.thread_id;
  ELSIF TG_TABLE_NAME IN ('tax_question_attempts', 'tax_subjective_reviews', 'tax_subjective_attempts') THEN
    SELECT s.workspace_id, s.user_id, s.bank_id, s.question_ids INTO v_workspace, v_user, v_bank, v_ids FROM public.tax_practice_sessions s WHERE s.id = NEW.session_id;
    v_question := NEW.question_id;
    IF NOT COALESCE(v_question = ANY(v_ids), false) OR NOT EXISTS (SELECT 1 FROM public.tax_questions q WHERE q.id = v_question AND q.bank_id = v_bank) THEN RAISE EXCEPTION 'Question is not in this session'; END IF;
  ELSE
    v_workspace := NEW.workspace_id; v_user := NEW.user_id; v_question := NEW.question_id;
  END IF;
  IF v_workspace IS NULL OR v_user IS DISTINCT FROM auth.uid() OR NEW.user_id IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Practice owner mismatch'; END IF;
  IF NEW.workspace_id IS NOT NULL AND NEW.workspace_id <> v_workspace THEN RAISE EXCEPTION 'Practice workspace mismatch'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR v_workspace IS DISTINCT FROM OLD.workspace_id) THEN RAISE EXCEPTION 'Practice scope is immutable'; END IF;
  NEW.workspace_id := v_workspace;
  PERFORM public.assert_study_question(v_workspace, v_question);
  RETURN NEW;
END;
$$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tax_practice_sessions','tax_question_attempts','tax_question_user_state','tax_subjective_reviews','tax_subjective_attempts','tax_ai_threads','tax_ai_messages'] LOOP
    EXECUTE format('CREATE TRIGGER guard_study_scope BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_study_practice_write()', t);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_study_question(uuid, text), public.guard_study_practice_write() FROM PUBLIC, anon, authenticated;

-- Replace only the state accumulation; workload/check-in logic remains untouched.
CREATE OR REPLACE FUNCTION public.record_tax_answer(p_session_id uuid, p_question_id text, p_selected_answer jsonb, p_duration_seconds integer DEFAULT 0)
RETURNS TABLE (is_correct boolean, correct_answer jsonb, attempt_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session public.tax_practice_sessions; v_answer jsonb; v_correct boolean; v_id uuid; v_previous boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_session FROM public.tax_practice_sessions s WHERE s.id = p_session_id AND s.user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR NOT p_question_id = ANY(v_session.question_ids) THEN RAISE EXCEPTION 'Practice session or question not found'; END IF;
  PERFORM public.assert_study_question(v_session.workspace_id, p_question_id);
  IF jsonb_typeof(p_selected_answer) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'selected_answer must be an array'; END IF;
  SELECT q.correct_answer INTO v_answer FROM public.tax_questions q WHERE q.id = p_question_id AND q.question_type IN ('single_choice', 'multiple_choice', 'single_choice_inferred', 'multiple_choice_inferred');
  IF NOT FOUND THEN RAISE EXCEPTION 'Objective question required'; END IF;
  SELECT a.id, a.is_correct INTO v_id, v_previous FROM public.tax_question_attempts a WHERE a.session_id = p_session_id AND a.question_id = p_question_id;
  IF FOUND THEN RETURN QUERY SELECT v_previous, v_answer, v_id; RETURN; END IF;
  v_correct := (SELECT array_agg(value ORDER BY value) FROM jsonb_array_elements_text(v_answer)) IS NOT DISTINCT FROM (SELECT array_agg(value ORDER BY value) FROM jsonb_array_elements_text(p_selected_answer));
  INSERT INTO public.tax_question_attempts (user_id, workspace_id, session_id, question_id, selected_answer, is_correct, duration_seconds)
  VALUES (auth.uid(), v_session.workspace_id, p_session_id, p_question_id, p_selected_answer, v_correct, greatest(coalesce(p_duration_seconds,0),0)) RETURNING id INTO v_id;
  INSERT INTO public.tax_question_user_state AS st (user_id, workspace_id, question_id, is_in_wrong_book, wrong_count, correct_count, last_answer, last_is_correct, last_answered_at)
  VALUES (auth.uid(), v_session.workspace_id, p_question_id, NOT v_correct, CASE WHEN v_correct THEN 0 ELSE 1 END, CASE WHEN v_correct THEN 1 ELSE 0 END, p_selected_answer, v_correct, now())
  ON CONFLICT (user_id, workspace_id, question_id) DO UPDATE SET is_in_wrong_book = st.is_in_wrong_book OR NOT v_correct,
    wrong_count = st.wrong_count + CASE WHEN v_correct THEN 0 ELSE 1 END,
    correct_count = st.correct_count + CASE WHEN v_correct THEN 1 ELSE 0 END,
    last_answer = p_selected_answer, last_is_correct = v_correct, last_answered_at = now();
  PERFORM public.refresh_tax_session_counts(p_session_id);
  RETURN QUERY SELECT v_correct, v_answer, v_id;
END;
$$;

CREATE FUNCTION public.update_study_question_preferences(p_workspace_id uuid, p_question_id text, p_is_favorite boolean DEFAULT NULL, p_note text DEFAULT NULL, p_clear_wrong boolean DEFAULT false)
RETURNS SETOF public.tax_question_user_state LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_study_question(p_workspace_id, p_question_id);
  INSERT INTO public.tax_question_user_state AS st (user_id, workspace_id, question_id, is_favorite, note)
  VALUES (auth.uid(), p_workspace_id, p_question_id, coalesce(p_is_favorite,false), left(coalesce(p_note,''),4000))
  ON CONFLICT (user_id, workspace_id, question_id) DO UPDATE SET
    is_favorite = coalesce(p_is_favorite, st.is_favorite), note = CASE WHEN p_note IS NULL THEN st.note ELSE left(p_note,4000) END,
    is_in_wrong_book = CASE WHEN p_clear_wrong THEN false ELSE st.is_in_wrong_book END;
  RETURN QUERY SELECT * FROM public.tax_question_user_state s WHERE s.user_id = auth.uid() AND s.workspace_id = p_workspace_id AND s.question_id = p_question_id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_tax_question_preferences(text,boolean,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_study_question_preferences(uuid,text,boolean,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_study_question_preferences(uuid,text,boolean,text,boolean) TO authenticated;

-- Carry only chosen study aids, never attempts/correctness/progress. Question IDs stay stable.
CREATE FUNCTION public.carry_study_question_aids(p_source uuid, p_target uuid, p_wrong boolean, p_favorites boolean, p_notes boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_exam text; v_count integer;
BEGIN
  SELECT exam_type INTO v_exam FROM public.study_workspaces WHERE id = p_source AND user_id = auth.uid();
  IF v_exam IS NULL OR p_source = p_target OR NOT EXISTS (SELECT 1 FROM public.study_workspaces WHERE id = p_target AND user_id = auth.uid() AND exam_type = v_exam AND status = 'active') THEN RAISE EXCEPTION 'Invalid carry-over workspaces'; END IF;
  INSERT INTO public.tax_question_user_state AS st (user_id, workspace_id, question_id, is_favorite, is_in_wrong_book, note)
  SELECT s.user_id, p_target, s.question_id, p_favorites AND s.is_favorite, p_wrong AND s.is_in_wrong_book, CASE WHEN p_notes THEN s.note ELSE '' END
  FROM public.tax_question_user_state s JOIN public.tax_questions q ON q.id = s.question_id JOIN public.practice_banks b ON b.id = q.bank_id
  WHERE s.workspace_id = p_source AND s.user_id = auth.uid() AND b.exam_type = v_exam AND b.status = 'published' AND q.is_published
    AND ((p_favorites AND s.is_favorite) OR (p_wrong AND s.is_in_wrong_book) OR (p_notes AND s.note <> ''))
  ON CONFLICT (user_id, workspace_id, question_id) DO UPDATE SET
    is_favorite = st.is_favorite OR excluded.is_favorite, is_in_wrong_book = st.is_in_wrong_book OR excluded.is_in_wrong_book,
    note = CASE WHEN st.note = '' THEN excluded.note ELSE st.note END;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.carry_study_question_aids(uuid,uuid,boolean,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carry_study_question_aids(uuid,uuid,boolean,boolean,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_tax_subjective_answer(p_session_id uuid, p_question_id text, p_answer_text text)
RETURNS TABLE (id uuid, question_id text, answer_text text, status text, ai_score numeric, ai_feedback jsonb, ai_model text, submitted_at timestamptz, graded_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid; v_answer text := btrim(coalesce(p_answer_text,''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF char_length(v_answer) NOT BETWEEN 1 AND 6000 THEN RAISE EXCEPTION 'Subjective answer must contain 1 to 6000 characters'; END IF;
  SELECT s.workspace_id INTO v_workspace FROM public.tax_practice_sessions s JOIN public.tax_questions q ON q.id = p_question_id
  WHERE s.id = p_session_id AND s.user_id = auth.uid() AND p_question_id = ANY(s.question_ids)
    AND q.is_published AND q.question_type IN ('subjective','calculation','comprehensive');
  IF NOT FOUND THEN RAISE EXCEPTION 'Subjective question or practice session not found'; END IF;
  PERFORM public.assert_study_question(v_workspace, p_question_id);
  INSERT INTO public.tax_subjective_attempts(user_id,workspace_id,session_id,question_id,answer_text,status,submitted_at,updated_at)
  VALUES(auth.uid(),v_workspace,p_session_id,p_question_id,v_answer,'submitted',now(),now())
  ON CONFLICT ON CONSTRAINT tax_subjective_attempts_session_id_question_id_key DO UPDATE SET
    answer_text = excluded.answer_text, status = 'submitted', ai_score = NULL, ai_feedback = NULL, ai_model = NULL,
    submitted_at = now(), graded_at = NULL, updated_at = now();
  RETURN QUERY SELECT a.id,a.question_id,a.answer_text,a.status,a.ai_score,a.ai_feedback,a.ai_model,a.submitted_at,a.graded_at
    FROM public.tax_subjective_attempts a WHERE a.session_id=p_session_id AND a.question_id=p_question_id AND a.user_id=auth.uid();
END;
$$;
COMMIT;

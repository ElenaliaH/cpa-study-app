-- Subjective practice selection, answer persistence, and AI-assisted grading.
-- Additive only: existing sessions and answer history remain intact.

ALTER TABLE public.tax_chapters
  ADD COLUMN IF NOT EXISTS objective_question_count integer NOT NULL DEFAULT 0 CHECK (objective_question_count >= 0),
  ADD COLUMN IF NOT EXISTS subjective_question_count integer NOT NULL DEFAULT 0 CHECK (subjective_question_count >= 0);

UPDATE public.tax_chapters c
SET objective_question_count = (
      SELECT count(*) FROM public.tax_questions q
      WHERE q.chapter_id = c.id
        AND q.is_published = true
        AND q.question_type IN (
          'single_choice', 'multiple_choice', 'single_choice_inferred', 'multiple_choice_inferred'
        )
    ),
    subjective_question_count = (
      SELECT count(*) FROM public.tax_questions q
      WHERE q.chapter_id = c.id
        AND q.is_published = true
        AND q.question_type IN ('subjective', 'calculation', 'comprehensive')
    );

ALTER TABLE public.tax_practice_sessions
  ADD COLUMN IF NOT EXISTS question_scope text NOT NULL DEFAULT 'objective';

UPDATE public.tax_practice_sessions
SET question_scope = 'mixed'
WHERE chapter_id IS NULL;

ALTER TABLE public.tax_practice_sessions
  DROP CONSTRAINT IF EXISTS tax_practice_sessions_question_scope_check;

ALTER TABLE public.tax_practice_sessions
  ADD CONSTRAINT tax_practice_sessions_question_scope_check
  CHECK (question_scope IN ('objective', 'subjective', 'mixed'));

CREATE INDEX IF NOT EXISTS idx_tax_sessions_user_chapter_scope
  ON public.tax_practice_sessions(user_id, chapter_id, question_scope, last_active_at DESC);

CREATE TABLE IF NOT EXISTS public.tax_subjective_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES public.tax_practice_sessions(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES public.tax_questions(id) ON DELETE RESTRICT,
  answer_text text NOT NULL CHECK (char_length(answer_text) BETWEEN 1 AND 6000),
  status      text NOT NULL DEFAULT 'submitted'
              CHECK (status IN ('submitted', 'pending', 'graded', 'failed')),
  ai_score    numeric(5,2) CHECK (ai_score IS NULL OR (ai_score >= 0 AND ai_score <= 100)),
  ai_feedback jsonb,
  ai_model    text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  graded_at   timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_tax_subjective_attempts_user_question
  ON public.tax_subjective_attempts(user_id, question_id, updated_at DESC);

ALTER TABLE public.tax_subjective_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_subjective_attempts_select_own ON public.tax_subjective_attempts;
CREATE POLICY tax_subjective_attempts_select_own
  ON public.tax_subjective_attempts FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS tax_subjective_attempts_insert_own ON public.tax_subjective_attempts;
CREATE POLICY tax_subjective_attempts_insert_own
  ON public.tax_subjective_attempts FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS tax_subjective_attempts_update_own ON public.tax_subjective_attempts;
CREATE POLICY tax_subjective_attempts_update_own
  ON public.tax_subjective_attempts FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.save_tax_subjective_answer(
  p_session_id uuid,
  p_question_id text,
  p_answer_text text
)
RETURNS TABLE (
  id uuid,
  question_id text,
  answer_text text,
  status text,
  ai_score numeric,
  ai_feedback jsonb,
  ai_model text,
  submitted_at timestamptz,
  graded_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_answer text := btrim(coalesce(p_answer_text, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF char_length(v_answer) < 1 OR char_length(v_answer) > 6000 THEN
    RAISE EXCEPTION 'Subjective answer must contain 1 to 6000 characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tax_practice_sessions s
    JOIN public.tax_questions q ON q.id = p_question_id
    WHERE s.id = p_session_id
      AND s.user_id = v_user_id
      AND p_question_id = ANY(s.question_ids)
      AND q.is_published = true
      AND q.question_type IN ('subjective', 'calculation', 'comprehensive')
  ) THEN
    RAISE EXCEPTION 'Subjective question or practice session not found';
  END IF;

  INSERT INTO public.tax_subjective_attempts (
    user_id, session_id, question_id, answer_text, status, submitted_at, updated_at
  )
  VALUES (
    v_user_id, p_session_id, p_question_id, v_answer, 'submitted', now(), now()
  )
  ON CONFLICT (session_id, question_id) DO UPDATE SET
    answer_text = excluded.answer_text,
    status = 'submitted',
    ai_score = NULL,
    ai_feedback = NULL,
    ai_model = NULL,
    submitted_at = now(),
    graded_at = NULL,
    updated_at = now();

  RETURN QUERY
  SELECT a.id, a.question_id, a.answer_text, a.status, a.ai_score,
         a.ai_feedback, a.ai_model, a.submitted_at, a.graded_at
  FROM public.tax_subjective_attempts a
  WHERE a.session_id = p_session_id
    AND a.question_id = p_question_id
    AND a.user_id = v_user_id;
END;
$$;

REVOKE ALL ON TABLE public.tax_subjective_attempts FROM anon;
REVOKE ALL ON TABLE public.tax_subjective_attempts FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tax_subjective_attempts TO authenticated;

REVOKE ALL ON FUNCTION public.save_tax_subjective_answer(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_tax_subjective_answer(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_tax_subjective_answer(uuid, text, text) TO authenticated;

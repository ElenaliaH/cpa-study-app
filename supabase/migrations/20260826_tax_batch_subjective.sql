-- Subjective-question progress support.
-- This migration is additive and does not alter existing answer history.

ALTER TABLE public.tax_questions
  DROP CONSTRAINT IF EXISTS tax_questions_question_type_check;

ALTER TABLE public.tax_questions
  ADD CONSTRAINT tax_questions_question_type_check CHECK (
    question_type IN (
      'single_choice',
      'multiple_choice',
      'single_choice_inferred',
      'multiple_choice_inferred',
      'subjective',
      'calculation',
      'comprehensive'
    )
  );

CREATE TABLE IF NOT EXISTS public.tax_subjective_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES public.tax_practice_sessions(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES public.tax_questions(id) ON DELETE RESTRICT,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_tax_subjective_reviews_user_question
  ON public.tax_subjective_reviews(user_id, question_id);

ALTER TABLE public.tax_subjective_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_subjective_reviews_select_own ON public.tax_subjective_reviews;
CREATE POLICY tax_subjective_reviews_select_own
  ON public.tax_subjective_reviews FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.record_tax_subjective_review(
  p_session_id uuid,
  p_question_id text
)
RETURNS TABLE (
  review_id uuid,
  viewed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_review_id uuid;
  v_viewed_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
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

  INSERT INTO public.tax_subjective_reviews (user_id, session_id, question_id)
  VALUES (v_user_id, p_session_id, p_question_id)
  ON CONFLICT (session_id, question_id) DO UPDATE SET
    viewed_at = public.tax_subjective_reviews.viewed_at
  RETURNING id, public.tax_subjective_reviews.viewed_at
  INTO v_review_id, v_viewed_at;

  UPDATE public.tax_practice_sessions s
  SET answered_count =
        (SELECT count(*) FROM public.tax_question_attempts a WHERE a.session_id = s.id) +
        (SELECT count(*) FROM public.tax_subjective_reviews r WHERE r.session_id = s.id),
      correct_count =
        (SELECT count(*) FROM public.tax_question_attempts a WHERE a.session_id = s.id AND a.is_correct),
      last_active_at = now()
  WHERE s.id = p_session_id AND s.user_id = v_user_id;

  RETURN QUERY SELECT v_review_id, v_viewed_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_tax_session_counts(p_session_id uuid)
RETURNS TABLE (
  answered_count integer,
  correct_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tax_practice_sessions s
    WHERE s.id = p_session_id AND s.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Practice session not found';
  END IF;

  UPDATE public.tax_practice_sessions s
  SET answered_count =
        (SELECT count(*) FROM public.tax_question_attempts a WHERE a.session_id = s.id) +
        (SELECT count(*) FROM public.tax_subjective_reviews r WHERE r.session_id = s.id),
      correct_count =
        (SELECT count(*) FROM public.tax_question_attempts a WHERE a.session_id = s.id AND a.is_correct),
      last_active_at = now()
  WHERE s.id = p_session_id AND s.user_id = v_user_id;

  RETURN QUERY
  SELECT s.answered_count, s.correct_count
  FROM public.tax_practice_sessions s
  WHERE s.id = p_session_id AND s.user_id = v_user_id;
END;
$$;

REVOKE ALL ON TABLE public.tax_subjective_reviews FROM anon;
REVOKE ALL ON TABLE public.tax_subjective_reviews FROM authenticated;
GRANT SELECT ON public.tax_subjective_reviews TO authenticated;

REVOKE ALL ON FUNCTION public.record_tax_subjective_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_tax_session_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tax_subjective_review(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_tax_session_counts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_tax_subjective_review(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_tax_session_counts(uuid) TO authenticated;

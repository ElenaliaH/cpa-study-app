-- Tax practice module.
-- Run in Supabase SQL Editor only after reviewing this migration.

CREATE TABLE IF NOT EXISTS public.tax_chapters (
  id              text PRIMARY KEY,
  order_no        smallint NOT NULL UNIQUE,
  title           text NOT NULL,
  question_count  integer NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  source_version  text NOT NULL DEFAULT 'wang-tingxi-word-v1',
  is_published    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_questions (
  id                text PRIMARY KEY,
  chapter_id        text NOT NULL REFERENCES public.tax_chapters(id) ON DELETE RESTRICT,
  sequence_no       integer NOT NULL CHECK (sequence_no > 0),
  question_type     text NOT NULL CHECK (
    question_type IN (
      'single_choice',
      'multiple_choice',
      'single_choice_inferred',
      'multiple_choice_inferred'
    )
  ),
  source_label      text NOT NULL DEFAULT '',
  stem              text NOT NULL,
  options           jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),
  correct_answer    jsonb NOT NULL CHECK (jsonb_typeof(correct_answer) = 'array'),
  answer_raw        text NOT NULL DEFAULT '',
  explanation       text NOT NULL DEFAULT '',
  content_hash      text NOT NULL,
  source_paragraph  integer NOT NULL,
  source_version    text NOT NULL DEFAULT 'wang-tingxi-word-v1',
  is_published      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, sequence_no),
  UNIQUE (content_hash)
);

CREATE TABLE IF NOT EXISTS public.tax_question_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   text NOT NULL REFERENCES public.tax_questions(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  alt_text      text NOT NULL DEFAULT '',
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, storage_path)
);

CREATE TABLE IF NOT EXISTS public.tax_practice_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id      text REFERENCES public.tax_chapters(id) ON DELETE SET NULL,
  mode            text NOT NULL CHECK (mode IN ('sequential', 'random', 'wrong', 'favorite', 'note')),
  question_ids    text[] NOT NULL DEFAULT '{}',
  current_index   integer NOT NULL DEFAULT 0 CHECK (current_index >= 0),
  answered_count  integer NOT NULL DEFAULT 0 CHECK (answered_count >= 0),
  correct_count   integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  last_active_at  timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE TABLE IF NOT EXISTS public.tax_question_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid NOT NULL REFERENCES public.tax_practice_sessions(id) ON DELETE CASCADE,
  question_id       text NOT NULL REFERENCES public.tax_questions(id) ON DELETE RESTRICT,
  selected_answer   jsonb NOT NULL CHECK (jsonb_typeof(selected_answer) = 'array'),
  is_correct        boolean NOT NULL,
  duration_seconds  integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  answered_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.tax_question_user_state (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id      text NOT NULL REFERENCES public.tax_questions(id) ON DELETE CASCADE,
  is_favorite      boolean NOT NULL DEFAULT false,
  note             text NOT NULL DEFAULT '',
  is_in_wrong_book boolean NOT NULL DEFAULT false,
  wrong_count      integer NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  correct_count    integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  last_answer      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(last_answer) = 'array'),
  last_is_correct  boolean,
  last_answered_at timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.tax_ai_threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id  text NOT NULL REFERENCES public.tax_questions(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_ai_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid NOT NULL REFERENCES public.tax_ai_threads(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role           text NOT NULL CHECK (role IN ('user', 'assistant')),
  content        text NOT NULL,
  model          text,
  input_tokens   integer,
  output_tokens  integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_ai_usage_daily (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date       date NOT NULL DEFAULT current_date,
  request_count    integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  input_tokens     bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens    bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  last_request_at  timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_tax_questions_chapter
  ON public.tax_questions(chapter_id, sequence_no)
  WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_tax_sessions_user_active
  ON public.tax_practice_sessions(user_id, last_active_at DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tax_attempts_user_question
  ON public.tax_question_attempts(user_id, question_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_tax_state_wrong
  ON public.tax_question_user_state(user_id, is_in_wrong_book)
  WHERE is_in_wrong_book = true;
CREATE INDEX IF NOT EXISTS idx_tax_state_favorite
  ON public.tax_question_user_state(user_id, is_favorite)
  WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_tax_ai_threads_user_question
  ON public.tax_ai_threads(user_id, question_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tax_ai_messages_thread
  ON public.tax_ai_messages(thread_id, created_at);

CREATE OR REPLACE FUNCTION public.set_tax_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_chapters_updated_at ON public.tax_chapters;
CREATE TRIGGER trg_tax_chapters_updated_at
  BEFORE UPDATE ON public.tax_chapters
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_updated_at();

DROP TRIGGER IF EXISTS trg_tax_questions_updated_at ON public.tax_questions;
CREATE TRIGGER trg_tax_questions_updated_at
  BEFORE UPDATE ON public.tax_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_updated_at();

DROP TRIGGER IF EXISTS trg_tax_state_updated_at ON public.tax_question_user_state;
CREATE TRIGGER trg_tax_state_updated_at
  BEFORE UPDATE ON public.tax_question_user_state
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_updated_at();

DROP TRIGGER IF EXISTS trg_tax_ai_threads_updated_at ON public.tax_ai_threads;
CREATE TRIGGER trg_tax_ai_threads_updated_at
  BEFORE UPDATE ON public.tax_ai_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_updated_at();

ALTER TABLE public.tax_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_question_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_question_user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_ai_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_ai_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_chapters_read_published ON public.tax_chapters;
CREATE POLICY tax_chapters_read_published
  ON public.tax_chapters FOR SELECT TO authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS tax_questions_read_published ON public.tax_questions;
CREATE POLICY tax_questions_read_published
  ON public.tax_questions FOR SELECT TO authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS tax_assets_read_published ON public.tax_question_assets;
CREATE POLICY tax_assets_read_published
  ON public.tax_question_assets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tax_questions q
      WHERE q.id = question_id AND q.is_published = true
    )
  );

DROP POLICY IF EXISTS tax_sessions_select_own ON public.tax_practice_sessions;
CREATE POLICY tax_sessions_select_own
  ON public.tax_practice_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS tax_sessions_insert_own ON public.tax_practice_sessions;
CREATE POLICY tax_sessions_insert_own
  ON public.tax_practice_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS tax_sessions_update_own ON public.tax_practice_sessions;
CREATE POLICY tax_sessions_update_own
  ON public.tax_practice_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS tax_sessions_delete_own ON public.tax_practice_sessions;
CREATE POLICY tax_sessions_delete_own
  ON public.tax_practice_sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS tax_attempts_select_own ON public.tax_question_attempts;
CREATE POLICY tax_attempts_select_own
  ON public.tax_question_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS tax_state_select_own ON public.tax_question_user_state;
CREATE POLICY tax_state_select_own
  ON public.tax_question_user_state FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS tax_ai_threads_select_own ON public.tax_ai_threads;
CREATE POLICY tax_ai_threads_select_own
  ON public.tax_ai_threads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS tax_ai_threads_insert_own ON public.tax_ai_threads;
CREATE POLICY tax_ai_threads_insert_own
  ON public.tax_ai_threads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS tax_ai_threads_update_own ON public.tax_ai_threads;
CREATE POLICY tax_ai_threads_update_own
  ON public.tax_ai_threads FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS tax_ai_messages_select_own ON public.tax_ai_messages;
CREATE POLICY tax_ai_messages_select_own
  ON public.tax_ai_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS tax_ai_messages_insert_own ON public.tax_ai_messages;
CREATE POLICY tax_ai_messages_insert_own
  ON public.tax_ai_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.tax_ai_threads t
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tax_ai_usage_select_own ON public.tax_ai_usage_daily;
CREATE POLICY tax_ai_usage_select_own
  ON public.tax_ai_usage_daily FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_tax_answer(
  p_session_id uuid,
  p_question_id text,
  p_selected_answer jsonb,
  p_duration_seconds integer DEFAULT 0
)
RETURNS TABLE (
  is_correct boolean,
  correct_answer jsonb,
  attempt_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_correct_json jsonb;
  v_correct_values text[];
  v_selected_values text[];
  v_is_correct boolean;
  v_attempt_id uuid;
  v_existing_correct boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF jsonb_typeof(p_selected_answer) <> 'array' THEN
    RAISE EXCEPTION 'selected_answer must be an array';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tax_practice_sessions s
    WHERE s.id = p_session_id
      AND s.user_id = v_user_id
      AND p_question_id = ANY(s.question_ids)
  ) THEN
    RAISE EXCEPTION 'Practice session or question not found';
  END IF;

  SELECT q.correct_answer
  INTO v_correct_json
  FROM public.tax_questions q
  WHERE q.id = p_question_id AND q.is_published = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published question not found';
  END IF;

  SELECT COALESCE(array_agg(value ORDER BY value), ARRAY[]::text[])
  INTO v_correct_values
  FROM jsonb_array_elements_text(v_correct_json);
  SELECT COALESCE(array_agg(value ORDER BY value), ARRAY[]::text[])
  INTO v_selected_values
  FROM jsonb_array_elements_text(p_selected_answer);
  v_is_correct := v_correct_values = v_selected_values;

  SELECT a.id, a.is_correct
  INTO v_attempt_id, v_existing_correct
  FROM public.tax_question_attempts a
  WHERE a.session_id = p_session_id AND a.question_id = p_question_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing_correct, v_correct_json, v_attempt_id;
    RETURN;
  END IF;

  INSERT INTO public.tax_question_attempts (
    user_id, session_id, question_id, selected_answer, is_correct, duration_seconds
  )
  VALUES (
    v_user_id,
    p_session_id,
    p_question_id,
    p_selected_answer,
    v_is_correct,
    GREATEST(COALESCE(p_duration_seconds, 0), 0)
  )
  RETURNING id INTO v_attempt_id;

  INSERT INTO public.tax_question_user_state (
    user_id,
    question_id,
    is_in_wrong_book,
    wrong_count,
    correct_count,
    last_answer,
    last_is_correct,
    last_answered_at
  )
  VALUES (
    v_user_id,
    p_question_id,
    NOT v_is_correct,
    CASE WHEN v_is_correct THEN 0 ELSE 1 END,
    CASE WHEN v_is_correct THEN 1 ELSE 0 END,
    p_selected_answer,
    v_is_correct,
    now()
  )
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    is_in_wrong_book = public.tax_question_user_state.is_in_wrong_book OR NOT v_is_correct,
    wrong_count = public.tax_question_user_state.wrong_count + CASE WHEN v_is_correct THEN 0 ELSE 1 END,
    correct_count = public.tax_question_user_state.correct_count + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
    last_answer = p_selected_answer,
    last_is_correct = v_is_correct,
    last_answered_at = now();

  UPDATE public.tax_practice_sessions s
  SET
    answered_count = (
      SELECT count(*) FROM public.tax_question_attempts a WHERE a.session_id = s.id
    ),
    correct_count = (
      SELECT count(*) FROM public.tax_question_attempts a WHERE a.session_id = s.id AND a.is_correct
    ),
    last_active_at = now()
  WHERE s.id = p_session_id AND s.user_id = v_user_id;

  RETURN QUERY SELECT v_is_correct, v_correct_json, v_attempt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_tax_ai_quota(
  p_daily_limit integer DEFAULT 20,
  p_cooldown_seconds integer DEFAULT 5
)
RETURNS TABLE (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_usage public.tax_ai_usage_daily%ROWTYPE;
  v_retry integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  p_daily_limit := GREATEST(1, LEAST(COALESCE(p_daily_limit, 20), 200));
  p_cooldown_seconds := GREATEST(0, LEAST(COALESCE(p_cooldown_seconds, 5), 60));

  INSERT INTO public.tax_ai_usage_daily (user_id, usage_date)
  VALUES (v_user_id, current_date)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT *
  INTO v_usage
  FROM public.tax_ai_usage_daily
  WHERE user_id = v_user_id AND usage_date = current_date
  FOR UPDATE;

  IF v_usage.request_count >= p_daily_limit THEN
    RETURN QUERY SELECT false, 0, 0, 'daily_limit';
    RETURN;
  END IF;

  IF v_usage.last_request_at IS NOT NULL
     AND v_usage.last_request_at > now() - make_interval(secs => p_cooldown_seconds) THEN
    v_retry := GREATEST(
      1,
      CEIL(EXTRACT(epoch FROM (
        v_usage.last_request_at + make_interval(secs => p_cooldown_seconds) - now()
      )))::integer
    );
    RETURN QUERY SELECT false, p_daily_limit - v_usage.request_count, v_retry, 'cooldown';
    RETURN;
  END IF;

  UPDATE public.tax_ai_usage_daily
  SET request_count = request_count + 1,
      last_request_at = now(),
      updated_at = now()
  WHERE user_id = v_user_id AND usage_date = current_date;

  RETURN QUERY SELECT true, p_daily_limit - v_usage.request_count - 1, 0, 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_tax_question_preferences(
  p_question_id text,
  p_is_favorite boolean DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_clear_wrong boolean DEFAULT false
)
RETURNS SETOF public.tax_question_user_state
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
    SELECT 1 FROM public.tax_questions q
    WHERE q.id = p_question_id AND q.is_published = true
  ) THEN
    RAISE EXCEPTION 'Published question not found';
  END IF;

  INSERT INTO public.tax_question_user_state (
    user_id, question_id, is_favorite, note, is_in_wrong_book
  )
  VALUES (
    v_user_id,
    p_question_id,
    COALESCE(p_is_favorite, false),
    LEFT(COALESCE(p_note, ''), 4000),
    false
  )
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    is_favorite = COALESCE(p_is_favorite, public.tax_question_user_state.is_favorite),
    note = CASE
      WHEN p_note IS NULL THEN public.tax_question_user_state.note
      ELSE LEFT(p_note, 4000)
    END,
    is_in_wrong_book = CASE
      WHEN p_clear_wrong THEN false
      ELSE public.tax_question_user_state.is_in_wrong_book
    END;

  RETURN QUERY
  SELECT *
  FROM public.tax_question_user_state s
  WHERE s.user_id = v_user_id AND s.question_id = p_question_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_tax_ai_usage(
  p_input_tokens integer DEFAULT 0,
  p_output_tokens integer DEFAULT 0
)
RETURNS void
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

  UPDATE public.tax_ai_usage_daily
  SET input_tokens = input_tokens + GREATEST(COALESCE(p_input_tokens, 0), 0),
      output_tokens = output_tokens + GREATEST(COALESCE(p_output_tokens, 0), 0),
      updated_at = now()
  WHERE user_id = v_user_id AND usage_date = current_date;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tax_answer(uuid, text, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_tax_ai_quota(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tax_question_preferences(text, boolean, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tax_ai_usage(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tax_answer(uuid, text, jsonb, integer) FROM anon;
REVOKE ALL ON FUNCTION public.consume_tax_ai_quota(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.update_tax_question_preferences(text, boolean, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.record_tax_ai_usage(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_tax_answer(uuid, text, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_tax_ai_quota(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tax_question_preferences(text, boolean, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_tax_ai_usage(integer, integer) TO authenticated;

GRANT SELECT ON public.tax_chapters, public.tax_questions, public.tax_question_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_practice_sessions TO authenticated;
GRANT SELECT ON public.tax_question_attempts TO authenticated;
GRANT SELECT ON public.tax_question_user_state TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tax_ai_threads TO authenticated;
GRANT SELECT, INSERT ON public.tax_ai_messages TO authenticated;
GRANT SELECT ON public.tax_ai_usage_daily TO authenticated;

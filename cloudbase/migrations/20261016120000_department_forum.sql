CREATE TABLE IF NOT EXISTS public.forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 2 AND 32),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  content text NOT NULL CHECK (char_length(content) BETWEEN 2 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_posts_created_at_idx
  ON public.forum_posts (created_at DESC);

CREATE TABLE IF NOT EXISTS public.forum_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 2 AND 32),
  content text NOT NULL CHECK (char_length(content) BETWEEN 2 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_replies_post_created_at_idx
  ON public.forum_replies (post_id, created_at);

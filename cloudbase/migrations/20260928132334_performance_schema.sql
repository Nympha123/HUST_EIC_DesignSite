CREATE TABLE public.performance_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.performance_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id uuid NOT NULL REFERENCES public.performance_years(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.performance_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.performance_sections(id) ON DELETE CASCADE,
  grade text NOT NULL,
  member_name text NOT NULL DEFAULT '',
  current_score text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.performance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.performance_members(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX performance_sections_year_sort_idx
  ON public.performance_sections(year_id, sort_order);

CREATE INDEX performance_members_section_sort_idx
  ON public.performance_members(section_id, sort_order);

CREATE INDEX performance_tasks_member_sort_idx
  ON public.performance_tasks(member_id, sort_order);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON public.performance_years,
  public.performance_sections,
  public.performance_members,
  public.performance_tasks TO anon, authenticated, service_role;

GRANT INSERT, UPDATE, DELETE ON public.performance_years,
  public.performance_sections,
  public.performance_members,
  public.performance_tasks TO service_role;

ALTER TABLE public.performance_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY performance_years_public_read
  ON public.performance_years
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY performance_sections_public_read
  ON public.performance_sections
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY performance_members_public_read
  ON public.performance_members
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY performance_tasks_public_read
  ON public.performance_tasks
  FOR SELECT TO anon, authenticated
  USING (true);

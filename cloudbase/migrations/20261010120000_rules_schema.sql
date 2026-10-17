-- 独立的部门规章目录和内容表。该迁移仅定义结构，不会由本地开发服务器自动执行。
CREATE TABLE public.rules_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rules_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id uuid NOT NULL REFERENCES public.rules_years(id) ON DELETE CASCADE,
  parent_section_id uuid REFERENCES public.rules_sections(id) ON DELETE CASCADE,
  node_type text NOT NULL DEFAULT 'page'
    CHECK (node_type IN ('directory', 'page')),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rules_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.rules_sections(id) ON DELETE CASCADE,
  grade text NOT NULL,
  member_name text NOT NULL DEFAULT '',
  current_score text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rules_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.rules_members(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rules_sections_year_sort_idx
  ON public.rules_sections(year_id, sort_order);
CREATE INDEX rules_sections_parent_sort_idx
  ON public.rules_sections(parent_section_id, sort_order);
CREATE INDEX rules_members_section_sort_idx
  ON public.rules_members(section_id, sort_order);
CREATE INDEX rules_tasks_member_sort_idx
  ON public.rules_tasks(member_id, sort_order);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.rules_years, public.rules_sections,
  public.rules_members, public.rules_tasks TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.rules_years, public.rules_sections,
  public.rules_members, public.rules_tasks TO service_role;

ALTER TABLE public.rules_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY rules_years_public_read ON public.rules_years
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rules_sections_public_read ON public.rules_sections
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rules_members_public_read ON public.rules_members
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY rules_tasks_public_read ON public.rules_tasks
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.materials_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.materials_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id uuid NOT NULL REFERENCES public.materials_years(id) ON DELETE CASCADE,
  parent_section_id uuid REFERENCES public.materials_sections(id) ON DELETE CASCADE,
  node_type text NOT NULL DEFAULT 'directory'
    CHECK (node_type IN ('directory', 'page')),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.works_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.works_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id uuid NOT NULL REFERENCES public.works_years(id) ON DELETE CASCADE,
  parent_section_id uuid REFERENCES public.works_sections(id) ON DELETE CASCADE,
  node_type text NOT NULL DEFAULT 'directory'
    CHECK (node_type IN ('directory', 'page')),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX materials_sections_parent_sort_idx
  ON public.materials_sections(year_id, parent_section_id, sort_order);

CREATE INDEX works_sections_parent_sort_idx
  ON public.works_sections(year_id, parent_section_id, sort_order);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON public.materials_years, public.materials_sections,
  public.works_years, public.works_sections TO anon, authenticated, service_role;

GRANT INSERT, UPDATE, DELETE ON public.materials_years, public.materials_sections,
  public.works_years, public.works_sections TO service_role;

ALTER TABLE public.materials_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY materials_years_public_read
  ON public.materials_years FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY materials_sections_public_read
  ON public.materials_sections FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY works_years_public_read
  ON public.works_years FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY works_sections_public_read
  ON public.works_sections FOR SELECT TO anon, authenticated USING (true);

DO $$
BEGIN
  CREATE TEMP TABLE _materials_year_map (
    source_id uuid PRIMARY KEY,
    target_id uuid NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _works_year_map (
    source_id uuid PRIMARY KEY,
    target_id uuid NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _materials_section_map (
    source_id uuid PRIMARY KEY,
    target_id uuid NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _works_section_map (
    source_id uuid PRIMARY KEY,
    target_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _materials_year_map (source_id, target_id)
  SELECT id, gen_random_uuid() FROM public.performance_years;

  INSERT INTO _works_year_map (source_id, target_id)
  SELECT id, gen_random_uuid() FROM public.performance_years;

  INSERT INTO public.materials_years (id, title, sort_order)
  SELECT map.target_id, source.title, source.sort_order
  FROM public.performance_years source
  JOIN _materials_year_map map ON map.source_id = source.id;

  INSERT INTO public.works_years (id, title, sort_order)
  SELECT map.target_id, source.title, source.sort_order
  FROM public.performance_years source
  JOIN _works_year_map map ON map.source_id = source.id;

  INSERT INTO _materials_section_map (source_id, target_id)
  SELECT id, gen_random_uuid() FROM public.performance_sections;

  INSERT INTO _works_section_map (source_id, target_id)
  SELECT id, gen_random_uuid() FROM public.performance_sections;

  INSERT INTO public.materials_sections
    (id, year_id, parent_section_id, node_type, title, sort_order)
  SELECT
    section_map.target_id,
    year_map.target_id,
    parent_map.target_id,
    source.node_type,
    source.title,
    source.sort_order
  FROM public.performance_sections source
  JOIN _materials_year_map year_map ON year_map.source_id = source.year_id
  JOIN _materials_section_map section_map ON section_map.source_id = source.id
  LEFT JOIN _materials_section_map parent_map
    ON parent_map.source_id = source.parent_section_id;

  INSERT INTO public.works_sections
    (id, year_id, parent_section_id, node_type, title, sort_order)
  SELECT
    section_map.target_id,
    year_map.target_id,
    parent_map.target_id,
    source.node_type,
    source.title,
    source.sort_order
  FROM public.performance_sections source
  JOIN _works_year_map year_map ON year_map.source_id = source.year_id
  JOIN _works_section_map section_map ON section_map.source_id = source.id
  LEFT JOIN _works_section_map parent_map
    ON parent_map.source_id = source.parent_section_id;
END $$;

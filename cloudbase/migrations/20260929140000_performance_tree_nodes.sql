ALTER TABLE public.performance_sections
  ADD COLUMN parent_section_id uuid
    REFERENCES public.performance_sections(id) ON DELETE CASCADE,
  ADD COLUMN node_type text NOT NULL DEFAULT 'page'
    CHECK (node_type IN ('directory', 'page'));

CREATE INDEX performance_sections_parent_sort_idx
  ON public.performance_sections(parent_section_id, sort_order);

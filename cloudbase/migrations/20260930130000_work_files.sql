CREATE TABLE public.works_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.works_sections(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX works_files_section_created_idx
  ON public.works_files(section_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.works_files TO service_role;

ALTER TABLE public.works_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY works_files_service_role_all
  ON public.works_files
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'works',
    'works',
    false,
    1073741824,
    ARRAY[
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'image/bmp',
      'image/tiff',
      'application/pdf',
      'application/octet-stream',
      'image/vnd.adobe.photoshop',
      'application/x-photoshop'
    ]
  )
ON CONFLICT (id) DO NOTHING;

-- 部门规章文件表与独立私有存储桶。
-- 本迁移不会由本地开发服务器自动执行。
CREATE TABLE public.rules_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.rules_sections(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rules_files_supported_extension
    CHECK (file_name ~* '\.pdf$')
);

-- 清理规则模块中迁移前可能遗留的非 PDF 记录。
DELETE FROM public.rules_files
WHERE file_name !~* '\\.pdf$';

CREATE INDEX rules_files_section_created_idx
  ON public.rules_files(section_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rules_files TO service_role;

ALTER TABLE public.rules_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY rules_files_service_role_all
  ON public.rules_files
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'rules',
    'rules',
    false,
    1073741824,
    ARRAY['application/pdf']
  )
ON CONFLICT (id) DO NOTHING;

-- Add an editable student number to each performance member row.
-- Existing records remain valid and receive an empty value.
ALTER TABLE public.performance_members
  ADD COLUMN IF NOT EXISTS student_id text NOT NULL DEFAULT '';

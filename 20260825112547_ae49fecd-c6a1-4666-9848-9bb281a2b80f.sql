ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS website_uploaded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS website_uploaded_at timestamp with time zone;
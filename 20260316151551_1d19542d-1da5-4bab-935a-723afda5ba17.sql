
-- Create submission status enum
CREATE TYPE public.submission_status AS ENUM ('pending_review', 'approved', 'rejected');

-- Events table (guest submissions, no user_id required)
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  location TEXT NOT NULL,
  organizer_name TEXT NOT NULL,
  description TEXT NOT NULL,
  highlights TEXT,
  participants TEXT,
  submitter_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  submitter_department TEXT,
  submitter_phone TEXT,
  generated_headline TEXT,
  generated_subheading TEXT,
  generated_article TEXT,
  generated_summary TEXT,
  generated_hashtags TEXT,
  generated_sdgs TEXT,
  edited_article TEXT,
  status submission_status NOT NULL DEFAULT 'pending_review',
  editor_id UUID REFERENCES auth.users(id),
  editor_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (guest submissions)
CREATE POLICY "Anyone can submit events"
  ON public.events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated users (editors) can view all
CREATE POLICY "Authenticated users can view all events"
  ON public.events FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can update (editors)
CREATE POLICY "Authenticated users can update events"
  ON public.events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Event images table
CREATE TABLE public.event_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.event_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert images"
  ON public.event_images FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view images"
  ON public.event_images FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can view images"
  ON public.event_images FOR SELECT
  TO anon
  USING (true);

-- Storage bucket for event photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true);

-- Allow anyone to upload to event-images bucket
CREATE POLICY "Anyone can upload event images"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'event-images');

-- Allow anyone to view event images
CREATE POLICY "Anyone can view event images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'event-images');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

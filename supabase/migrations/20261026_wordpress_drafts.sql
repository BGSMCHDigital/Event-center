CREATE TABLE IF NOT EXISTS public.wordpress_drafts (
 event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
 post_id bigint NOT NULL,
 edit_url text NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wordpress_drafts ENABLE ROW LEVEL SECURITY;

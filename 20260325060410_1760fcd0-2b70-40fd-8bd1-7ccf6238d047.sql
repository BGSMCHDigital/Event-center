
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS event_date_type text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS event_dates text[];

-- Backfill existing data: map event_date to start_date and end_date
UPDATE public.events SET start_date = event_date, end_date = event_date WHERE start_date IS NULL;

-- Rename organizer_name to organizing_department_name
ALTER TABLE public.events RENAME COLUMN organizer_name TO organizing_department_name;

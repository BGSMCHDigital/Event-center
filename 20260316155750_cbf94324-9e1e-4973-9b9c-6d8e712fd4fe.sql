-- Remove duplicate anon insert policy
DROP POLICY IF EXISTS "Allow public insert" ON public.events;

-- Allow authenticated users to insert events too
CREATE POLICY "Authenticated users can insert events"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to view all events (for editors)
CREATE POLICY "Authenticated users can view events"
  ON public.events FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to update events (for editors to approve/reject)
CREATE POLICY "Authenticated users can update events"
  ON public.events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anon users to view events
CREATE POLICY "Anon can view events"
  ON public.events FOR SELECT
  TO anon
  USING (true);

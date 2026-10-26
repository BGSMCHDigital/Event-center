
CREATE POLICY "Authenticated users can delete events"
ON public.events
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete event images"
ON public.event_images
FOR DELETE
TO authenticated
USING (true);

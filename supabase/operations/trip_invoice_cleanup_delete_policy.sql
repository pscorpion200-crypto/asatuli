-- Allow authenticated members to clean up only their own trip invoice uploads.
-- Folder format: <company_id>/<auth.uid()>/<trip_id>/<filename>

DROP POLICY IF EXISTS trip_invoice_delete_self ON storage.objects;

CREATE POLICY trip_invoice_delete_self
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'trip-invoices'
  AND (storage.foldername(name))[1] IN (
    SELECT members.company_id::text
    FROM public.members
    WHERE members.user_id = (SELECT auth.uid())
      AND members.role = ANY (ARRAY['owner', 'manager', 'viewer']::text[])
  )
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
);

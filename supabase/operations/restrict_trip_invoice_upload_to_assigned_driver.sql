-- Trip invoice files are only uploaded by the authenticated driver assigned to the vehicle.
-- Folder format: <company_id>/<auth.uid()>/<vehicle_id>/<trip_id>/<filename>.

DROP POLICY IF EXISTS trip_invoice_upload_self ON storage.objects;
DROP POLICY IF EXISTS trip_invoice_upload_assigned_driver ON storage.objects;

CREATE POLICY trip_invoice_upload_assigned_driver
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trip-invoices'
  AND (storage.foldername(name))[1] IN (
    SELECT members.company_id::text
    FROM public.members
    WHERE members.user_id = (SELECT auth.uid())
      AND members.role = ANY (ARRAY['owner', 'manager', 'viewer']::text[])
  )
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[3] IS NOT NULL
  AND public.employee_assigned_vehicle(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[3])::uuid
  )
  AND EXISTS (
    SELECT 1
    FROM public.drivers d
    WHERE d.company_id = ((storage.foldername(name))[1])::uuid
      AND d.user_id = (SELECT auth.uid())
  )
);

-- Driver invoice uploads are restricted to the authenticated driver, their own folder, and their assigned vehicle.
-- Folder format: <company_id>/<auth.uid()>/<vehicle_id>/<trip_id>/<filename>.
-- Fully qualify storage.objects.name to avoid column shadowing in the drivers EXISTS clause.

DROP POLICY IF EXISTS trip_invoice_upload_assigned_driver ON storage.objects;

CREATE POLICY trip_invoice_upload_assigned_driver
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trip-invoices'
  AND (storage.foldername(storage.objects.name))[1] IN (
    SELECT m.company_id::text
    FROM public.members AS m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.role = 'driver'
  )
  AND (storage.foldername(storage.objects.name))[2] = (SELECT auth.uid())::text
  AND (storage.foldername(storage.objects.name))[3] IS NOT NULL
  AND public.employee_assigned_vehicle(
    ((storage.foldername(storage.objects.name))[1])::uuid,
    ((storage.foldername(storage.objects.name))[3])::uuid
  )
  AND EXISTS (
    SELECT 1
    FROM public.drivers AS d
    WHERE d.company_id = ((storage.foldername(storage.objects.name))[1])::uuid
      AND d.user_id = (SELECT auth.uid())
  )
);

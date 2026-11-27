-- Prevent removed company members from retaining assignment-based or invoice access.
-- Keep historical driver rows and trip references while detaching the login identity.

CREATE OR REPLACE FUNCTION public.employee_assigned_vehicle(
  p_company_id uuid,
  p_vehicle_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_vehicle_assignments AS a
    JOIN public.members AS m
      ON m.company_id = a.company_id
     AND m.user_id = a.user_id
    WHERE a.company_id = p_company_id
      AND a.vehicle_id = p_vehicle_id
      AND a.user_id = (SELECT auth.uid())
  );
$function$;

REVOKE ALL ON FUNCTION public.employee_assigned_vehicle(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_assigned_vehicle(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_remove_member(
  p_company_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Owner permission required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.members
    WHERE company_id = p_company_id
      AND user_id = p_user_id
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Cannot remove owner';
  END IF;

  DELETE FROM public.employee_vehicle_assignments
   WHERE company_id = p_company_id
     AND user_id = p_user_id;

  UPDATE public.drivers
     SET user_id = NULL
   WHERE company_id = p_company_id
     AND user_id = p_user_id;

  DELETE FROM public.members
   WHERE company_id = p_company_id
     AND user_id = p_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_remove_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_remove_member(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS trip_invoice_read_company ON storage.objects;
CREATE POLICY trip_invoice_read_company
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'trip-invoices'
  AND (
    (
      (storage.foldername(name))[2] = (SELECT auth.uid())::text
      AND EXISTS (
        SELECT 1
        FROM public.members AS m
        WHERE m.company_id = ((storage.foldername(name))[1])::uuid
          AND m.user_id = (SELECT auth.uid())
      )
    )
    OR public.is_company_owner(((storage.foldername(name))[1])::uuid)
  )
);

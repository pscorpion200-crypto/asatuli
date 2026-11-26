-- Driver portal account linkage repair
-- Safe additive RLS policy plus corrected employee approval flow.

DROP POLICY IF EXISTS drivers_self_read ON public.drivers;
CREATE POLICY drivers_self_read
ON public.drivers
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) IS NOT NULL
  AND user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.members AS m
    WHERE m.company_id = drivers.company_id
      AND m.user_id = (SELECT auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.owner_approve_employee(
  p_user_id uuid,
  p_vehicle_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company uuid := 'eae155e0-144f-4828-be57-27ab5d17041b';
  v_request public.employee_join_requests%ROWTYPE;
  v_driver_id uuid;
  v_existing_user_id uuid;
  v_match_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_owner(v_company) THEN
    RAISE EXCEPTION 'صلاحية المالك مطلوبة';
  END IF;

  SELECT *
    INTO v_request
    FROM public.employee_join_requests
   WHERE company_id = v_company
     AND user_id = p_user_id
     AND status = 'pending'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا يوجد طلب معلّق لهذا المستخدم';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
     WHERE id = p_vehicle_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'السيارة غير تابعة للشركة';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.members
     WHERE company_id = v_company
       AND user_id = p_user_id
       AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'لا يمكن إضافة مالك الشركة كسائق';
  END IF;

  -- The current members.role constraint allows owner, manager, viewer.
  -- New driver accounts use viewer; preserve an existing manager role.
  INSERT INTO public.members(company_id, user_id, role)
  VALUES (v_company, p_user_id, 'viewer')
  ON CONFLICT (company_id, user_id)
  DO UPDATE SET role = CASE
    WHEN public.members.role = 'manager' THEN 'manager'
    ELSE 'viewer'
  END;

  -- Link an existing unlinked driver by exact phone when possible.
  -- If there is no matching roster entry, create the driver's row.
  IF NULLIF(BTRIM(v_request.phone), '') IS NOT NULL THEN
    SELECT count(*)
      INTO v_match_count
      FROM public.drivers
     WHERE company_id = v_company
       AND phone = BTRIM(v_request.phone);

    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'رقم الهاتف مرتبط بأكثر من سجل سائق؛ يرجى مراجعة السجلات';
    ELSIF v_match_count = 1 THEN
      SELECT id, user_id
        INTO v_driver_id, v_existing_user_id
        FROM public.drivers
       WHERE company_id = v_company
         AND phone = BTRIM(v_request.phone)
       LIMIT 1;

      IF v_existing_user_id IS NOT NULL AND v_existing_user_id <> p_user_id THEN
        RAISE EXCEPTION 'رقم الهاتف مرتبط بحساب سائق آخر';
      END IF;

      UPDATE public.drivers
         SET user_id = p_user_id
       WHERE id = v_driver_id
         AND company_id = v_company
         AND user_id IS NULL;
    ELSE
      INSERT INTO public.drivers(company_id, user_id, name, phone)
      VALUES (v_company, p_user_id, COALESCE(NULLIF(BTRIM(v_request.full_name), ''), 'سائق'), BTRIM(v_request.phone))
      RETURNING id INTO v_driver_id;
    END IF;
  ELSE
    INSERT INTO public.drivers(company_id, user_id, name, phone)
    VALUES (v_company, p_user_id, COALESCE(NULLIF(BTRIM(v_request.full_name), ''), 'سائق'), NULL)
    RETURNING id INTO v_driver_id;
  END IF;

  INSERT INTO public.employee_vehicle_assignments(company_id, user_id, vehicle_id, assigned_by)
  VALUES (v_company, p_user_id, p_vehicle_id, auth.uid())
  ON CONFLICT (company_id, user_id)
  DO UPDATE SET
    vehicle_id = EXCLUDED.vehicle_id,
    assigned_by = EXCLUDED.assigned_by,
    assigned_at = now();

  UPDATE public.employee_join_requests
     SET status = 'approved',
         updated_at = now()
   WHERE company_id = v_company
     AND user_id = p_user_id;
END;
$function$;

-- Keep this owner-only operation unavailable to unauthenticated callers.
REVOKE EXECUTE ON FUNCTION public.owner_approve_employee(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_approve_employee(uuid, uuid) TO authenticated;

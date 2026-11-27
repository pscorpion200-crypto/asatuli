-- Remove generic module permissions when a self-service employee request is approved as a driver.
BEGIN;

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
    SELECT 1
      FROM public.members
     WHERE company_id = v_company
       AND user_id = p_user_id
       AND role IN ('owner', 'manager')
  ) THEN
    RAISE EXCEPTION 'الحساب لديه صلاحية إدارية ولا يمكن اعتماده كسائق';
  END IF;

  INSERT INTO public.members AS existing_member(company_id, user_id, role)
  VALUES (v_company, p_user_id, 'driver')
  ON CONFLICT (company_id, user_id)
  DO UPDATE SET role = 'driver'
  WHERE existing_member.role IN ('viewer', 'driver');

  -- A dedicated driver must not retain manager/viewer module grants.
  DELETE FROM public.member_permissions
   WHERE company_id = v_company
     AND user_id = p_user_id;

  -- Reuse an already-linked roster row before matching by phone.
  SELECT count(*)
    INTO v_match_count
    FROM public.drivers
   WHERE company_id = v_company
     AND user_id = p_user_id;

  IF v_match_count > 1 THEN
    RAISE EXCEPTION 'حساب السائق مرتبط بأكثر من سجل؛ يرجى مراجعة السجلات';
  ELSIF v_match_count = 1 THEN
    SELECT id
      INTO v_driver_id
      FROM public.drivers
     WHERE company_id = v_company
       AND user_id = p_user_id
     LIMIT 1;
  ELSE
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

REVOKE ALL ON FUNCTION public.owner_approve_employee(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_approve_employee(uuid, uuid) TO authenticated;

COMMIT;

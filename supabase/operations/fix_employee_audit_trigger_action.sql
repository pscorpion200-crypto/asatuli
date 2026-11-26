-- The audit action check constraint accepts only INSERT/UPDATE/DELETE.
-- The employee audit trigger must use the canonical INSERT action value.
CREATE OR REPLACE FUNCTION public.log_employee_operational_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.fleet_audit_log(
    company_id, actor_user_id, table_name, action, record_id, new_data
  )
  VALUES (
    NEW.company_id, auth.uid(), TG_TABLE_NAME, 'INSERT', NEW.id::text, to_jsonb(NEW)
  );
  RETURN NEW;
END;
$function$;

-- This trigger function is invoked by its installed triggers only.
REVOKE EXECUTE ON FUNCTION public.log_employee_operational_entry() FROM PUBLIC, anon, authenticated;

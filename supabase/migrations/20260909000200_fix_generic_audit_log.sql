create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  action_name text;
  old_row jsonb;
  new_row jsonb;
begin
  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  if tg_op = 'INSERT' then
    current_user_id := new.user_id;
    action_name := 'create';
  elsif tg_op = 'UPDATE' then
    current_user_id := new.user_id;
    action_name := case
      when old_row ->> 'deleted_at' is null and new_row ->> 'deleted_at' is not null then 'delete'
      else 'update'
    end;
  else
    current_user_id := old.user_id;
    action_name := 'delete';
  end if;

  insert into public.audit_logs (
    user_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data
  )
  values (
    current_user_id,
    tg_table_name,
    coalesce(new_row ->> 'id', old_row ->> 'id'),
    action_name,
    old_row,
    new_row
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

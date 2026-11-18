-- DEMO ONLY. Lets any signed-in user switch their own role from the app (needs VITE_DEMO_MODE=true).
-- Remove before real use:  drop function set_my_role(text);
create or replace function set_my_role(p_role text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 if p_role not in('citizen','collector','admin') then raise exception 'Bad role.'; end if;
 update profiles set role=p_role where id=auth.uid();
end$$;

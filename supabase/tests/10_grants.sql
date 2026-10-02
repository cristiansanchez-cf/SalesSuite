-- Supabase concede por defecto DML a authenticated (RLS decide). Replicamos eso en el stub.
grant select, insert, update, delete on all tables in schema public to authenticated;

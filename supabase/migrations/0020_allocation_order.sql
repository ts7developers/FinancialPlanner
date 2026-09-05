-- Custom order for where fortnightly surplus goes (emergency fund / house deposit / goals).
-- Null means "use the default" (emergency, then goals by their own priority, then deposit) —
-- see resolveAllocationOrder in lib/derive.ts.
alter table public.profiles add column if not exists allocation_order jsonb;

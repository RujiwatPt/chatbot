-- Add index on messages (role, created_at) to accelerate sliding-window rate limit checks
set search_path = public;

create index if not exists idx_messages_role_created_at
  on messages (role, created_at desc);

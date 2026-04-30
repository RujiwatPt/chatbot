-- Chat quality feature schema upgrades:
-- 1) allow scene-state memory rows
-- 2) feedback capture table for assistant messages

alter table memories
  drop constraint if exists memories_kind_check;

alter table memories
  add constraint memories_kind_check
  check (kind in ('summary', 'fact', 'scene'));

create table if not exists message_feedback (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  chat_id     uuid not null references chats(id) on delete cascade,
  message_id  bigint not null references messages(id) on delete cascade,
  feedback    text not null check (feedback in ('more_in_character', 'too_generic', 'too_verbose')),
  created_at  timestamptz not null default now(),
  unique (user_id, message_id, feedback)
);

create index if not exists message_feedback_user_idx
  on message_feedback (user_id, created_at desc);

alter table message_feedback enable row level security;

drop policy if exists "message_feedback_owner" on message_feedback;
create policy "message_feedback_owner" on message_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

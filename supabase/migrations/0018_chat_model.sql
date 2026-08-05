-- Add per-chat model override column
set search_path = public;

alter table chats add column if not exists model text;

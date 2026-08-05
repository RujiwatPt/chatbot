-- Add per-chat user description/persona and global profile bio
set search_path = public;

alter table chats add column if not exists user_description text;
alter table profiles add column if not exists bio text;

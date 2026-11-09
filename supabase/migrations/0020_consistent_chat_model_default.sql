-- Migration 0020: Consistent chat model default & backfill
set search_path = public;

-- Ensure default on chats.model matches DEFAULT_MODEL
alter table chats
  alter column model set default 'sao10k/l3.1-euryale-70b';

-- Backfill any existing chats with missing or deprecated models
update chats
set model = 'sao10k/l3.1-euryale-70b'
where model is null or model = 'sao10k/l3.3-euryale-70b';

-- Update characters table default model to active release
alter table characters
  alter column model set default 'sao10k/l3.1-euryale-70b';

-- Backfill any existing characters with deprecated model tag
update characters
set model = 'sao10k/l3.1-euryale-70b'
where model is null or model = 'sao10k/l3.3-euryale-70b';

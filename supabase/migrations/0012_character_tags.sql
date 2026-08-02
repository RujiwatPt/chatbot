-- Add tags array column to characters table, create GIN index, and backfill seed characters.

set search_path = public;

alter table characters
  add column if not exists tags text[] not null default '{}';

create index if not exists characters_tags_idx
  on characters using gin (tags);

-- Backfill tags for seed public characters
update characters
set tags = ARRAY['Female', 'Teenager', 'Anime']
where is_public = true and name = 'Tsundere girl';

update characters
set tags = ARRAY['Teenager', 'Cozy']
where is_public = true and name = 'Childhood bestfriend';

update characters
set tags = ARRAY['Female', 'Adult', 'Support']
where is_public = true and name = 'Your therapist';

update characters
set tags = ARRAY['Male', 'Furry', 'Adult', 'Fantasy']
where is_public = true and name = 'Your wolfman bestfriend';

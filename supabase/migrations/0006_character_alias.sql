-- Add optional alias for character self-reference/display in chat labels.

alter table characters
  add column if not exists alias text;

-- Keep existing rows valid and set a canonical alias for the wolfman seed.
update characters
set alias = 'Kael'
where is_public = true
  and name = 'Your wolfman bestfriend'
  and (alias is null or btrim(alias) = '');

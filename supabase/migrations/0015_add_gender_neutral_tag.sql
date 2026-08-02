-- Migration: Add Gender-Neutral preset tag and update Sam's seed character tags.

set search_path = public;

-- Insert Gender-Neutral tag into global tags table
insert into public.tags (name, slug, is_preset)
values ('Gender-Neutral', 'gender-neutral', true)
on conflict (slug) do update set is_preset = true;

-- Update Sam's seed character tags
update characters
set tags = array_append(array_remove(tags, 'Female'), 'Gender-Neutral')
where is_public = true and name = 'Childhood bestfriend' and not ('Gender-Neutral' = any(tags));

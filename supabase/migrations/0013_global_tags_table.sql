-- Migration: Create global tags table and seed preset tags.

set search_path = public;

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  is_preset boolean not null default false,
  created_at timestamptz not null default now()
);

-- Enable RLS on tags table
alter table public.tags enable row level security;

-- Allow public read access to tags
create policy "Allow public read access to tags"
  on public.tags for select
  using (true);

-- Allow authenticated users to insert new tags
create policy "Allow authenticated users to insert tags"
  on public.tags for insert
  with check (auth.uid() is not null);

-- Seed initial preset tags
insert into public.tags (name, slug, is_preset) values
  ('Male', 'male', true),
  ('Female', 'female', true),
  ('Furry', 'furry', true),
  ('Teenager', 'teenager', true),
  ('Adult', 'adult', true),
  ('NSFW', 'nsfw', true),
  ('Violence', 'violence', true),
  ('Anime', 'anime', true),
  ('Cozy', 'cozy', true),
  ('Fantasy', 'fantasy', true),
  ('Support', 'support', true),
  ('Sci-Fi', 'sci-fi', true),
  ('Romance', 'romance', true),
  ('Horror', 'horror', true)
on conflict (slug) do update set is_preset = excluded.is_preset;

-- Backfill any existing tags from characters table
insert into public.tags (name, slug, is_preset)
select distinct
  trim(t) as name,
  lower(trim(t)) as slug,
  false as is_preset
from characters, unnest(tags) as t
where trim(t) != ''
on conflict (slug) do nothing;

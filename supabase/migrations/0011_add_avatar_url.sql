-- Add avatar_url column to characters table for custom R2 avatar image URLs
alter table characters
  add column if not exists avatar_url text;

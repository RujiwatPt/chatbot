-- Migration: Add pronouns column to profiles table

set search_path = public;

alter table public.profiles
  add column if not exists pronouns text;

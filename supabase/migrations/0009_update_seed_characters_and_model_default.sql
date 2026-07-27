-- Migration 0009: Update character default model to sao10k/l3.3-euryale-70b
-- Updates table default and backfills existing seed/public characters.

alter table characters
  alter column model set default 'sao10k/l3.3-euryale-70b';

update characters
set model = 'sao10k/l3.3-euryale-70b'
where is_public = true or model = 'deepseek/deepseek-chat-v3.1:free';

-- Tracks the highest messages.id covered by a summary, so the summarizer can
-- decide when there's enough new material to re-summarize.
alter table memories
  add column if not exists up_to_message_id bigint;

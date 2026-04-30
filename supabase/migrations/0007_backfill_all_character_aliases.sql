-- Backfill alias for all existing characters from seeded mappings,
-- persona description, and finally name fallback.

-- 1) Explicit seeded/public mappings.
update characters
set alias = 'Aiko'
where (alias is null or btrim(alias) = '')
  and name = 'Tsundere girl';

update characters
set alias = 'Sam'
where (alias is null or btrim(alias) = '')
  and name = 'Childhood bestfriend';

update characters
set alias = 'Dr. Mira Vance'
where (alias is null or btrim(alias) = '')
  and name = 'Your therapist';

update characters
set alias = 'Kael'
where (alias is null or btrim(alias) = '')
  and name = 'Your wolfman bestfriend';

-- 2) Heuristic extraction from persona prefix:
--    "You are <Name>, ..." -> alias = <Name>
-- Only accept reasonable short candidates to avoid bad aliases.
with extracted as (
  select
    id,
    btrim(substring(persona from '(?i)^You are\\s+([^,\\.\\n]+)')) as candidate
  from characters
)
update characters c
set alias = e.candidate
from extracted e
where c.id = e.id
  and (c.alias is null or btrim(c.alias) = '')
  and e.candidate is not null
  and length(e.candidate) between 2 and 48
  and e.candidate !~* 'user|assistant|character|friend|therapist'
  and e.candidate ~ '[A-Za-z]';

-- 3) Final fallback: alias = name for anything still empty.
update characters
set alias = name
where alias is null or btrim(alias) = '';

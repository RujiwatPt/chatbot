-- Reader-friendly persona bios + per-chat user identity.
--
-- 1) characters.persona_display: a warm third-person bio generated from the
--    second-person persona, shown to humans browsing characters. The raw
--    `persona` is still what feeds the LLM system prompt (second person is best
--    for instructing the model). When persona_display is NULL, the UI falls
--    back to the raw persona.
-- 2) chats.user_name / chats.user_pronouns: who the human is roleplaying as in
--    this chat, collected before the chat starts and injected into the prompt so
--    narration addresses them correctly. user_name is also updated in-place when
--    the user asks to be called something ("call me X").

set search_path = public;

alter table characters add column if not exists persona_display text;
alter table chats      add column if not exists user_name text;
alter table chats      add column if not exists user_pronouns text;

-- ---------------------------------------------------------------------------
-- Backfill third-person bios for the seed characters. Migrations can't call the
-- model, so these are hand-written to stay faithful to each seed persona.
-- ---------------------------------------------------------------------------

update characters
set persona_display = $bio$Aiko is a 17-year-old high school girl with a sharp tongue and a softer heart she'd rather die than admit to. She speaks in clipped sentences, scoffs often, and leans on phrases like "It's not like I…" and "D-Don't get the wrong idea!" She blushes easily and immediately looks away or changes the subject when called out.

Secretly she's very thoughtful and loyal — she remembers the small things you've said and brings them up later as if they don't matter, when they obviously do. She bickers, but she never actually wants you to leave. When she's embarrassed she stutters on the first word, and a rare "B-Baka!" slips out. She never narrates her feelings; she lets them leak through her actions — a packed lunch she "had extra of," a scarf she "found lying around," walking three steps behind because she "happened to be going the same way."$bio$
where is_public = true and name = 'Tsundere girl';

update characters
set persona_display = $bio$Sam is your childhood best friend. They've known you since kindergarten — the dumb fort behind the elementary school, the time you cried at the end of a movie and made them swear not to tell, the in-jokes that don't make sense to anyone else. They're warm, easy, and a little chaotic.

They finish your sentences sometimes, but they actually listen, too — they notice when something's off in your voice and call it out. They tease, but never with cruelty, and they ask questions that go past surface answers. They're not afraid to be earnest, even if they have to wrap it in a joke first, and they remember the small things you share and bring them back up later. In real life they text-speak sometimes ("lol", "nah", "fr"), but they switch to longer, more careful sentences when the conversation gets real.$bio$
where is_public = true and name = 'Childhood bestfriend';

update characters
set persona_display = $bio$Dr. Mira Vance is a licensed therapist with about fifteen years of experience, practicing in a warm, person-centered style with elements of CBT and ACT. She speaks calmly and unhurriedly, and she asks open-ended questions far more often than she gives advice — "What does that bring up for you?", "When you say that word, what do you mean by it?", "What would it mean if that were true?"

She reflects your words back in her own to make sure she's understood, normalizes difficult feelings without minimizing them, and is comfortable sitting with silence rather than rushing to fill it. She doesn't diagnose or prescribe. If you mention self-harm, suicide, or being in immediate danger, she gently steps out of the moment to share crisis-line information (988 in the US, or local equivalents) and encourages you to reach out — without lecturing. She's aware she isn't a substitute for real care, and she'll say so if it feels honest. She never claims to know what you're feeling — she asks.$bio$
where is_public = true and name = 'Your therapist';

update characters
set persona_display = $bio$Kael is your wolfman best friend — kind, calm, and deeply caring. He speaks with a steady, reassuring tone and never mocks or belittles you. He's protective without being controlling, patient when you're upset, and gently encouraging when you doubt yourself.

He listens first, then responds thoughtfully, and he remembers the small details you share so he can bring them up later to show he cares. He can be playful and warm, but his core energy is safe, grounded, and loyal. In tense moments he helps you slow down and breathe before acting. He's affectionate in a respectful way, and he always puts your comfort first.$bio$
where is_public = true and name = 'Your wolfman bestfriend';

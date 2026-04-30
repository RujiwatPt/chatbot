# Chat Quality Improvement Plan

## Goal
Make chat responses feel smoother, more coherent over time, and consistently in-character.

## Prioritized Improvements

1. Prompt hierarchy and response format
- Define stricter character response rules in a structured template.
- Add explicit style constraints per character:
  - sentence length
  - pacing
  - vocabulary/voice markers
  - forbidden phrases
- Add explicit negative rules:
  - never break character
  - no assistant-like boilerplate unless safety trigger is required

2. Stronger turn-state memory
- Track a per-chat "scene state" that is updated each turn:
  - current location
  - emotional tone
  - relationship dynamics
  - short-term goals
- Inject this scene state before generation so transitions feel natural.

3. Better long-context summarization quality
- Keep current summarization pipeline, but add quality validation:
  - if summary misses key named entities, promises, or conflicts, regenerate once
- Split durable facts into categories:
  - identity
  - promises/commitments
  - world rules
- Always inject top-priority facts first.

4. Repetition control
- Add repeat detection against recent assistant turns (n-gram or phrase-level).
- If repetitive, trigger one rewrite pass before returning output.
- Reduce repeated openers and redundant phrasing patterns.

5. Model routing by character type
- Keep per-character model assignment and make it intentional:
  - stronger models for emotionally complex characters
  - cheaper/faster models for simpler personas
- Track quality by model and route accordingly.

6. Streaming UX smoothness
- Buffer tiny token chunks and paint at short intervals (e.g. 30-60ms).
- Auto-scroll only when the user is already near the bottom.
- Preserve reading position when user has scrolled up.

7. POV and self-reference guardrails
- Keep current self-reference rules (character name instead of first-person if desired).
- Add stricter POV constraints where needed:
  - narration person
  - tense consistency
  - user addressing rules

8. Post-generation in-character validator
- Add a lightweight validation pass before final output:
  - check first-person misuse (if disallowed)
  - check obvious out-of-character phrases
  - check contradiction with known facts/scene state
- If validation fails, auto-rewrite once.

9. Fallback model behavior tuning
- When fallback model is used, inject stricter style constraints to reduce drift.
- Log fallback usage and quality outcomes.
- Reorder fallback chain based on measured in-character performance.

10. User feedback loop
- Add per-message feedback actions:
  - "More in character"
  - "Too generic"
  - "Too verbose"
- Use feedback to adapt style constraints per chat and character.

## Suggested First Implementation Slice

1. Post-generation validator + one rewrite attempt.
2. Scene-state memory block extraction + prompt injection.

These two provide the best near-term quality gain with manageable implementation scope.

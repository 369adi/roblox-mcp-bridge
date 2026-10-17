# Spawn, Character Lifecycle and Cleanup — detailed checklist

## Before work
- [ ] Confirm scope and target place/project.
- [ ] Search for existing implementation and reuse requirements.
- [ ] Identify dependencies, owners and risky operations.
- [ ] Confirm required tools are actually available.

## During work
- [ ] Keep the implementation focused on the requested result.
- [ ] Preserve naming, architecture and required objects.
- [ ] Validate all untrusted input and relevant state transitions.
- [ ] Avoid unnecessary instances, loops, requests and duplicate systems.
- [ ] Record real blockers instead of bypassing them with guesses.

## Before reporting done
- [ ] Check the intended behavior and important edge cases.
- [ ] Check cleanup, retries and failure behavior where applicable.
- [ ] Verify the output artifact or changed instance if the tool supports it.
- [ ] List tests actually performed and tests not possible.
- [ ] List remaining limitations and the next useful step.

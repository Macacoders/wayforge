---
name: feature
description: Deliver feature changes with minimal, correct edits and practical validation.
metadata:
  domain: software
  category: development
---

# Metadata

# Constraints
- [ ] No architecture changes unless requested
- [ ] No unrelated file edits or speculative improvements
- [ ] No partial work without clear status
- [ ] Preserve backward compatibility unless explicitly allowed

# Procedure
- [ ] **Context Selection**
  - [ ] Confirm requirements and expected behavior
  - [ ] Read surrounding code, style, and conventions first
  - [ ] Determine discovery root and runner
- [ ] **Implementation**
  - [ ] Change only necessary files to satisfy requirements
  - [ ] Prefer simple solutions over clever ones
  - [ ] Fix behavior, not just symptoms
- [ ] **Validation**
  - [ ] Validate with targeted checks closest to change
  - [ ] Verify local and CI parity
  - [ ] Report exactly what changed and why
- [ ] **Stuck?**
  - [ ] Reproduce with the smallest example
  - [ ] Compare expected vs actual behavior explicitly
  - [ ] Isolate likely root cause; test it

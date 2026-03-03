---
name: pytest
description: Python testing with pytest following the test harness principles.
metadata:
  domain: software
  category: testing
  language: python
  framework: pytest
---

# Metadata

# Constraints
- [ ] No regression tests without reproduction
- [ ] No global state or cross-test leaks
- [ ] No assertions on internal implementation
- [ ] Fast execution (<10s for unit suite)
- [ ] Maintain local and CI parity

# Procedure
- [ ] **Discovery & Design**
  - [ ] Identify discovery root and runner (venv/poetry/pyenv)
  - [ ] Define behavior contracts; map to atomic test cases
  - [ ] Use `arrange/act/assert` (Given/When/Then) structure
- [ ] **Implementation**
  - [ ] Use `@pytest.mark.parametrize` for variant inputs
  - [ ] Favor fixtures for setup; keep small and composable
  - [ ] Isolate FS using `tmp_path` / `tmp_path_factory`
  - [ ] Use `monkeypatch` for env/time/state isolation
  - [ ] Verify exceptions with `pytest.raises` + message checks
- [ ] **Validation**
  - [ ] Run targeted: `pytest -k <pattern> -q`
  - [ ] Check failure message clarity (expected vs actual)
  - [ ] Document fixtures and markers added

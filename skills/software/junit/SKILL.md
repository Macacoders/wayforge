---
name: junit
description: Java testing with JUnit following the test harness principles.
metadata:
  domain: software
  category: testing
  language: java
  framework: junit
---

# Metadata

# Constraints
- [ ] No regression tests without reproduction
- [ ] No global state or cross-test leaks
- [ ] No assertions on internal implementation
- [ ] Maintain local and CI parity
- [ ] No order-dependence across executed tests

# Procedure
- [ ] **Discovery & Design**
  - [ ] Identify build tool (Maven/Gradle) and JUnit version (4/5)
  - [ ] Identify test discovery (Surefire/Failsafe)
  - [ ] Define behavior contracts; map to atomic test cases
- [ ] **Implementation**
  - [ ] Use JUnit 5 idioms: `@Test`, `@BeforeEach`, `@ParameterizedTest`, `@TempDir`
  - [ ] Favor @ParameterizedTest for input variants
  - [ ] Avoid shared mutable fixtures; prefer per-test setup
  - [ ] Isolate FS: use `@TempDir` for isolation
  - [ ] Use injectable clocks/Mockito for units at boundaries
  - [ ] Verify exceptions with `assertThrows` + message check
- [ ] **Validation**
  - [ ] Run targeted: `mvn -Dtest=... test` or Gradle equivalent
  - [ ] Check failure message clarity (assert messages)
  - [ ] Split unit vs integration tests if supported

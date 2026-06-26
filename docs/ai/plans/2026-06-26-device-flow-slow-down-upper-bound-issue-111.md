# Plan: Add upper bound on device flow slow_down polling interval (Issue #111)

## Goal

Add upper bounds and visibility to the device flow `slow_down` polling in `gh-app-auth.ts` (`doDeviceFlow()`) so the interval can't grow unbounded, the user gets feedback during throttling, and repeated throttling eventually fails with a clear error.

## Scope

Single-phase. All changes localized to `doDeviceFlow()` in `gh-app-auth.ts` and its test file.

## Constants

- `MAX_POLL_INTERVAL_MS = 30_000` (30s cap, as suggested in the issue)
- `MAX_POLL_RETRIES = 60` (at 5s min interval = ~5 min theoretical polling, well within the 15-min device code expiry)

## Phase

### Phase 1: Implement upper bounds, logging, and retry limit

**Acceptance criteria:**
- [ ] `pollIntervalMs` never exceeds 30 seconds, even with repeated `slow_down`
- [ ] A `logInfo()` message is emitted to stderr on each `slow_down`
- [ ] After 60 polling attempts, a clear error is thrown
- [ ] Existing tests pass, new tests cover cap, retry limit, and logging
- [ ] Type-check clean, `make check` relevant subset passes

## Decisions

- ADR-0016 will be amended with a consequence bullet for the slow_down upper bound.

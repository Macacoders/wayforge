.PHONY: install-deps check check-bash check-powershell check-tests check-ts check-bats check-pester coverage check-duplication fix-bash

install-deps:
	./qa/install-deps

# ponytail: pure forwarding wrapper — inline sub-commands directly (rung 2)
check:
	./qa/check

check-bash:
	./qa/check-bash

check-powershell:
	./qa/check-powershell

# ponytail: pure forwarding wrapper — inline sub-commands directly (rung 2)
check-tests:
	./qa/check-tests

# ponytail: one-liner wrapper — inline `npx vitest run` directly (rung 6)
check-ts:
	./qa/check-ts

check-bats:
	./qa/check-bats

check-pester:
	./qa/check-pester

# ponytail: pure forwarding wrapper — inline sub-commands directly (rung 2)
coverage:
	./qa/coverage

check-duplication:
	./qa/check-duplication

fix-bash:
	./qa/fix-bash

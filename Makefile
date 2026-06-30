.PHONY: install-deps check check-bash check-powershell check-tests check-ts check-bats check-pester coverage check-duplication fix-bash

install-deps:
	./qa/install-deps

check:
	./qa/check

check-bash:
	./qa/check-bash

check-powershell:
	./qa/check-powershell

check-tests:
	./qa/check-tests

check-ts:
	./qa/check-ts

check-bats:
	./qa/check-bats

check-pester:
	./qa/check-pester

coverage:
	./qa/coverage

check-duplication:
	./qa/check-duplication

fix-bash:
	./qa/fix-bash

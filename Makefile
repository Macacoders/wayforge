.PHONY: install-deps check qa check-bash check-powershell check-tests check-bats check-pester coverage coverage-bash coverage-powershell check-duplication fix-bash bash-format bash-lint

install-deps:
	./qa/install-deps

check:
	./qa/check

qa:
	./qa/check

check-bash:
	./qa/check-bash

check-powershell:
	./qa/check-powershell

check-tests:
	./qa/check-tests

check-bats:
	./qa/check-bats

check-pester:
	./qa/check-pester

coverage:
	./qa/coverage

coverage-bash:
	./qa/coverage-bash

coverage-powershell:
	./qa/coverage-powershell

check-duplication:
	./qa/check-duplication

fix-bash:
	./qa/fix-bash

bash-format:
	./qa/fix-bash

bash-lint:
	./qa/check-bash

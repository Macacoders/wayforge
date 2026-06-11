.PHONY: install-deps check qa check-bash check-powershell check-duplication fix-bash bash-format bash-lint

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

check-duplication:
	./qa/check-duplication

fix-bash:
	./qa/fix-bash

bash-format:
	./qa/fix-bash

bash-lint:
	./qa/check-bash

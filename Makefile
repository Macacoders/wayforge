.PHONY: install-deps check check-bash check-powershell check-tests check-ts check-node check-integration check-bats check-pester coverage check-duplication fix-bash fix-node cli-binary

install-deps:
	./qa/install-deps

cli-binary:
	@mkdir -p dist
	@OS=$$(uname -s | tr '[:upper:]' '[:lower:]'); \
	ARCH=$$(uname -m); \
	case "$$ARCH" in \
		x86_64|amd64)  ARCH="x64" ;; \
		aarch64|arm64) ARCH="arm64" ;; \
		*)             echo "error: unsupported architecture: $$ARCH" >&2; exit 1 ;; \
	esac; \
	case "$$OS" in \
		linux)  ;; \
		darwin) ;; \
		*)      echo "error: unsupported OS: $$OS" >&2; exit 1 ;; \
	esac; \
	bun build ./cli/src/index.ts --compile --outfile "dist/ai-config-$$OS-$$ARCH" --define "process.env.AI_CONFIG_VERSION:$$(cat VERSION)"

# Bash/PowerShell lint checks deprecated (YAGNI) — installer migrated to TypeScript CLI
check:
	@echo "==> TypeScript tests"
	npx vitest run
	@echo "==> Node checks"
	@$(MAKE) check-node
	@echo "==> Duplication checks"
	@$(MAKE) check-duplication
	@echo "==> All checks passed"

# deprecated — installer migrated to TypeScript CLI; still available for shell script maintenance
check-bash:
	./qa/check-bash

# deprecated — PowerShell scripts being migrated to TypeScript
check-powershell:
	./qa/check-powershell

check-tests:
	@echo "==> Bash tests"
	./qa/check-bats
	@echo "==> PowerShell tests"
	./qa/check-pester
	@echo "==> TypeScript tests"
	npx vitest run
	@echo "==> Integration tests"
	@$(MAKE) check-integration
	@echo "Tests passed."

check-ts:
	npx vitest run

check-node:
	@echo "==> TypeScript type check"
	@cd cli && npx tsc --noEmit
	@echo "==> ESLint"
	@cd cli && npx eslint src/
	@echo "==> Prettier"
	@cd cli && npx prettier --check src/
	@echo "Node checks passed."

fix-node:
	@echo "==> Auto-fixing ESLint issues"
	@cd cli && npx eslint --fix src/
	@echo "==> Formatting with Prettier"
	@cd cli && npx prettier --write src/
	@echo "Node fixes applied."

check-integration:
	cli/tests/integration/run.sh

check-bats:
	./qa/check-bats

check-pester:
	./qa/check-pester

coverage:
	@echo "==> Bash coverage"
	./qa/coverage-bash
	@echo "==> PowerShell coverage"
	./qa/coverage-powershell
	@echo "Coverage checks completed."

check-duplication:
	npx --yes jscpd --pattern "**/*.ts" --ignore "**/.git/**" --ignore "**/node_modules/**" --ignore "**/base/**" --threshold 8 --min-lines 8 --reporters console

fix-bash:
	./qa/fix-bash

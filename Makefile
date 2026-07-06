.PHONY: install-deps check check-bash check-powershell check-tests check-ts check-bats check-pester coverage check-duplication fix-bash cli-binary

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

# ponytail: resolved rung 2 — forwarding scripts inlined; qa/check deleted
# Bash/PowerShell lint checks deprecated (YAGNI) — installer migrated to TypeScript CLI
check:
	@echo "==> TypeScript tests"
	npx vitest run
	@echo "==> Duplication checks"
	./qa/check-duplication
	@echo "==> All checks passed"

# deprecated — installer migrated to TypeScript CLI; still available for shell script maintenance
check-bash:
	./qa/check-bash

# deprecated — PowerShell scripts being migrated to TypeScript
check-powershell:
	./qa/check-powershell

# ponytail: resolved rung 2 — forwarding script inlined; qa/check-tests deleted
check-tests:
	@echo "==> Bash tests"
	./qa/check-bats
	@echo "==> PowerShell tests"
	./qa/check-pester
	@echo "==> TypeScript tests"
	npx vitest run
	@echo "Tests passed."

# ponytail: one-liner wrapper — inline `npx vitest run` directly (rung 6)
check-ts:
	./qa/check-ts

check-bats:
	./qa/check-bats

check-pester:
	./qa/check-pester

# ponytail: resolved rung 2 — forwarding script inlined; qa/coverage deleted
coverage:
	@echo "==> Bash coverage"
	./qa/coverage-bash
	@echo "==> PowerShell coverage"
	./qa/coverage-powershell
	@echo "Coverage checks completed."

check-duplication:
	./qa/check-duplication

fix-bash:
	./qa/fix-bash

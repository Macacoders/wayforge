---
name: docker-service-deploy
description: Deploy or modify Docker/Compose services safely with health checks, minimal downtime, and rollback readiness.
user-invokable: true
license: MIT
metadata:
  domain: infrastructure
  category: docker
  framework: docker-compose
  depends_on: infra-change-core
  risk-level: medium
argument-hint: "Provide service name(s), compose file path, ports, env vars/secrets method, and desired change (deploy/update/rollback)."
---

# Skill: Docker Service Deploy

## Composition rule

Apply `infra-change-core` first. Then apply the Docker-specific guidance below.

## Trigger (when to use)

Use this skill when deploying, updating, or troubleshooting a Docker (or Docker Compose) service.

## Inputs expected

- Service name(s) and compose/project path.
- Desired action (deploy/update/rollback).
- Image source and version pin (tag/digest).
- Ports, networks, volumes, and persistence expectations.
- Secrets/env strategy (.env, secrets, external provider).
- Health check / readiness definition.
- Downtime tolerance.

## Procedure

1. Confirm target host(s), docker context, and compose project path.
2. Capture baseline:
   - `docker ps`, `docker compose ps`
   - current image versions
   - relevant logs and health status
3. Validate configuration:
   - `docker compose config`
   - check env vars resolve as expected
4. Ensure safety properties:
   - images pinned (tag policy or digest)
   - healthchecks defined for critical services
   - volumes mapped correctly for persistent data
   - resource limits set where appropriate
5. Pull/build explicitly and review what will change.
6. Apply change with minimal disruption:
   - prefer `docker compose up -d` for updates
   - avoid deleting volumes unless explicitly intended
7. Verify service readiness:
   - container health
   - port reachability
   - application-level probe (HTTP endpoint / CLI ping)
8. Check logs for startup errors and configuration warnings.
9. If change fails, rollback:
   - revert compose change / image tag
   - `docker compose up -d`
10. Post-check:
   - confirm stable health over a short observation window
   - confirm dependent services connectivity
11. Record change note:
   - compose diff summary
   - images (tags/digests)
   - commands run
   - verification evidence

## Output template

- Services targeted:
  - <names + compose path>
- Baseline:
  - <images, health, key logs>
- Change applied:
  - <what changed: env/image/ports/volumes>
- Verification:
  - <health + probe results>
- Rollback:
  - <steps + whether used>
- Notes:
  - <follow-ups, hardening>

## Common failure modes

- Updating multiple services without isolating the change.
- Using floating tags (e.g., `latest`) causing non-reproducible deployments.
- Missing healthchecks leading to “up but broken” state.
- Accidental volume removal/data loss.
- Misconfigured networks (service-to-service DNS resolution).
- Secrets/env mismatch between local and host environment.
- Not checking logs after deployment.

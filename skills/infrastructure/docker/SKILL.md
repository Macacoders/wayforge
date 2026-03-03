---
name: docker
description: Safe Docker service deployment and management.
metadata:
  domain: infrastructure
  category: container
  framework: docker
---

# Metadata
# Constraints
- [ ] No floating tags (e.g., :latest) in production
- [ ] No intrusive changes without healthchecks
- [ ] No accidental volume or data removal
- [ ] Maintain network isolation and DNS resolution

# Procedure
- [ ] **Preparation**
  - [ ] Confirm docker-compose path and host environment
  - [ ] Capture baseline: current images, host resources, and logs
- [ ] **Deployment**
  - [ ] Update images/env; use explicit tags or digests
  - [ ] Run: `docker-compose up -d --remove-orphans`
  - [ ] Monitor: `docker-compose ps` and `docker logs -f`
- [ ] **Validation**
  - [ ] Verify health: `docker inspect -f '{{.State.Health.Status}}'`
  - [ ] Test endpoint/connectivity; check error logs
- [ ] **Rollback**
  - [ ] Revert image/config to baseline tag
  - [ ] Run: `docker-compose up -d`
  - [ ] Verify restoration of health

---
name: kubernetes
description: Safe Kubernetes rollouts and workload management.
metadata:
  domain: infrastructure
  category: kubernetes
  framework: kubernetes
---

# Metadata
# Constraints
- [ ] No rollouts without meaningful readiness probes
- [ ] No changes across multiple clusters simultaneously
- [ ] No deployments without checking `kubectl events`
- [ ] Maintain PDB/HPA compatibility

# Procedure
- [ ] **Preparation**
  - [ ] Confirm `current-context` and namespace
  - [ ] Baseline: replicas, images, and pod health
  - [ ] Validate manifests: `helm template` or `kustomize build`
- [ ] **Rollout**
  - [ ] Apply: `kubectl apply -f` or `helm upgrade`
  - [ ] Monitor: `kubectl rollout status` and `kubectl get pods -w`
  - [ ] Stop-the-line: if readiness fails, do not proceed
- [ ] **Validation**
  - [ ] Check logs: `kubectl logs --previous` for crash loops
  - [ ] Verify app behavior via endpoint or metrics
- [ ] **Rollback**
  - [ ] Run: `kubectl rollout undo` or `helm rollback`
  - [ ] Re-verify baseline pod health

---
name: kubernetes-rollout-safe
description: Perform safe Kubernetes rollouts with readiness checks, progressive verification, and rollback procedures.
user-invokable: true
license: MIT
metadata:
  domain: infrastructure
  category: kubernetes
  framework: kubernetes
  depends_on: infra-change-core
  risk-level: high
argument-hint: "Provide namespace, workload (Deployment/StatefulSet), image change or manifest/helm change, and verification endpoint/criteria."
---

# Skill: Kubernetes Rollout Safe

## Composition rule

Apply `infra-change-core` first. Then apply the Kubernetes-specific guidance below.

## Trigger (when to use)

Use this skill when updating Kubernetes workloads (Deployments/StatefulSets/DaemonSets), applying manifests, or performing rollouts in clusters.

## Inputs expected

- Cluster context and namespace.
- Workload name/type and change type (image/manifest/helm/kustomize).
- Readiness/liveness probes and acceptance checks (endpoint/metrics/log signals).
- Rollout strategy requirements (maxUnavailable/maxSurge, canary if applicable).
- Dependencies (services, ingress, DNS, secrets, configmaps).
- Access level (kubectl, helm) and policy constraints.

## Procedure

1. Confirm cluster context and namespace:
   - `kubectl config current-context`
   - `kubectl get ns`
2. Capture baseline:
   - `kubectl get deploy,sts,ds -n <ns>`
   - `kubectl describe <workload> -n <ns>`
   - current images, replicas, probe config
3. Validate change artifact:
   - manifests render cleanly (helm template/kustomize build if used)
   - check for configmap/secret references
4. Check rollout safety settings:
   - readiness probes exist and are meaningful
   - strategy parameters set (surge/unavailable)
   - PDB/HPA interactions understood
5. Apply change:
   - `kubectl apply -f ...` or `helm upgrade ...`
   - or `kubectl set image ...` when appropriate
6. Observe rollout:
   - `kubectl rollout status <workload> -n <ns>`
   - `kubectl get pods -n <ns> -w`
7. Verify application-level behavior:
   - probe endpoint, key API call, or synthetic check
   - check error rates/latency if available
8. Inspect failures quickly:
   - `kubectl describe pod ...`
   - `kubectl logs ... --previous` for crash loops
9. Stop-the-line rule:
   - if readiness fails or error budget is exceeded, do not continue changes
10. Rollback plan:
   - `kubectl rollout undo <workload> -n <ns>` (Deployments)
   - helm rollback if using Helm
   - re-verify baseline health
11. Post-check:
   - verify stable state after rollout (short observation window)
   - verify dependencies (service discovery, ingress, DNS, network policies)
12. Record change note:
   - applied diff (image tag/digest, chart version, manifest hash)
   - rollout timeline + evidence
   - rollback readiness and outcome

## Output template

- Target:
  - cluster/context, namespace, workload
- Baseline:
  - replicas, images, probes, key dependencies
- Change applied:
  - <image/manifest/helm details>
- Rollout observation:
  - <status + notable events>
- Verification:
  - <app-level checks + metrics/log evidence>
- Rollback:
  - <plan + whether executed>
- Notes:
  - <follow-ups, hardening>

## Common failure modes

- Wrong cluster context/namespace.
- Missing or meaningless readiness probes.
- Ignoring PDB/HPA interactions and causing cascading issues.
- Not checking events/logs for crash loops.
- Applying multiple changes before verifying the first.
- Assuming “rollout complete” equals “service healthy”.
- No rollback prepared (or helm history unavailable).

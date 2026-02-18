---
name: troubleshoot-connectivity
description: Structured, reproducible procedure for diagnosing connectivity failures across hosts, containers, and clusters.
user-invokable: true
license: MIT
metadata:
  domain: networking
  category: diagnostics
  risk-level: medium
---

# Skill: Troubleshoot Connectivity

## Trigger (when to use)

Use this skill for diagnosing connectivity failures between services, hosts, or network segments in development, lab, or production-like environments.

## Inputs expected

- Source and destination endpoints (IP/DNS/port/protocol).
- Environment context (local, container, VM, cluster, testbed).
- Recent changes (routing, firewall, DNS, certificates, deploys).
- Access level and available diagnostic tools.

## Procedure

1. Define the exact failing path: source -> destination.
2. Confirm failure symptoms, time window, and recent changes.
3. Classify severity (impact scope, users affected).
4. Preserve relevant logs or observable state before changes.
5. Resolve DNS names from source context (namespace/container aware).
6. Validate local interface status and routes.
7. Test basic reachability (`ping` or equivalent where allowed).
8. Test transport path (`nc`, `curl`, `telnet`, or app probe).
9. Check local and network firewall/policy rules.
10. Compare with a known-good source or destination.
11. Inspect server listen state and bound interfaces.
12. Verify TLS/certificate issues separately from TCP reachability.
13. Check NAT/proxy/load-balancer behavior when present.
14. Correlate application logs with connection attempts.
15. Capture minimal scoped packet sample only if prior steps are inconclusive.
16. Form one root-cause hypothesis at a time (confirmed vs probable).
17. Apply minimal reversible mitigation.
18. Re-test end-to-end after each change.
19. Record confirmed or most probable root cause and preventive control.
20. Publish incident note with commands and evidence.

## Output template

- Symptom summary:
  - <what fails, from where, since when>
- Severity:
  - <low/medium/high + rationale>
- Checks performed:
  - C1: <check + result>
  - C2: <check + result>
- Root cause:
  - <confirmed or most probable cause>
- Mitigation:
  - <action + rollback plan>
- Verification:
  - <post-fix evidence>
- Prevention:
  - <monitoring/guardrail updates>

## Common failure modes

- Skipping path scoping and testing wrong endpoint.
- Conflating DNS, routing, and application failures.
- Assuming ICMP behavior proves TCP availability.
- Missing namespace/context differences (host vs container vs pod).
- Applying multiple changes without isolation.
- Fixing symptom locally while policy remains broken.
- No rollback strategy for mitigation steps.
- Poor incident notes that block future diagnosis.

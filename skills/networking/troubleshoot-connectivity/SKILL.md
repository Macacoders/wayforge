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
2. Confirm failure symptoms and time window.
3. Resolve DNS names from source context.
4. Validate local interface status and routes.
5. Test basic reachability (`ping` or equivalent where allowed).
6. Test transport path (`nc`, `curl`, `telnet`, or app probe).
7. Check local and network firewall/policy rules.
8. Compare with a known-good source or destination.
9. Inspect server listen state and bound interfaces.
10. Verify TLS/certificate issues separately from TCP reachability.
11. Check NAT/proxy/load-balancer behavior when present.
12. Correlate application logs with connection attempts.
13. Capture packet sample only if prior steps are inconclusive.
14. Form one root-cause hypothesis at a time.
15. Apply minimal reversible mitigation.
16. Re-test end-to-end after each change.
17. Record final root cause and preventive control.
18. Publish incident note with commands and evidence.

## Output template

- Symptom summary:
  - <what fails, from where, since when>
- Checks performed:
  - C1: <check + result>
  - C2: <check + result>
- Root cause:
  - <most likely confirmed cause>
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
- Missing source-context differences (host vs container).
- Applying multiple changes without isolation.
- Fixing symptom locally while policy remains broken.
- No rollback strategy for mitigation steps.
- Poor incident notes that block future diagnosis.

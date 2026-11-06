#!/usr/bin/env python3
"""Human-supervised, one-attempt BenchFlow/Wayforge interface probe.

Run with the Python interpreter of the pinned BenchFlow 0.6.3 installation.
The dedicated Zen key is read from a private file, never from an argument.
"""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import fields
from importlib.metadata import version
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import traceback


OPENCODE_VERSION = "1.18.35"
MODEL = "opencode/mimo-v2.6-flash-free"
FREE_MODELS = {MODEL, "opencode/big-pickle", "opencode/muse-spark-1.3-contributor-free"}


def assert_free_config(path: Path) -> None:
    raw = path.read_text()
    if raw.startswith("//"):
        raw = raw.partition("\n")[2]
    config = json.loads(raw)
    if config.get("enabled_providers") != ["opencode"]:
        raise RuntimeError("Probe config must enable only OpenCode Zen")
    if config.get("model") != MODEL or config.get("small_model") != MODEL:
        raise RuntimeError("Probe root and small_model must use the pinned free model")
    if config.get("default_agent") != "delivery":
        raise RuntimeError("Probe entry agent must be delivery")
    agents = config.get("agent")
    if not isinstance(agents, dict):
        raise RuntimeError("Probe agent config is missing")
    for name, agent in agents.items():
        if not isinstance(agent, dict) or (agent.get("model") and agent["model"] not in FREE_MODELS):
            raise RuntimeError(f"Probe agent {name} is not pinned to a free model")


def scrub_host_credentials() -> None:
    prefixes = (
        "AWS_", "AZURE_", "GOOGLE_", "OPENAI_", "ANTHROPIC_",
        "OPENCODE_", "CODEX_", "GH_", "GITHUB_", "NPM_", "UV_INDEX_",
        "PIP_INDEX_",
    )
    suffixes = ("_API_KEY", "_TOKEN", "_SECRET", "_PASSWORD", "_CREDENTIALS")
    for name in list(os.environ):
        if name.startswith(prefixes) or name.endswith(suffixes):
            del os.environ[name]


def private_key(path: Path) -> str:
    mode = path.stat().st_mode
    if not stat.S_ISREG(mode) or mode & 0o077 or path.stat().st_uid != os.getuid():
        raise RuntimeError("Key file must be a regular file owned by you, mode 0600")
    key = path.read_text().strip()
    if not key or "\n" in key:
        raise RuntimeError("Key file must contain one API key")
    return key


def assert_key_absent(root: Path, key: str) -> None:
    needle = key.encode()
    for file in root.rglob("*"):
        if not file.is_file():
            continue
        with file.open("rb") as stream:
            overlap = b""
            while chunk := stream.read(1024 * 1024):
                if needle in overlap + chunk:
                    raise RuntimeError(f"Raw key found in private pilot output: {file}")
                overlap = chunk[-(len(needle) - 1):] if len(needle) > 1 else b""


def inspect_container(sandbox_id: str, key: str, jobs_dir: Path) -> None:
    assert_key_absent(jobs_dir, key)
    result = subprocess.run(
        ["docker", "inspect", sandbox_id], capture_output=True, text=True, check=True
    )
    data = json.loads(result.stdout)[0]
    host = data["HostConfig"]
    mounts = data.get("Mounts", [])
    if host.get("Privileged") or host.get("PidMode") == "host":
        raise RuntimeError("Container is privileged or shares the host PID namespace")
    if host.get("NetworkMode") == "host":
        raise RuntimeError("Container shares the host network namespace")
    for mount in mounts:
        source = mount.get("Source", "")
        if source in ("/", "/home", "/root", "/etc") or "docker.sock" in source:
            raise RuntimeError(f"Unsafe container mount: {source}")
    summary = {
        "container": sandbox_id,
        "image": data["Config"].get("Image"),
        "user": data["Config"].get("User"),
        "network_mode": host.get("NetworkMode"),
        "cap_add": host.get("CapAdd"),
        "security_opt": host.get("SecurityOpt"),
        "mounts": [
            {"source": m.get("Source"), "destination": m.get("Destination"), "rw": m.get("RW")}
            for m in mounts
        ],
        "environment_names": [x.split("=", 1)[0] for x in data["Config"].get("Env", [])],
    }
    print(json.dumps(summary, indent=2), flush=True)
    answer = input(
        "After checking mounts and the dedicated key's zero-paid-use limit, "
        "type RUN FREE PILOT: "
    )
    if answer != "RUN FREE PILOT":
        raise RuntimeError("Pilot cancelled before agent installation")


async def main_container_id(env: object) -> str:
    # DockerSandbox.sandbox_id is intentionally None in BenchFlow 0.6.3.
    # The main Compose service ID is available through this pinned method.
    method = getattr(env, "_main_container_id", None)
    if not callable(method):
        raise RuntimeError("Unexpected BenchFlow Docker sandbox interface")
    container_id = await method()
    if not container_id:
        raise RuntimeError("BenchFlow did not resolve its main Docker container")
    return container_id


async def check_summary_helper(env: object) -> None:
    """Prove the exact task container can run the evidence helper before model use."""
    await env.upload_file(Path(__file__).resolve(), "/opt/benchflow/session-probe.py")
    permissions = await env.exec(
        "chmod 644 /opt/benchflow/session-probe.py", user="root", timeout_sec=10
    )
    if permissions.return_code:
        raise RuntimeError("Could not install session evidence helper")
    probe = await env.exec(
        "printf '%s' '{\"info\":{\"id\":\"ses_probe\",\"agent\":\"delivery\"},\"messages\":[]}' "
        "| python3 /opt/benchflow/session-probe.py --summarize-export",
        user="root", timeout_sec=15,
    )
    if probe.return_code:
        raise RuntimeError(
            f"Session evidence helper failed its container preflight "
            f"(exit {probe.return_code}; stdout bytes {len((probe.stdout or '').encode())}; "
            f"stderr lines {len((probe.stderr or '').splitlines())})"
        )
    try:
        evidence = json.loads(probe.stdout or "")
    except json.JSONDecodeError as exc:
        raise RuntimeError("Session evidence helper emitted invalid JSON") from exc
    if evidence.get("session_id") != "ses_probe" or evidence.get("agent") != "delivery":
        raise RuntimeError("Session evidence helper emitted unexpected metadata")


def parse_opencode_export(stdout: str) -> dict[str, object]:
    start = stdout.find("{")
    if start < 0:
        raise ValueError("OpenCode export did not contain JSON")
    data = json.loads(stdout[start:])
    if not isinstance(data, dict) or not isinstance(data.get("messages"), list):
        raise ValueError("OpenCode export had an unexpected shape")
    return data


def parse_summary_output(stdout: str) -> dict[str, object]:
    """Accept a JSON summary even when the exec wrapper prefixes status text."""
    decoder = json.JSONDecoder()
    offset = 0
    while (start := stdout.find("{", offset)) >= 0:
        try:
            data, _ = decoder.raw_decode(stdout[start:])
        except json.JSONDecodeError:
            offset = start + 1
            continue
        if isinstance(data, dict) and isinstance(data.get("tools"), list):
            return data
        offset = start + 1
    raise ValueError("No structured session summary in helper output")


def safe_identifier(value: object) -> str | None:
    if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9._:/-]{1,120}", value):
        return value
    return None


def session_evidence(data: dict[str, object]) -> dict[str, object]:
    info = data.get("info") if isinstance(data.get("info"), dict) else {}
    messages = data.get("messages") if isinstance(data.get("messages"), list) else []
    token_data = info.get("tokens") if isinstance(info.get("tokens"), dict) else {}
    cache_data = token_data.get("cache") if isinstance(token_data.get("cache"), dict) else {}
    evidence: dict[str, object] = {
        "session_id": safe_identifier(info.get("id")),
        "agent": safe_identifier(info.get("agent")),
        "version": safe_identifier(info.get("version")),
        "cost": info.get("cost") if isinstance(info.get("cost"), (int, float)) else None,
        "tokens": {
            name: token_data.get(name)
            for name in ("input", "output", "reasoning")
            if isinstance(token_data.get(name), (int, float))
        },
        "cache_tokens": {
            name: cache_data.get(name)
            for name in ("read", "write")
            if isinstance(cache_data.get(name), (int, float))
        },
        "tools": [],
    }
    for message in messages:
        if not isinstance(message, dict):
            continue
        message_info = message.get("info")
        agent = (
            safe_identifier(message_info.get("agent"))
            if isinstance(message_info, dict)
            else None
        )
        parts = message.get("parts")
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict) or part.get("type") != "tool":
                continue
            state = part.get("state") if isinstance(part.get("state"), dict) else {}
            tool_input = state.get("input") if isinstance(state.get("input"), dict) else {}
            metadata = state.get("metadata") if isinstance(state.get("metadata"), dict) else {}
            tool = safe_identifier(part.get("tool"))
            event = {
                "agent": agent,
                "tool": tool,
                "status": safe_identifier(state.get("status")),
                "skill_name": safe_identifier(tool_input.get("name")) if tool == "skill" else None,
                "target_agent": safe_identifier(
                    tool_input.get("subagent_type") or tool_input.get("agent")
                ) if tool == "task" else None,
                "child_session_id": safe_identifier(
                    metadata.get("sessionID") or metadata.get("sessionId")
                ) if tool == "task" else None,
            }
            evidence["tools"].append(event)
    return evidence


def measured_number(value: object) -> int | float | None:
    """Return a metric the runtime actually reported, else None.

    Missing or unusable data never becomes zero; a reported zero stays zero.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if value >= 0 else None


def attribute(source: object, name: str) -> object:
    return source.get(name) if isinstance(source, dict) else getattr(source, name, None)


def pick_number(*values: object) -> int | float | None:
    for value in values:
        metric = measured_number(value)
        if metric is not None:
            return metric
    return None


def usage_record(evidence: dict[str, object]) -> dict[str, object]:
    """Label one exported session's usage without inventing values."""
    tokens = evidence.get("tokens") if isinstance(evidence.get("tokens"), dict) else {}
    cache = evidence.get("cache_tokens") if isinstance(evidence.get("cache_tokens"), dict) else {}
    cost = measured_number(evidence.get("cost"))
    record: dict[str, object] = {
        "source": "session_export",
        "tokens": {
            name: measured_number(tokens.get(name))
            for name in ("input", "output", "reasoning")
        },
        "cache_tokens": {
            name: measured_number(cache.get(name)) for name in ("read", "write")
        },
        "cost_usd": str(cost) if cost is not None else None,
    }
    reported = [*record["tokens"].values(), *record["cache_tokens"].values()]
    if cost is not None and all(value is not None for value in reported):
        record["status"] = "measured"
    elif cost is not None or any(value is not None for value in reported):
        record["status"] = "partial"
    else:
        record["status"] = "unavailable"
    return record


def benchflow_usage(result: object) -> dict[str, object]:
    """Record BenchFlow's own usage view as a separate, partial source.

    BenchFlow's flattened ACP counters may omit child agents, so this record
    never replaces per-session totals and never turns "not reported" into 0.
    """
    tracking = attribute(result, "usage_tracking")
    tracking = tracking if isinstance(tracking, dict) else {}
    tokens = tracking.get("tokens") if isinstance(tracking.get("tokens"), dict) else {}
    cache = tracking.get("cache_tokens") if isinstance(tracking.get("cache_tokens"), dict) else {}
    input_tokens = pick_number(
        tokens.get("input"), tracking.get("input_tokens"), attribute(result, "n_input_tokens")
    )
    output_tokens = pick_number(
        tokens.get("output"), tracking.get("output_tokens"), attribute(result, "n_output_tokens")
    )
    cache_read = pick_number(cache.get("read"), tracking.get("cache_read_tokens"))
    cost = pick_number(tracking.get("cost_usd"), attribute(result, "cost_usd"))
    reported_status = safe_identifier(tracking.get("status"))
    # A source that declares itself unavailable is not measured, even when its
    # legacy counters carry a leftover zero from a failed extraction.
    if reported_status == "unavailable":
        status = "unavailable"
    elif None not in (input_tokens, output_tokens, cost):
        status = "measured"
    elif any(value is not None for value in (input_tokens, output_tokens, cache_read, cost)):
        status = "partial"
    else:
        status = "unavailable"
    return {
        "source": "benchflow_acp",
        "status": status,
        "reported_status": reported_status,
        "reported_source": safe_identifier(
            tracking.get("source") or tracking.get("usage_source")
        ),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_read_tokens": cache_read,
        "cost_usd": str(cost) if cost is not None else None,
    }


async def capture_sessions(env: object, jobs_dir: Path, key: str) -> dict[str, object]:
    """Export OpenCode sessions before BenchFlow removes the task container."""
    command = "/opt/benchflow/js-agents/bin/opencode"
    installed = await env.exec(
        f"{command} --version",
        user="agent",
        env={"HOME": "/home/agent"},
        timeout_sec=15,
    )
    runtime_version = (installed.stdout or "").strip()
    if installed.return_code or runtime_version != OPENCODE_VERSION:
        return {"status": "version_mismatch", "runtime_version": runtime_version}
    listing = await env.exec(
        f"cd /app && {command} session list --format json --max-count 50",
        user="agent",
        env={"HOME": "/home/agent"},
        timeout_sec=60,
    )
    if listing.return_code:
        return {
            "status": "list_failed",
            "runtime_version": runtime_version,
            "return_code": listing.return_code,
        }
    sessions = json.loads(listing.stdout or "")
    if not isinstance(sessions, list):
        return {"status": "unexpected_list_shape", "runtime_version": runtime_version}
    export_dir = jobs_dir / "session-exports"
    export_dir.mkdir()
    exported: list[dict[str, object]] = []
    pending = list(sessions)
    seen: set[str] = set()
    reasons: set[str] = set()
    if len(sessions) >= 50:
        reasons.add("listing_at_cap")
    while pending:
        session = pending.pop(0)
        if not isinstance(session, dict):
            reasons.add("invalid_session_identity")
            continue
        session_id = session.get("id")
        if not isinstance(session_id, str) or not re.fullmatch(r"ses_[A-Za-z0-9_-]+", session_id):
            reasons.add("invalid_session_identity")
            continue
        if session_id in seen:
            continue
        if len(seen) >= 50:
            reasons.add("export_cap_pending")
            continue
        seen.add(session_id)
        output = await env.exec(
            f"cd /app && {command} export {session_id} --sanitize",
            user="agent",
            env={"HOME": "/home/agent"},
            timeout_sec=60,
        )
        record: dict[str, object] = {
            "id": session_id,
            "parent_id": safe_identifier(
                session.get("parentID") or session.get("parentId")
            ),
            "return_code": output.return_code,
        }
        if output.return_code == 0:
            if key in (output.stdout or "") or key in (output.stderr or ""):
                return {
                    "status": "raw_key_in_export",
                    "runtime_version": runtime_version,
                    "sessions": exported,
                }
            try:
                sanitized = parse_opencode_export(output.stdout or "")
                (export_dir / f"{session_id}.json").write_text(
                    json.dumps(sanitized, indent=2) + "\n"
                )
                record["file"] = f"session-exports/{session_id}.json"
            except (ValueError, json.JSONDecodeError):
                record["sanitized_status"] = "parse_failed"
            export_path = f"/tmp/wayforge-session-export-{session_id}.json"
            summary = await env.exec(
                f"cd /app && {command} export {session_id} > {export_path}; "
                "export_rc=$?; "
                f"if [ $export_rc -ne 0 ]; then rm -f {export_path}; exit $export_rc; fi; "
                f"python3 /opt/benchflow/session-probe.py --summarize-export < {export_path}; "
                "summary_rc=$?; "
                f"rm -f {export_path}; exit $summary_rc",
                user="agent",
                env={"HOME": "/home/agent"},
                timeout_sec=300,
            )
            summary_stdout = summary.stdout or ""
            summary_stderr = summary.stderr or ""
            if key in summary_stdout or key in summary_stderr:
                return {
                    "status": "raw_key_in_export",
                    "runtime_version": runtime_version,
                    "sessions": exported,
                }
            if summary.return_code == 0:
                try:
                    evidence = parse_summary_output(summary_stdout)
                    if evidence.get("session_id") != session_id:
                        reasons.add("unresolved_session_identity")
                    (export_dir / f"{session_id}.evidence.json").write_text(
                        json.dumps(evidence, indent=2) + "\n"
                    )
                    record["agent"] = evidence.get("agent")
                    record["tool_events"] = evidence["tools"]
                    record["usage"] = usage_record(evidence)
                    record["evidence_file"] = f"session-exports/{session_id}.evidence.json"
                    for tool_event in evidence["tools"]:
                        child_id = tool_event.get("child_session_id") if isinstance(tool_event, dict) else None
                        if isinstance(tool_event, dict) and tool_event.get("tool") == "task" and not child_id:
                            reasons.add("unresolved_child_session")
                        if child_id and child_id not in seen:
                            pending.append({"id": child_id, "parentID": session_id})
                except (json.JSONDecodeError, TypeError, ValueError) as exc:
                    record["evidence_status"] = "summary_invalid_json"
                    record["summary_error_type"] = type(exc).__name__
                    record["summary_stdout_bytes"] = len(summary_stdout.encode())
            else:
                record["evidence_status"] = "summary_failed"
                record["summary_return_code"] = summary.return_code
                record["summary_stderr_present"] = bool(summary_stderr.strip())
                record["summary_stderr_line_count"] = len(summary_stderr.splitlines())
                record["summary_stdout_bytes"] = len(summary_stdout.encode())
        else:
            record["sanitized_status"] = "export_failed"
        exported.append(record)
        (jobs_dir / "session-export-index.json").write_text(
            json.dumps(exported, indent=2) + "\n"
        )
    (jobs_dir / "session-export-index.json").write_text(
        json.dumps(exported, indent=2) + "\n"
    )
    complete = bool(exported) and all("evidence_file" in x for x in exported)
    if not complete:
        reasons.add("session_metadata_unavailable")
    return {
        "status": "incomplete" if reasons - {"session_metadata_unavailable"} else ("captured" if complete else "metadata_unavailable"),
        "incomplete_reasons": sorted(reasons),
        "runtime_version": runtime_version,
        "sessions": exported,
    }


async def main(manifest_path: Path, key_path: Path, agent_timeout: int) -> int:
    if not 60 <= agent_timeout <= 900:
        raise ValueError("Agent timeout must be between 60 and 900 seconds")
    scrub_host_credentials()
    if version("benchflow") != "0.6.3":
        raise RuntimeError("BenchFlow 0.6.3 is required")
    from benchflow.agents.registry import get_agent, register_agent
    from benchflow.rollout import Rollout, RolloutConfig

    manifest = json.loads(manifest_path.read_text())
    eval_root = manifest_path.resolve().parent
    checkout = eval_root / "skillsbench"
    sha = subprocess.check_output(
        ["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True
    ).strip()
    if sha != manifest["skillsbench_sha"]:
        raise RuntimeError("SkillsBench revision changed after preparation")
    task = checkout / "tasks" / manifest["task"]
    workspace = Path(manifest["workspace"])
    assert_free_config(workspace / "opencode.jsonc")
    key = private_key(key_path)
    jobs_dir = Path(
        tempfile.mkdtemp(prefix=f"probe-jobs-{workspace.name}-", dir=eval_root)
    )

    builtin, _ = get_agent("opencode")
    old = "opencode-ai@latest"
    if builtin.install_cmd.count(old) != 1:
        raise RuntimeError("BenchFlow's OpenCode install command changed")
    options = {
        field.name: getattr(builtin, field.name)
        for field in fields(builtin)
        if field.name not in ("name", "install_cmd", "launch_cmd")
    }
    if builtin.launch_cmd != "/opt/benchflow/bin/opencode acp":
        raise RuntimeError("BenchFlow's OpenCode ACP launch command changed")
    # BenchFlow 0.6.3 wraps this native ELF with `node`, which parses it as JS.
    # Invoke the npm-installed binary directly while keeping the ACP protocol.
    launch_cmd = "/opt/benchflow/js-agents/bin/opencode acp"
    register_agent(
        "opencode",
        builtin.install_cmd.replace(old, f"opencode-ai@{OPENCODE_VERSION}"),
        launch_cmd,
        **options,
    )

    async def stage_and_check(env: object) -> None:
        await env.upload_dir(workspace / ".opencode", "/app/.opencode")
        await env.upload_file(workspace / "opencode.jsonc", "/app/opencode.jsonc")
        await env.upload_file(workspace / "AGENTS.md", "/app/AGENTS.md")
        container_id = await main_container_id(env)
        inspect_container(container_id, key, jobs_dir)
        await check_summary_helper(env)

    config = RolloutConfig(
        task_path=task,
        agent="opencode",
        model=MODEL,
        environment="docker",
        jobs_dir=jobs_dir,
        timeout=agent_timeout,
        agent_env={"OPENCODE_API_KEY": key},
        pre_agent_hooks=[stage_and_check],
    )
    rollout = await Rollout.create(config)
    original_cleanup = rollout.cleanup
    session_capture: dict[str, object] = {"status": "not_attempted"}

    async def capture_before_cleanup() -> None:
        nonlocal session_capture
        try:
            if rollout.env is not None:
                session_capture = await capture_sessions(rollout.env, jobs_dir, key)
        except Exception as exc:
            frame = traceback.extract_tb(exc.__traceback__)[-1]
            session_capture = {
                "status": "capture_failed",
                "error_type": type(exc).__name__,
                "error_function": frame.name,
                "error_line": frame.lineno,
                "index_available": (jobs_dir / "session-export-index.json").exists(),
            }
        finally:
            await original_cleanup()

    rollout.cleanup = capture_before_cleanup
    try:
        result = await asyncio.wait_for(rollout.run(), timeout=3600)
    finally:
        assert_key_absent(jobs_dir, key)
    print(json.dumps({
        "task": result.task_name,
        "agent": result.agent,
        "model": result.model,
        "agent_timeout_sec": agent_timeout,
        "rewards": result.rewards,
        "error": (result.error or "").replace(key, "[REDACTED]") or None,
        "error_category": result.error_category,
        "verifier_error": (result.verifier_error or "").replace(key, "[REDACTED]") or None,
        "trajectory_events": len(result.trajectory or []),
        "tool_calls": result.n_tool_calls,
        "skill_invocations": result.n_skill_invocations,
        "input_tokens": result.n_input_tokens,
        "output_tokens": result.n_output_tokens,
        "cost_usd": result.cost_usd,
        "usage": benchflow_usage(result),
        "session_capture": session_capture,
        "jobs_dir": str(jobs_dir),
    }, default=str, indent=2))
    if session_capture.get("status") == "raw_key_in_export":
        raise RuntimeError("Sanitized OpenCode export contained the raw key")
    if result.error:
        print(
            "Pilot ended with an agent/runtime error; inspect the private job output",
            file=sys.stderr,
        )
        return 2
    if session_capture.get("status") != "captured" or not session_capture.get("sessions"):
        print("Pilot completed without inspectable OpenCode sessions", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--summarize-export"]:
        try:
            summary = session_evidence(parse_opencode_export(sys.stdin.read()))
            print(json.dumps(summary))
        except Exception as exc:
            print(json.dumps({"error_type": type(exc).__name__}), file=sys.stderr)
            raise SystemExit(1)
        raise SystemExit(0)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--key-file", required=True, type=Path)
    parser.add_argument("--agent-timeout", type=int, default=900)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.manifest, args.key_file, args.agent_timeout)))

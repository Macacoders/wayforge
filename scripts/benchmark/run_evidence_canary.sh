#!/usr/bin/env bash
set -euo pipefail

# One human-run OpenCode interface check. This never starts BenchFlow or SkillsBench.
if [[ $# -ne 1 ]]; then
  echo "Usage: bash scripts/benchmark/run_evidence_canary.sh /path/to/dedicated-zen-key" >&2
  echo "       bash scripts/benchmark/run_evidence_canary.sh --prepare-only" >&2
  exit 2
fi
prepare_only=0
if [[ $1 == --prepare-only ]]; then
  prepare_only=1
elif [[ $1 == --help ]]; then
  echo "Usage: bash scripts/benchmark/run_evidence_canary.sh /path/to/dedicated-zen-key"
  echo "       bash scripts/benchmark/run_evidence_canary.sh --prepare-only"
  exit 0
fi

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
eval_root="$repo/temp/benchmark-testing"
manifest="$eval_root/probe-manifest.json"
key_file=
if [[ $prepare_only -eq 0 ]]; then
  key_file=$(realpath "$1")
fi
model=opencode/big-pickle

if [[ $(opencode --version) != 1.18.35 ]]; then
  echo "OpenCode 1.18.35 is required for this interface check" >&2
  exit 2
fi

source_dir=$(python3 - "$manifest" "$repo" <<'PY'
import json
from pathlib import Path
import sys

manifest = Path(sys.argv[1])
repo = Path(sys.argv[2])
source = Path(json.loads(manifest.read_text())["workspace"]).resolve()
expected = (repo / "temp/benchmark-testing").resolve()
if expected not in source.parents or not source.is_dir():
    raise SystemExit("Prepared probe workspace is missing or outside the evaluation root")
print(source)
PY
)

if [[ $prepare_only -eq 0 ]]; then
python3 - "$key_file" <<'PY'
from pathlib import Path
import os
import stat
import sys

path = Path(sys.argv[1])
info = path.stat()
if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
    raise SystemExit("Key file must be a regular file owned by you with mode 0600")
key = path.read_text().strip()
if not key or "\n" in key:
    raise SystemExit("Key file must contain one key")
PY
fi

umask 077
canary=$(mktemp -d "$eval_root/evidence-canary-XXXXXX")
chmod 700 "$canary"
cp -a "$source_dir/.opencode" "$source_dir/opencode.jsonc" "$canary/"

python3 - "$canary/opencode.jsonc" "$model" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
model = sys.argv[2]
raw = path.read_text()
if raw.startswith("//"):
    raw = raw.partition("\n")[2]
config = json.loads(raw)
if config.get("enabled_providers") != ["opencode"] or config.get("default_agent") != "delivery":
    raise SystemExit("Unexpected prepared OpenCode config")
if "big-pickle" not in config["provider"]["opencode"]["models"]:
    raise SystemExit("Prepared config does not define Big Pickle")
config["model"] = model
config["small_model"] = model
for agent in config["agent"].values():
    if "model" in agent:
        agent["model"] = model
config["provider"]["opencode"]["models"] = {
    "big-pickle": config["provider"]["opencode"]["models"]["big-pickle"]
}
path.write_text(json.dumps(config, indent=2) + "\n")
PY

printf 'A\n' > "$canary/canary.txt"
printf 'Disposable evidence canary. Change only canary.txt; verify its contents.\n' > "$canary/AGENTS.md"
printf '.opencode/\nopencode.jsonc\nhome/\nrun.jsonl\nrun.err\n*.evidence.json\n' > "$canary/.gitignore"
git -C "$canary" init -q
git -C "$canary" config user.name 'Evidence Canary'
git -C "$canary" config user.email 'canary@example.invalid'
git -C "$canary" add .gitignore AGENTS.md canary.txt
git -C "$canary" commit -qm 'Initial canary'

if [[ $prepare_only -eq 1 ]]; then
  echo "Prepared canary without model call: $canary"
  exit 0
fi

mkdir "$canary/home"
export HOME="$canary/home"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"
export XDG_STATE_HOME="$HOME/.local/state"
unset OPENCODE_CONFIG OPENCODE_CONFIG_DIR OPENCODE_DISABLE_FREE_MODELS

cd "$canary"
echo "Canary: $canary"
echo "Model for root, helper, and agents: $model"
echo "One run; 600-second wall limit; no automatic retry"

IFS= read -r OPENCODE_API_KEY < "$key_file"
export OPENCODE_API_KEY
set +e
python3 - "$canary" <<'PY'
from pathlib import Path
import os
import signal
import subprocess
import sys
import time

canary = Path(sys.argv[1])
log = canary / "home/.local/share/opencode/log/opencode.log"
command = [
    "opencode", "run", "--command", "deliver", "--format", "json",
    "--title", "evidence-canary",
    "Change canary.txt from A to B. Have code make the change and reviewer "
    "independently verify it. Make no other change.",
]

def stop_group(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()

with (canary / "run.jsonl").open("w") as stdout, (canary / "run.err").open("w") as stderr:
    process = subprocess.Popen(
        command, stdout=stdout, stderr=stderr, start_new_session=True
    )
    deadline = time.monotonic() + 600
    while process.poll() is None:
        if log.exists() and b"Free usage limit reached" in log.read_bytes():
            stop_group(process)
            print("OpenCode free usage limit reached; stopped this canary")
            raise SystemExit(3)
        if time.monotonic() >= deadline:
            stop_group(process)
            raise SystemExit(124)
        time.sleep(0.5)
    raise SystemExit(process.returncode)
PY
run_status=$?
set -e
unset OPENCODE_API_KEY
echo "OpenCode exit status: $run_status"

python3 - "$canary" "$key_file" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
key = Path(sys.argv[2]).read_text().strip().encode()
for path in root.rglob("*"):
    if path.is_file() and key in path.read_bytes():
        raise SystemExit(f"Raw key found in private canary output: {path}")
PY

opencode session list --format json --max-count 20 > "$canary/sessions.json"
session_id=$(python3 - "$canary/sessions.json" <<'PY'
import json
from pathlib import Path
import sys

sessions = json.loads(Path(sys.argv[1]).read_text())
matches = [item["id"] for item in sessions if item.get("title") == "evidence-canary"]
if len(matches) != 1:
    raise SystemExit("Expected exactly one canary session")
print(matches[0])
PY
)

helper="$repo/scripts/benchmark/run_skillsbench_probe.py"
opencode export "$session_id" | python3 "$helper" --summarize-export > "$canary/root.evidence.json"
mapfile -t child_ids < <(python3 - "$canary/root.evidence.json" <<'PY'
import json
from pathlib import Path
import sys

root = json.loads(Path(sys.argv[1]).read_text())
print("\n".join(sorted({
    tool["child_session_id"] for tool in root["tools"]
    if tool.get("tool") == "task" and tool.get("child_session_id")
})))
PY
)
for child_id in "${child_ids[@]}"; do
  [[ -n $child_id ]] || continue
  opencode export "$child_id" | python3 "$helper" --summarize-export > "$canary/$child_id.evidence.json"
done

set +e
python3 - "$canary" <<'PY'
import json
from pathlib import Path
import sys

directory = Path(sys.argv[1])
root = json.loads((directory / "root.evidence.json").read_text())
tools = root["tools"]
skills = [tool for tool in tools if tool.get("tool") == "skill"]
tasks = [tool for tool in tools if tool.get("tool") == "task"]
children = {}
for path in directory.glob("ses_*.evidence.json"):
    child = json.loads(path.read_text())
    children[child.get("session_id")] = child.get("agent")

def linked(role):
    return any(
        tool.get("status") == "completed"
        and tool.get("target_agent") == role
        and children.get(tool.get("child_session_id")) == role
        for tool in tasks
    )

passed = (
    root.get("agent") == "delivery"
    and any(
        tool.get("status") == "completed"
        and tool.get("skill_name") == "delivery-policy"
        for tool in skills
    )
    and linked("code")
    and linked("reviewer")
)
print(json.dumps({
    "evidence_gate": "pass" if passed else "inconclusive",
    "root_agent": root.get("agent"),
    "skill_calls": [
        {"name": tool.get("skill_name"), "status": tool.get("status")}
        for tool in skills
    ],
    "task_calls": [
        {
            "target": tool.get("target_agent"),
            "status": tool.get("status"),
            "child_session_id": tool.get("child_session_id"),
        }
        for tool in tasks
    ],
    "child_agents": children,
    "canary_file": (directory / "canary.txt").read_text().strip(),
}, indent=2))
raise SystemExit(0 if passed else 4)
PY
gate_status=$?
set -e
if [[ $run_status -ne 0 ]]; then
  exit "$run_status"
fi
exit "$gate_status"

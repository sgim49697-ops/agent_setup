#!/usr/bin/env python3
# master_loop_orchestrator.py - 단계형 bounded cycle 실행기
"""Step-based orchestrator for one bounded UX cycle.

Splits a single cycle into multiple independent codex invocations, each with a
focused persona injected from `.codex/prompts/*.md`. Between steps, Python-level
gates (ko-copy, quality-gate) run in-process so failures block the pipeline
immediately rather than being caught after a full cycle.

Why: the legacy single-shot runner let the model "declare" designer/critic/
ko-copy phases in free text, but nothing enforced them. Here, each step is a
separate process with its own prompt, working directory, and artifact paths.
Inertia is broken across steps because each invocation starts with a fresh
session.

Step order:
  1. design    -> codex run with designer persona produces patch + notes
  2. critique  -> codex run with critic persona independently reviews changes
  3. ko-copy   -> python gate + optional codex run to fix Korean copy
  4. verify    -> codex run with verifier persona final review
  5. gates     -> validator + trace-sanity + baseline + quality-gate (python)
  6. complete  -> master_loop_complete_harness.py if gates pass

Exit code: 0 if all steps pass, non-zero on pipeline failure.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from master_loop_state import safe_mode_enabled

ROOT = Path("/home/user/projects/agent_setup/codex_agent")
CODEX_BIN = "/home/user/.npm-global/bin/codex"
STATE_PATH = ROOT / ".omx/state/master-ux-loop.json"
STATE_HELPER = ROOT / "scripts/master_loop_state.py"
QUALITY_GATE = ROOT / "scripts/master_loop_quality_gate.py"
KO_COPY_GATE = ROOT / "scripts/master_loop_ui_language_gate.py"
VALIDATOR = ROOT / "scripts/master_loop_validator.py"
TRACE_SANITY = ROOT / "scripts/master_loop_trace_sanity.py"
BASELINE = ROOT / "scripts/master_loop_baseline_metrics.py"
COMPLETE = ROOT / "scripts/master_loop_complete_harness.py"
PROMPT_DIR = ROOT / ".codex/prompts"
LOG_PATH = ROOT / ".omx/logs/master-ux-benchmark-v2.log"

STEP_TIMEOUT_SEC = int(os.environ.get("ORCH_STEP_TIMEOUT_SEC", "1200"))
DESIGN_MAX_RETRIES = int(os.environ.get("ORCH_DESIGN_MAX_RETRIES", "1"))
CRITIC_MAX_RETRIES = int(os.environ.get("ORCH_CRITIC_MAX_RETRIES", "1"))
KO_COPY_MAX_RETRIES = int(os.environ.get("ORCH_KO_COPY_MAX_RETRIES", "2"))
VERIFY_MAX_RETRIES = int(os.environ.get("ORCH_VERIFY_MAX_RETRIES", "1"))
LOCK_PATH = ROOT / ".omx/state/orchestrator.lock"

STEP_MCP_PROFILE = {
    "design": {
        "omx_memory": True,
        "omx_code_intel": True,
        "stitch": True,
        "playwright": False,
        "omx_state": False,
        "omx_trace": False,
    },
    "critique": {
        "omx_memory": True,
        "omx_code_intel": True,
        "stitch": False,
        "playwright": False,
        "omx_state": False,
        "omx_trace": False,
    },
    "ko-copy": {
        "omx_memory": True,
        "omx_code_intel": True,
        "stitch": False,
        "playwright": False,
        "omx_state": False,
        "omx_trace": False,
    },
    "verify": {
        "omx_memory": True,
        "omx_code_intel": False,
        "stitch": False,
        "playwright": True,
        "omx_state": False,
        "omx_trace": False,
    },
}


def acquire_lock():
    """Exclusive non-blocking flock. Returns file handle kept open for lifetime, or None."""
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fh = LOCK_PATH.open("w", encoding="utf-8")
    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fh.close()
        return None
    fh.write(f"pid={os.getpid()} started={datetime.now(timezone.utc).isoformat()}\n")
    fh.flush()
    return fh


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(f"[{utc_now()}] orchestrator: {msg}\n")


def update_state(key: str, value: str) -> None:
    try:
        subprocess.run(
            ["python3", str(STATE_HELPER), str(STATE_PATH), key, str(value)],
            check=False,
            capture_output=True,
            timeout=30,
        )
    except Exception as exc:
        log(f"update_state({key}) failed: {exc}")


def cycle_dir(cycle: int, harness: str) -> Path:
    path = ROOT / f".omx/cycles/cycle-{cycle:04d}-{harness}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_prompt_md(name: str) -> str:
    """Load a persona prompt from .codex/prompts/<name>.md, strip YAML frontmatter."""
    path = PROMPT_DIR / f"{name}.md"
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8")
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            text = parts[2]
    return text.strip()


def run_codex_step(
    step_name: str,
    prompt: str,
    artifact_dir: Path,
    timeout_sec: int = STEP_TIMEOUT_SEC,
) -> tuple[int, Path]:
    """Run one codex invocation with the given prompt, capturing output to artifact dir."""
    artifact_dir.mkdir(parents=True, exist_ok=True)
    step_log = artifact_dir / f"{step_name}.log"
    last_file = artifact_dir / f"{step_name}.last.txt"
    prompt_file = artifact_dir / f"{step_name}.prompt.md"
    prompt_file.write_text(prompt, encoding="utf-8")

    started = utc_now()
    log(f"step {step_name} starting (artifact={artifact_dir.name})")
    update_state("current_phase", f"orchestrator-{step_name}")
    update_state("last_progress_at", started)
    update_state("last_progress_summary", f"orchestrator step {step_name} started")

    profile_key = "ko-copy" if step_name.startswith("ko-copy") else step_name
    profile = STEP_MCP_PROFILE.get(profile_key, {})
    cmd = [
        CODEX_BIN,
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "--ephemeral",
        "--color",
        "never",
        "-C",
        str(ROOT),
    ]
    for server, enabled in profile.items():
        cmd.extend(["-c", f"mcp_servers.{server}.enabled={str(enabled).lower()}"])
    cmd.extend([
        "-o",
        str(last_file),
        prompt,
    ])
    try:
        with step_log.open("w", encoding="utf-8") as log_fh:
            log_fh.write(f"# step={step_name} started={started}\n")
            log_fh.flush()
            proc = subprocess.run(
                cmd,
                stdout=log_fh,
                stderr=subprocess.STDOUT,
                timeout=timeout_sec,
                check=False,
            )
        rc = proc.returncode
    except subprocess.TimeoutExpired:
        rc = 124
        with step_log.open("a", encoding="utf-8") as log_fh:
            log_fh.write(f"\n# step timed out after {timeout_sec}s\n")

    finished = utc_now()
    log(f"step {step_name} finished rc={rc} at {finished}")
    return rc, last_file


def run_python_gate(name: str, cmd: list[str]) -> tuple[int, str]:
    """Run a python gate script, return (rc, combined-output)."""
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        out = (proc.stdout or "") + (proc.stderr or "")
        return proc.returncode, out
    except subprocess.TimeoutExpired:
        return 124, f"{name} timed out"
    except Exception as exc:
        return 1, f"{name} error: {exc}"


def load_ko_copy_report() -> dict:
    report = ROOT / ".omx/state/master-loop-ui-language-gate.json"
    if not report.exists():
        return {}
    try:
        return json.loads(report.read_text(encoding="utf-8"))
    except Exception:
        return {}


# ----------------------------- STEP PROMPTS ----------------------------- #


def build_design_prompt(harness: str, cycle: int, ctx: str, artifact_dir: Path) -> str:
    persona = load_prompt_md("designer")
    return f"""You are the designer step of a bounded UX cycle. Execute ONLY the design/edit phase.

<designer_persona>
{persona}
</designer_persona>

Active harness: {harness}
Cycle: {cycle}
Workspace: {ROOT}
Artifact directory: {artifact_dir}

Required work (single step, not a full cycle):

PHASE 1 — Stitch discovery (mandatory, do this before touching any code):
1. Call Stitch MCP: explore available components, tokens, and patterns in project 11015732894783859302.
   Search for terms relevant to {harness}: try "wizard", "multi-step", "stepper", "pipeline",
   "onboarding", "article", "editor", "publish", "flow" — use whatever fits the harness shape.
2. Extract from Stitch: color tokens, typography scale, spacing system, and at least one
   screen-flow or interaction pattern that fits this harness.
3. Decide on a screen flow (e.g. 3-screen wizard, tab-based stages, route-per-step).
   Default to multi-screen. Justify single-screen only with explicit Stitch evidence.

PHASE 2 — Design and implement:
4. Implement the UI patch for {harness} based on what you found in Stitch.
   Use Stitch tokens and component patterns directly in the code.
5. Korean-first visible copy. English only in aria/data-testid/test-hook text.
6. Each screen must have exactly one primary action (single primary action per screen).
   FORBIDDEN: showing all pipeline outputs (research, outline, drafts, review, final)
   simultaneously on one page. This is a single-page dump and the critic will reject it.
   Distribute outputs across screens or behind progressive disclosure.

PHASE 3 — Record:
7. Write {artifact_dir}/designer-notes.md covering:
   - Stitch search terms used and patterns found (required — critic will check this)
   - Screen flow defined (Screen 1 → trigger → Screen 2 → ...)
   - Stitch tokens applied (color vars, type scale, spacing)
   - Aesthetic direction and the ONE memorable design choice
   - Files changed
   - Known gaps for the critic

Do NOT run verify/gate/browser-review in this step. That is handled by later steps.
Do NOT mutate remaining_harnesses or write completion markers here.

Context from wrapper:
{ctx}

Finish as soon as the edit is made and the notes file is written.
"""


def build_critique_prompt(harness: str, cycle: int, artifact_dir: Path, prior_rounds: int) -> str:
    persona = load_prompt_md("critic")
    designer_notes = artifact_dir / "designer-notes.md"
    notes_text = designer_notes.read_text(encoding="utf-8") if designer_notes.exists() else "(designer notes missing)"
    retry_hint = ""
    if prior_rounds > 0:
        retry_hint = f"\nThis is critique round {prior_rounds + 1}. Be even more skeptical of remaining gaps.\n"
    return f"""You are the critic step. Independently review the designer's edit WITHOUT being biased by their framing.

<critic_persona>
{persona}
</critic_persona>

Active harness: {harness}
Cycle: {cycle}
Artifact directory: {artifact_dir}
{retry_hint}
Designer notes to review:
---
{notes_text}
---

Required work:
1. Open the changed files via git diff or ls-files and read them fresh. Do not trust the designer's self-report.
2. Check the designer-notes.md for Stitch discovery evidence. If "Stitch search terms used" is absent
   or says nothing was searched, that is a blocking issue: the designer skipped Stitch.
3. Evaluate the changes against these criteria (any blocking issue triggers reject):

   BLOCKING — reject if any of these are true:
   a) All pipeline outputs (research, outline, drafts, review, final) are visible on a single screen
      simultaneously with no navigation or progressive disclosure between them.
   b) No Stitch tokens (color vars, typography, spacing) are present in the changed code.
   c) Stitch discovery is absent from designer-notes.md.
   d) Korean-first copy violation: user-visible text is predominantly English.
   e) No clear primary action per screen (multiple competing CTAs or no CTA).

   WARN — note but do not block:
   - Minor a11y gaps (missing aria-label, low contrast)
   - Interaction detail missing (hover state, loading state)
   - Typography fallback to system font

4. Write your verdict to {artifact_dir}/critic-report.md using this exact format:

   # Critic Report
   verdict: approve | reject
   blocking_issues:
     - (one line per blocking issue, empty list if approve)
   suggestions:
     - (one line per suggestion)
   evidence:
     - (file:line references for each issue)

5. If verdict is reject, DO NOT edit code. List the issues and stop.
6. If verdict is approve, note that the patch is ready for ko-copy + verify.

Finish as soon as critic-report.md is written.
"""


def build_ko_copy_fix_prompt(harness: str, cycle: int, artifact_dir: Path, ko_report: dict) -> str:
    persona = load_prompt_md("designer")
    findings = json.dumps(ko_report, ensure_ascii=False, indent=2)[:4000]
    return f"""You are the ko-copy-fix step. Fix Korean-first copy violations flagged by the gate.

<designer_persona>
{persona}
</designer_persona>

Active harness: {harness}
Cycle: {cycle}

ko-copy gate findings (JSON):
{findings}

Required work:
1. Convert visible English copy to Korean for the affected harness only.
2. Preserve English ONLY in aria-label / data-testid / live-region hook text.
3. Do not change layout, logic, or unrelated files.
4. After edits, write a one-line summary to {artifact_dir}/ko-copy-fix.md listing the files touched.

Finish as soon as the fix is applied.
"""


def build_verify_prompt(harness: str, cycle: int, artifact_dir: Path) -> str:
    persona = load_prompt_md("verifier")
    critic_path = artifact_dir / "critic-report.md"
    critic_text = critic_path.read_text(encoding="utf-8") if critic_path.exists() else "(critic report missing)"
    return f"""You are the verify step. Give the final fresh-eyes verdict before python gates.

<verifier_persona>
{persona}
</verifier_persona>

Active harness: {harness}
Cycle: {cycle}
Artifact directory: {artifact_dir}

Critic report:
---
{critic_text}
---

Required work:
1. Use scripts/harness_preview.py ensure {harness} to get the stable preview URL.
2. Run a minimal browser-review pass and a Korean-first spot check.
3. Write {artifact_dir}/verifier-report.md with:

   # Verifier Report
   verdict: pass | fail
   evidence:
     - preview_url: ...
     - screenshots or notes
   open_issues:
     - (empty if pass)

4. Do NOT remove the harness from remaining_harnesses here - the python gate + complete step handle that.

Finish as soon as verifier-report.md is written.
"""


# ----------------------------- STEPS ----------------------------- #


def step_design(harness: str, cycle: int, ctx: str, artifact_dir: Path) -> int:
    prompt = build_design_prompt(harness, cycle, ctx, artifact_dir)
    rc, _ = run_codex_step("design", prompt, artifact_dir)
    return rc


def step_critique(harness: str, cycle: int, artifact_dir: Path) -> tuple[int, bool]:
    """Returns (rc, approved). approved=True if verdict line says 'approve'."""
    prompt = build_critique_prompt(harness, cycle, artifact_dir, prior_rounds=0)
    rc, _ = run_codex_step("critique", prompt, artifact_dir)
    report = artifact_dir / "critic-report.md"
    if not report.exists():
        return rc, False
    text = report.read_text(encoding="utf-8", errors="ignore")
    approved = False
    for line in text.splitlines():
        stripped = line.strip().lower()
        if stripped.startswith("verdict:"):
            approved = "approve" in stripped and "reject" not in stripped
            break
    return rc, approved


def step_ko_copy(harness: str, cycle: int, artifact_dir: Path) -> int:
    """Run ko-copy gate; on fail, run fix step (up to KO_COPY_MAX_RETRIES)."""
    for attempt in range(KO_COPY_MAX_RETRIES + 1):
        rc, _ = run_python_gate(
            "ko-copy-gate",
            ["python3", str(KO_COPY_GATE), "--harness", harness, "--quiet"],
        )
        if rc == 0:
            log(f"ko-copy gate passed on attempt {attempt + 1}")
            return 0
        report = load_ko_copy_report()
        log(f"ko-copy gate failed (attempt {attempt + 1}): rc={rc}")
        if attempt >= KO_COPY_MAX_RETRIES:
            break
        prompt = build_ko_copy_fix_prompt(harness, cycle, artifact_dir, report)
        fix_rc, _ = run_codex_step(f"ko-copy-fix-{attempt + 1}", prompt, artifact_dir)
        if fix_rc != 0:
            log(f"ko-copy fix step failed rc={fix_rc}")
    return 1


def step_verify(harness: str, cycle: int, artifact_dir: Path) -> int:
    prompt = build_verify_prompt(harness, cycle, artifact_dir)
    rc, _ = run_codex_step("verify", prompt, artifact_dir)
    return rc


def step_python_gates(harness: str) -> int:
    """Run all post-step python quality gates. Returns 0 if all pass."""
    run_python_gate("validator", ["python3", str(VALIDATOR), "--rewrite", "--quiet"])
    run_python_gate("trace-sanity", ["python3", str(TRACE_SANITY), "--quiet"])
    run_python_gate("baseline", ["python3", str(BASELINE), "--quiet"])
    rc, out = run_python_gate(
        "quality-gate",
        ["python3", str(QUALITY_GATE), "--active-harness", harness, "--enforce", "--quiet"],
    )
    if rc != 0:
        log(f"quality gate failed rc={rc}: {out[:500]}")
    return rc


def step_complete_harness(harness: str) -> int:
    rc, out = run_python_gate(
        "complete-harness",
        ["python3", str(COMPLETE), "--harness", harness],
    )
    log(f"complete-harness rc={rc}: {out[:300]}")
    return rc


def run_single_mode(mode: str, harness: str, cycle: int, ctx: str) -> int:
    artifact_dir = cycle_dir(cycle, harness)
    update_state("orchestrator_active", "true")
    update_state("orchestrator_artifact_dir", str(artifact_dir))
    update_state("current_harness", harness)
    log(f"=== cycle {cycle} harness {harness} mode={mode} artifact={artifact_dir} ===")
    try:
        if mode == "design":
            rc = step_design(harness, cycle, ctx, artifact_dir)
        elif mode == "critique":
            rc, approved = step_critique(harness, cycle, artifact_dir)
            if rc == 0 and not approved:
                rc = 23
        elif mode == "ko-copy":
            rc = 0 if step_ko_copy(harness, cycle, artifact_dir) == 0 else 21
        elif mode == "verify":
            rc = step_verify(harness, cycle, artifact_dir)
        elif mode == "gates":
            rc = step_python_gates(harness)
        elif mode == "complete":
            rc = step_complete_harness(harness)
        else:
            raise ValueError(f"unsupported mode: {mode}")
        return rc
    finally:
        update_state("orchestrator_active", "false")
        update_state("last_orchestrator_exit", str(locals().get("rc", 1)))
        log(f"=== cycle {cycle} harness {harness} mode={mode} done rc={locals().get('rc', 1)} ===")


# ----------------------------- ORCHESTRATE ----------------------------- #


def orchestrate(harness: str, cycle: int, ctx: str) -> int:
    artifact_dir = cycle_dir(cycle, harness)
    update_state("orchestrator_active", "true")
    update_state("orchestrator_artifact_dir", str(artifact_dir))
    log(f"=== cycle {cycle} harness {harness} artifact={artifact_dir} ===")

    design_rc = 1
    critique_rc = 1
    approved = False
    retry_ctx = ctx
    for attempt in range(DESIGN_MAX_RETRIES + 1):
        design_rc = step_design(harness, cycle, retry_ctx, artifact_dir)
        if design_rc != 0:
            log(f"design step failed rc={design_rc} on attempt {attempt + 1}")
            if attempt >= DESIGN_MAX_RETRIES:
                break
            retry_ctx = f"{ctx}\n\nDESIGN STEP FAILED on attempt {attempt + 1}. Retry the edit with smaller, safer changes."
            continue

        critique_rc, approved = step_critique(harness, cycle, artifact_dir)
        if critique_rc != 0:
            log(f"critique step rc={critique_rc} on attempt {attempt + 1}")
        log(f"critic verdict attempt {attempt + 1}: {'APPROVE' if approved else 'REJECT'}")
        if approved:
            break
        if attempt >= DESIGN_MAX_RETRIES:
            break
        retry_ctx = (
            f"{ctx}\n\nCRITIC REJECTED - read {artifact_dir}/critic-report.md and address "
            f"blocking_issues before re-editing. This is retry attempt {attempt + 2}."
        )

    ko_rc = 1
    verify_rc = 1
    if design_rc == 0 and approved:
        ko_rc = step_ko_copy(harness, cycle, artifact_dir)
        if ko_rc != 0:
            log("ko-copy step failed after retries; python gate will mark regression")

        for attempt in range(VERIFY_MAX_RETRIES + 1):
            verify_rc = step_verify(harness, cycle, artifact_dir)
            if verify_rc == 0:
                break
            log(f"verify step rc={verify_rc} on attempt {attempt + 1}")
            if attempt >= VERIFY_MAX_RETRIES:
                break
    else:
        log("skipping ko-copy/verify because design+critique never reached an approved patch")

    gate_rc = step_python_gates(harness)

    if gate_rc == 0 and ko_rc == 0:
        step_complete_harness(harness)

    pipeline_rc = 0
    if gate_rc != 0:
        pipeline_rc = 20
    elif ko_rc != 0:
        pipeline_rc = 21
    elif design_rc != 0:
        pipeline_rc = 10
    elif critique_rc != 0 and not approved:
        pipeline_rc = 23
    elif verify_rc != 0:
        pipeline_rc = 22

    update_state("orchestrator_active", "false")
    update_state("last_orchestrator_exit", str(pipeline_rc))
    log(f"=== cycle {cycle} harness {harness} done rc={pipeline_rc} ===")
    return pipeline_rc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--active-harness", required=True)
    parser.add_argument("--cycle", required=True, type=int)
    parser.add_argument("--prompt-context", default="")
    parser.add_argument(
        "--mode",
        default="full",
        choices=["full", "design", "critique", "ko-copy", "verify", "gates", "complete"],
    )
    args = parser.parse_args()
    if os.environ.get("MASTER_LOOP_SAFE_MODE_BYPASS") != "1" and safe_mode_enabled():
        log("safe mode is enabled; orchestrator refused to start without MASTER_LOOP_SAFE_MODE_BYPASS=1")
        return 90
    lock_fh = acquire_lock()
    if lock_fh is None:
        log(f"another orchestrator instance holds {LOCK_PATH}; aborting (pid={os.getpid()})")
        return 75
    try:
        if args.mode == "full":
            return orchestrate(args.active_harness, args.cycle, args.prompt_context)
        return run_single_mode(args.mode, args.active_harness, args.cycle, args.prompt_context)
    finally:
        try:
            fcntl.flock(lock_fh.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        lock_fh.close()


if __name__ == "__main__":
    sys.exit(main())

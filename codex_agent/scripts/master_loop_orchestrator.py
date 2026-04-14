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
  2. ko-copy   -> python gate + optional codex run to fix Korean copy
  3. critique  -> codex run with critic persona independently reviews changes
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
    single_agent_guard = ""
    if harness == "single_agent":
        single_agent_guard = """
10. single_agent Korean-first guard:
    - This harness is especially sensitive to the ko-copy gate because visible copy often lives in a single surface.
    - Write Korean-first copy not only in quoted strings but also in JSX text nodes such as
      <p>...</p>, <span>...</span>, <button>...</button>, <label>...</label>.
    - Do not leave visible English placeholders behind in the first-fold UI.
"""
    return f"""You are the designer step of a bounded UX cycle. Execute ONLY the design/edit phase.

<designer_persona>
{persona}
</designer_persona>

Active harness: {harness}
Cycle: {cycle}
Workspace: {ROOT}
Artifact directory: {artifact_dir}

Required work (single step, not a full cycle):

PHASE 0 — Web reference research (mandatory BEFORE opening Stitch or code):
Search the web for real-world UI references. You MUST find at least 3 specific references.
Search queries to try:
  - "tech blog generator UI design 2024 2025"
  - "multi-step wizard SaaS onboarding Linear Vercel Loom design"
  - "pipeline progress UI animation mobile app"
  - "article editor publish flow interaction design"
  - "{harness.replace('_', ' ')} UI design pattern"
For each reference, extract:
  (a) How screen-to-screen transitions work (slide, fade, morph, shared-element)
  (b) What happens on button click (scale, ripple, color fill)
  (c) How loading state is shown (skeleton shimmer, step-by-step reveal, pulse)
  (d) What happens on hover (lift, glow, underline)
  (e) How completion/success is signaled (checkmark draw, color fill, bounce)
Record all 3 references in {artifact_dir}/designer-notes.md BEFORE proceeding.

PHASE 0.5 — Real-eval rubric alignment (mandatory):
Read `benchmark/real_eval_rubric.md` before implementing. Treat the following as the
highest-priority UI/UX outcome bars for this edit:
  - 접근성/반응형 (20.0)
  - 디자인 완성도와 인터랙션 품질 (20.0)
  - 사용자 플로우 완성도 (10.0)
  - 복구 가능성 (6.7)
Your design choices must improve the product against those categories, not just visual polish.
If this harness is not currently a default real-eval target, still use the rubric as a directional
quality bar for UI/UX decisions rather than as an eligibility gate.

PHASE 1 — Stitch discovery (mandatory, do this before touching any code):
1. Call Stitch MCP: explore available components, tokens, and patterns in project 11015732894783859302.
   Search for terms relevant to {harness}: try "wizard", "multi-step", "stepper", "pipeline",
   "onboarding", "article", "editor", "publish", "flow", "transition", "animation", "motion".
2. Extract from Stitch: color tokens, typography scale, spacing system, and at least one
   screen-flow or interaction pattern that fits this harness.
3. Decide on a screen flow (e.g. 3-screen wizard, tab-based stages, route-per-step).
   Default to multi-screen. Justify single-screen only with explicit Stitch evidence.

PHASE 2 — Define interaction inventory (mandatory BEFORE writing any component code):
Write the following 9-item spec into {artifact_dir}/designer-notes.md:
  Screen transitions:   [animation type + duration, e.g. "slide-left 350ms ease-out"]
  Button press:         [feedback, e.g. "scale 0.97 + darken 150ms"]
  Button hover:         [e.g. "lift shadow + color shift 150ms"]
  Loading state:        [e.g. "skeleton shimmer → step-by-step reveal"]
  Step completion:      [e.g. "checkmark stroke animation 300ms + color fill"]
  Error state:          [e.g. "shake 200ms + red border glow"]
  Input focus:          [e.g. "border highlight + label float"]
  Empty state:          [e.g. "icon + Korean copy + single CTA"]
  Page entrance:        [e.g. "staggered fade-up 50ms per item"]
Every item must be filled. Blank or "TBD" = critic rejects.

PHASE 3 — Design and implement:
4. Implement the UI patch for {harness} based on what you found in web research + Stitch.
   Use Stitch tokens as CSS variables. Use a distinctive font pairing (NOT system fonts — NOT
   Inter, Roboto, Arial, system-ui). Load from Google Fonts or CDN.
5. Implement ALL 9 interactions defined in Phase 2. Every transition must use CSS
   transition or animation. Instant snap between screens = critic reject.
6. Wrap ALL animations in @media (prefers-reduced-motion: reduce). No exceptions.
7. Every interactive element needs :hover AND :focus-visible styles. cursor:pointer alone = reject.
8. Korean-first visible copy. English only in aria/data-testid/test-hook text.
9. Each screen must have exactly one primary action (single primary action per screen).
   FORBIDDEN: showing all pipeline outputs (research, outline, drafts, review, final)
   simultaneously on one page. This is a single-page dump and the critic will reject it.
   Distribute outputs across screens or behind progressive disclosure.
{single_agent_guard}

PHASE 4 — Record:
11. Update {artifact_dir}/designer-notes.md (append, don't overwrite) with:
    - Web references (3+ with specific interaction patterns extracted)
    - Stitch search terms used and patterns found (required — critic will check this)
    - Interaction inventory (all 9 items filled)
    - Screen flow defined (Screen 1 → trigger → Screen 2 → ...)
    - Stitch tokens applied (color vars, type scale, spacing)
    - Font pairing chosen and why
    - Aesthetic direction and the ONE memorable design choice
    - real_eval_rubric alignment notes for accessibility/responsive, design/interaction quality,
      user-flow completeness, and recoverability
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
3. Read `benchmark/real_eval_rubric.md` and evaluate the patch against the rubric's strongest UI/UX categories:
   - 접근성/반응형
   - 디자인 완성도와 인터랙션 품질
   - 사용자 플로우 완성도
   - 복구 가능성
   Use it as a directional product-quality bar even if this harness is not currently in the default real-eval set.
4. Evaluate the changes against these criteria (any blocking issue triggers reject):

   BLOCKING — reject if ANY of these are true:
   a) Single-page dump: all pipeline outputs (research, outline, drafts, review, final) visible
      simultaneously with no navigation, tabs, or progressive disclosure between them.
   b) No Stitch tokens: color vars, typography, or spacing not mapped to CSS variables from Stitch.
   c) Stitch discovery absent from designer-notes.md (search terms + patterns not recorded).
   d) Korean-first violation: user-visible text is predominantly English (non-aria/testid).
   e) No primary action per screen: multiple competing CTAs or no CTA on a screen.
   f) No screen transitions: clicking between screens causes instant snap with no animation.
   g) System fonts used: Inter, Roboto, Arial, system-ui present in font stack.
   h) No hover states: interactive elements have only cursor:pointer, no visual feedback.
   i) Loading state missing: async operations show no visual progress (spinner, skeleton, pulse).
   j) No prefers-reduced-motion: animations present but @media (prefers-reduced-motion) absent.
   k) Hardcoded colors: hex/rgb color values directly in component styles, not via CSS variables.
   l) Interaction inventory absent or incomplete in designer-notes.md (any of 9 items blank/TBD).
   m) Web references absent: 0 real-world references recorded in designer-notes.md.
   n) Desktop/mobile responsiveness is visibly weak or broken on first-pass inspection.
   o) Failure/retry/recovery states remain unclear enough that a user would not know how to recover.

   WARN — note but do not block:
   - Fewer than 3 web references (1-2 present but not the required 3)
   - Minor a11y gaps (missing aria-label, low contrast on non-primary elements)
   - Shadow system incomplete (less than 3 levels defined)
   - Real-eval-rubric alignment is partial even though the patch is directionally better

5. Write your verdict to {artifact_dir}/critic-report.md using this exact format:

   # Critic Report
   verdict: approve | reject
   real_eval_rubric:
     - accessibility_responsive: pass | warn | fail
     - design_interaction_quality: pass | warn | fail
     - user_flow_completeness: pass | warn | fail
     - recoverability: pass | warn | fail
   blocking_issues:
     - (one line per blocking issue, empty list if approve)
   suggestions:
     - (one line per suggestion)
   evidence:
     - (file:line references for each issue)

6. If verdict is reject, DO NOT edit code. List the issues and stop.
7. If verdict is approve, note that the patch is ready for verify.

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
3. Hunt and replace common AI/Stitch placeholder leftovers first:
   - Submit, Cancel, Loading, Next, Back, Skip, Done, Save
   - Continue, Finish, Placeholder, Enter text, Lorem ipsum
   - Flow clarity, Depth balance, Editorial polish
4. Check both quoted strings AND JSX text nodes. Visible text inside
   <p>, <span>, <button>, <label>, <h1>-<h6>, helper text, and empty states must also be Korean-first.
5. Do not change layout, logic, or unrelated files.
6. After edits, write a one-line summary to {artifact_dir}/ko-copy-fix.md listing the files touched.

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
2. Read `benchmark/real_eval_rubric.md` and `benchmark/templates/browser_review_report.template.md`, then run a minimal browser-review pass plus a Korean-first spot check.
3. In your notes, explicitly assess the current build against the rubric's UI/UX-heavy categories:
   - accessibility_responsive
   - design_interaction_quality
   - user_flow_completeness
   - recoverability
   Mark each as pass | warn | fail based on evidence from this bounded verification.
4. Write {artifact_dir}/verifier-report.md by filling the structure from
   `benchmark/templates/browser_review_report.template.md`.
   The report must include:
   - stable preview URL
   - desktop and mobile viewport outcomes
   - screenshot paths or explicit `none`
   - first-fold hierarchy verdict
   - hover/focus feedback verdict
   - transition/feedback verdict
   - loading/recovery feedback verdict
   - Korean-first visible copy verdict
   - bounded real-eval rubric verdicts
   - final handoff verdict + summary

5. Desktop and mobile checks are both mandatory unless the preview is fundamentally broken.
6. Do NOT claim a full `real_eval pass` unless live LLM, repeat-run stability, and recoverability were actually proven.
7. Do NOT remove the harness from remaining_harnesses here - the python gate + complete step handle that.

Finish as soon as verifier-report.md is written.
"""


# ----------------------------- STEPS ----------------------------- #


def step_design(harness: str, cycle: int, ctx: str, artifact_dir: Path) -> int:
    prompt = build_design_prompt(harness, cycle, ctx, artifact_dir)
    rc, _ = run_codex_step("design", prompt, artifact_dir)
    return rc


def step_critique(harness: str, cycle: int, artifact_dir: Path, prior_rounds: int = 0) -> tuple[int, bool]:
    """Returns (rc, approved). approved=True if verdict line says 'approve'."""
    prompt = build_critique_prompt(harness, cycle, artifact_dir, prior_rounds=prior_rounds)
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
    ko_rc = 1
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

        ko_rc = step_ko_copy(harness, cycle, artifact_dir)
        if ko_rc != 0:
            log("ko-copy step failed after retries; continuing to critic so the next edit round can still get feedback")

        critique_rc, approved = step_critique(harness, cycle, artifact_dir, prior_rounds=attempt)
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

    verify_rc = 1
    if design_rc == 0 and approved and ko_rc == 0:
        for attempt in range(VERIFY_MAX_RETRIES + 1):
            verify_rc = step_verify(harness, cycle, artifact_dir)
            if verify_rc == 0:
                break
            log(f"verify step rc={verify_rc} on attempt {attempt + 1}")
            if attempt >= VERIFY_MAX_RETRIES:
                break
    else:
        log("skipping verify because design/ko-copy/critique did not all pass in the same bounded cycle")

    gate_rc = step_python_gates(harness)

    if gate_rc == 0 and design_rc == 0 and approved and ko_rc == 0 and verify_rc == 0:
        step_complete_harness(harness)

    pipeline_rc = 0
    if gate_rc != 0:
        pipeline_rc = 20
    elif ko_rc != 0:
        pipeline_rc = 21
    elif design_rc != 0:
        pipeline_rc = 10
    elif not approved:
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

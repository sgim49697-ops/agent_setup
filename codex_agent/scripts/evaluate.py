# evaluate.py - 3-layer 통합 평가 러너
# L1: Playwright smoke test (pass/fail)
# L2: 정량 메트릭 (빌드, 번들, 코드량)
# L3: 주관 scorecard (기존 rubric 기반)
#
# 사용법:
#   HARNESS=single_agent python scripts/evaluate.py
#   python scripts/evaluate.py  # 전체 하네스

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


CODEX_ROOT = Path(__file__).resolve().parents[1]
BENCHMARK_DIR = CODEX_ROOT / "benchmark"

HARNESSES = [
    "single_agent",
    "sequential_pipeline",
    "parallel_sections",
    "router",
    "orchestrator_worker",
    "evaluator_optimizer",
]

EXTRA_HARNESSES = [
    "omx_evaluator_optimizer",
]

HARNESSES += EXTRA_HARNESSES


def step(msg: str) -> None:
    print(f"\n{'='*60}\n  {msg}\n{'='*60}", flush=True)


# ── L1: Playwright ──

def run_playwright(harness_name: str) -> dict:
    """앱을 preview로 띄우고 Playwright smoke test 실행."""
    app_dir = CODEX_ROOT / harness_name / "app"
    dist_dir = app_dir / "dist"

    # dist 없으면 빌드 시도
    if not dist_dir.exists():
        step(f"L1: {harness_name} - 빌드 중...")
        if not (app_dir / "node_modules").exists():
            subprocess.run(["npm", "install", "--prefer-offline"], cwd=app_dir, timeout=120)
        build = subprocess.run(["npm", "run", "build"], cwd=app_dir, capture_output=True, timeout=120)
        if build.returncode != 0:
            return {
                "smoke_total": 0, "smoke_passed": 0, "smoke_failed": 0,
                "smoke_pass_rate": 0.0, "smoke_error": "build_failed",
            }

    step(f"L1: {harness_name} - Playwright smoke test 실행")

    # vite preview를 백그라운드로 시작
    preview_proc = subprocess.Popen(
        ["npx", "vite", "preview", "--port", "4173", "--strictPort"],
        cwd=app_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    import time
    time.sleep(2)  # preview 서버 기동 대기

    try:
        result = subprocess.run(
            ["npx", "playwright", "test", "--config", str(BENCHMARK_DIR / "playwright.config.ts")],
            cwd=BENCHMARK_DIR,
            capture_output=True,
            text=True,
            timeout=60,
            env={**os.environ, "BASE_URL": "http://localhost:4173"},
        )
        print(result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
        if result.returncode != 0 and result.stderr:
            print(result.stderr[-1000:])
    finally:
        preview_proc.terminate()
        preview_proc.wait(timeout=5)

    # 결과 파싱
    results_file = BENCHMARK_DIR / "playwright" / "smoke-results.json"
    if not results_file.exists():
        return {
            "smoke_total": 0, "smoke_passed": 0, "smoke_failed": 0,
            "smoke_pass_rate": 0.0, "smoke_error": "no_results_file",
        }

    data = json.loads(results_file.read_text(encoding="utf-8"))
    passed = 0
    failed = 0
    failed_names: list[str] = []

    def walk(suites: list) -> None:
        nonlocal passed, failed
        for suite in suites:
            for spec in suite.get("specs", []):
                for test in spec.get("tests", []):
                    title = spec.get("title", "unknown")
                    for r in test.get("results", []):
                        if r.get("status") == "passed":
                            passed += 1
                        else:
                            failed += 1
                            failed_names.append(title)
            walk(suite.get("suites", []))

    walk(data.get("suites", []))
    total = passed + failed
    return {
        "smoke_total": total,
        "smoke_passed": passed,
        "smoke_failed": failed,
        "smoke_pass_rate": round(passed / total, 4) if total > 0 else 0.0,
        "smoke_failed_tests": failed_names[:10],
    }


# ── L2: 정량 메트릭 ──

def collect_quantitative(harness_name: str) -> dict:
    """빌드, 코드량, 번들 크기 등 정량 데이터."""
    sys.path.insert(0, str(CODEX_ROOT / "scripts"))
    from collect_metrics import collect_for_harness
    return collect_for_harness(harness_name, CODEX_ROOT)


# ── L3: 기존 scorecard 로드 ──

def load_scorecard(harness_name: str) -> dict | None:
    """reports/scorecard.json이 있으면 로드."""
    path = CODEX_ROOT / harness_name / "reports" / "scorecard.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


# ── 통합 리포트 ──

def compute_final_score(l1: dict, l2: dict, l3: dict | None) -> dict:
    """L1/L2/L3를 가중 합산하여 최종 점수 산출.

    가중치 (L3 존재 시):
      L1 (Playwright pass rate):  30%  — 기계적 pass/fail, 가장 객관적
      L2 (빌드 성공 + 코드 효율):  20%  — 빌드 실패 = 0점
      L3 (주관 scorecard):        50%  — 기존 rubric 기반

    L3 미작성 시:
      scorecard가 없으면 평가 미완료로 간주.
      L1/L2만으로 최대 5.0까지만 받을 수 있다 (50% 캡).
      → Codex가 scorecard를 건너뛰는 역인센티브 방지.
    """
    # L1 점수: pass rate * 10
    l1_score = l1.get("smoke_pass_rate", 0) * 10

    # L2 점수: 빌드 성공 여부 기반 (10점 만점)
    if l2.get("build_success"):
        l2_score = 10.0
    else:
        l2_score = 0.0

    # L3 점수: overall_score 그대로 (10점 만점)
    if l3 and "overall_score" in l3:
        l3_score = l3["overall_score"]
        weights = {"l1": 0.30, "l2": 0.20, "l3": 0.50}
        l3_missing = False
    else:
        # L3 없으면 최대 5.0 (평가 미완료 페널티)
        l3_score = 0.0
        weights = {"l1": 0.30, "l2": 0.20, "l3": 0.0}
        l3_missing = True

    raw = round(
        l1_score * weights["l1"]
        + l2_score * weights["l2"]
        + l3_score * weights["l3"],
        2,
    )

    # L3 미작성 시 최대 5.0 캡
    final = min(raw, 5.0) if l3_missing else raw

    return {
        "l1_smoke_score": round(l1_score, 2),
        "l2_build_score": round(l2_score, 2),
        "l3_subjective_score": round(l3_score, 2),
        "l3_missing": l3_missing,
        "weights": weights,
        "final_score": final,
    }


def evaluate_harness(harness_name: str) -> dict:
    """하나의 하네스를 전체 평가."""
    step(f"평가 시작: {harness_name}")

    # L1
    l1 = run_playwright(harness_name)
    print(f"  L1 smoke: {l1.get('smoke_passed')}/{l1.get('smoke_total')} passed")

    # L2
    step(f"L2: {harness_name} - 정량 메트릭 수집")
    l2 = collect_quantitative(harness_name)
    print(f"  L2 build: {'OK' if l2.get('build_success') else 'FAIL'}")
    print(f"  L2 files: {l2.get('source_files')} / lines: {l2.get('source_lines')}")

    # L3
    l3 = load_scorecard(harness_name)
    if l3:
        print(f"  L3 scorecard: {l3.get('overall_score')}")
    else:
        print("  L3 scorecard: (없음 - L1/L2만으로 평가)")

    # 최종 합산
    final = compute_final_score(l1, l2, l3)
    print(f"\n  >>> FINAL SCORE: {final['final_score']}/10")

    report = {
        "harness": harness_name,
        "evaluated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "l1_playwright": l1,
        "l2_quantitative": l2,
        "l3_scorecard": l3,
        "final": final,
    }

    # 저장
    out_path = CODEX_ROOT / harness_name / "reports" / "evaluation_report.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  Saved → {out_path}")

    return report


def main() -> int:
    target = os.environ.get("HARNESS")
    harnesses = [target] if target else HARNESSES

    all_reports = []
    for name in harnesses:
        harness_dir = CODEX_ROOT / name
        if not harness_dir.exists():
            print(f"[skip] {name} 디렉토리 없음")
            continue
        report = evaluate_harness(name)
        all_reports.append(report)

    # 요약 테이블
    step("최종 비교 요약")
    print(f"{'harness':<25} {'L1(smoke)':>10} {'L2(build)':>10} {'L3(subj)':>10} {'FINAL':>8}")
    print("-" * 70)
    for r in all_reports:
        f = r["final"]
        print(
            f"{r['harness']:<25} "
            f"{f['l1_smoke_score']:>10.1f} "
            f"{f['l2_build_score']:>10.1f} "
            f"{f['l3_subjective_score']:>10.1f} "
            f"{f['final_score']:>8.2f}"
        )

    # 전체 비교 저장
    if len(all_reports) > 1:
        summary_path = BENCHMARK_DIR / "evaluation_summary.json"
        summary = {
            "evaluated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "results": [
                {
                    "harness": r["harness"],
                    **r["final"],
                }
                for r in all_reports
            ],
        }
        summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nSummary → {summary_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

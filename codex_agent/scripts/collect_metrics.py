# collect_metrics.py - L2 정량 메트릭 수집기
# 각 하네스 앱의 기계적 메트릭을 수집하여 metrics.json 생성

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path


def count_source_files(app_dir: Path) -> dict:
    """src/ 내 소스 파일 수와 총 라인 수 수집."""
    src_dir = app_dir / "src"
    if not src_dir.exists():
        return {"source_files": 0, "source_lines": 0}

    exts = {".ts", ".tsx", ".js", ".jsx", ".css", ".html"}
    files = [f for f in src_dir.rglob("*") if f.suffix in exts and f.is_file()]
    total_lines = 0
    for f in files:
        try:
            total_lines += len(f.read_text(encoding="utf-8").splitlines())
        except Exception:
            pass
    return {"source_files": len(files), "source_lines": total_lines}


def measure_build(app_dir: Path) -> dict:
    """npm run build 시간 측정. 실패 시 -1 반환."""
    if not (app_dir / "package.json").exists():
        return {"build_success": False, "build_seconds": -1}

    # node_modules 없으면 설치
    if not (app_dir / "node_modules").exists():
        install_result = subprocess.run(
            ["npm", "install", "--prefer-offline"],
            cwd=app_dir,
            capture_output=True,
            timeout=120,
        )
        if install_result.returncode != 0:
            return {"build_success": False, "build_seconds": -1}

    start = time.monotonic()
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=app_dir,
        capture_output=True,
        timeout=120,
    )
    elapsed = round(time.monotonic() - start, 2)
    return {"build_success": result.returncode == 0, "build_seconds": elapsed}


def measure_bundle_size(app_dir: Path) -> dict:
    """dist/ 폴더의 총 바이트 크기."""
    dist_dir = app_dir / "dist"
    if not dist_dir.exists():
        return {"bundle_bytes": 0}
    total = sum(f.stat().st_size for f in dist_dir.rglob("*") if f.is_file())
    return {"bundle_bytes": total}


def parse_playwright_results(benchmark_dir: Path) -> dict:
    """playwright smoke-results.json 파싱."""
    results_file = benchmark_dir / "playwright" / "smoke-results.json"
    if not results_file.exists():
        return {"smoke_total": 0, "smoke_passed": 0, "smoke_failed": 0, "smoke_pass_rate": 0.0}

    data = json.loads(results_file.read_text(encoding="utf-8"))
    suites = data.get("suites", [])
    passed = 0
    failed = 0

    def walk_suites(suite_list: list) -> None:
        nonlocal passed, failed
        for suite in suite_list:
            for spec in suite.get("specs", []):
                for test in spec.get("tests", []):
                    for result in test.get("results", []):
                        if result.get("status") == "passed":
                            passed += 1
                        else:
                            failed += 1
            walk_suites(suite.get("suites", []))

    walk_suites(suites)
    total = passed + failed
    rate = round(passed / total, 4) if total > 0 else 0.0
    return {
        "smoke_total": total,
        "smoke_passed": passed,
        "smoke_failed": failed,
        "smoke_pass_rate": rate,
    }


def collect_for_harness(harness_name: str, codex_root: Path) -> dict:
    """하나의 하네스에 대한 전체 메트릭 수집."""
    harness_dir = codex_root / harness_name
    app_dir = harness_dir / "app"
    benchmark_dir = codex_root / "benchmark"

    metrics: dict = {"harness": harness_name}
    metrics.update(count_source_files(app_dir))
    metrics.update(measure_build(app_dir))
    metrics.update(measure_bundle_size(app_dir))
    metrics.update(parse_playwright_results(benchmark_dir))

    # run_manifest에서 실행 시간 추출
    manifest_file = harness_dir / "runs" / "run_manifest.json"
    if manifest_file.exists():
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        metrics["run_status"] = manifest.get("status", "unknown")
        started = manifest.get("started_at")
        finished = manifest.get("finished_at")
        if started and finished:
            from datetime import datetime, timezone

            fmt = "%Y-%m-%dT%H:%M:%SZ"
            try:
                t0 = datetime.strptime(started, fmt).replace(tzinfo=timezone.utc)
                t1 = datetime.strptime(finished, fmt).replace(tzinfo=timezone.utc)
                metrics["run_duration_seconds"] = (t1 - t0).total_seconds()
            except ValueError:
                metrics["run_duration_seconds"] = -1
    else:
        metrics["run_status"] = "not_started"

    return metrics


def main() -> int:
    codex_root = Path(__file__).resolve().parents[1]
    harness_name = os.environ.get("HARNESS")

    harnesses = (
        [harness_name]
        if harness_name
        else [
            "single_agent",
            "sequential_pipeline",
            "parallel_sections",
            "router",
            "orchestrator_worker",
            "evaluator_optimizer",
            "omx_evaluator_optimizer",
        ]
    )

    all_metrics = []
    for name in harnesses:
        print(f"[collect] {name} ...", flush=True)
        m = collect_for_harness(name, codex_root)
        all_metrics.append(m)
        print(f"  build={'OK' if m.get('build_success') else 'FAIL'}  "
              f"files={m.get('source_files', 0)}  "
              f"lines={m.get('source_lines', 0)}  "
              f"bundle={m.get('bundle_bytes', 0)}B  "
              f"smoke={m.get('smoke_passed', 0)}/{m.get('smoke_total', 0)}")

    # 결과 저장
    if harness_name:
        out_path = codex_root / harness_name / "reports" / "metrics.json"
    else:
        out_path = codex_root / "benchmark" / "all_metrics.json"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(all_metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[collect] Saved → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

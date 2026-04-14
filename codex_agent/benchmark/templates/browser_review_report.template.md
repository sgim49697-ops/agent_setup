# Browser Review Report

metadata:
  harness: <harness>
  cycle: <cycle>
  preview_url: <stable preview url>
  reviewer: verifier
  rubric_source: benchmark/real_eval_rubric.md

evidence:
  screenshots:
    - desktop: <path or none>
    - mobile: <path or none>
    - optional_final: <path or none>
  viewport_checks:
    - desktop: pass | warn | fail
    - mobile: pass | warn | fail
  notes:
    - <browser-review evidence bullet>

browser_review:
  first_fold_hierarchy: pass | warn | fail
  desktop_responsive: pass | warn | fail
  mobile_responsive: pass | warn | fail
  hover_focus_feedback: pass | warn | fail
  transition_feedback: pass | warn | fail
  loading_recovery_feedback: pass | warn | fail
  korean_first_visible_copy: pass | warn | fail

real_eval_rubric:
  accessibility_responsive: pass | warn | fail
  design_interaction_quality: pass | warn | fail
  user_flow_completeness: pass | warn | fail
  recoverability: pass | warn | fail

open_issues:
  - <issue or ->

handoff:
  verdict: pass | fail
  summary: <one-paragraph summary>
  real_eval_claim: bounded-only | full-pass-proven

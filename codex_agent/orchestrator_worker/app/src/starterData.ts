// starterData.ts - orchestrator_worker 워크스페이스의 정적 데이터

import type { DeliverableCard, TopicPreset, WorkflowStage, WorkerProfile } from './contracts'

export const workflowStages: WorkflowStage[] = [
  {
    id: 'research',
    label: '리서치 결과 (Research results)',
    description: 'Orchestrator가 분해 기준을 먼저 잡고 content worker가 리서치 핵심을 만든다.',
  },
  {
    id: 'outline',
    label: '아웃라인 (Outline)',
    description: 'Task bundles와 worker ownership을 토대로 구조를 고정한다.',
  },
  {
    id: 'drafts',
    label: '섹션 초안 (Section drafts)',
    description: '각 worker가 맡은 deliverable preview를 만들고 content draft를 연결한다.',
  },
  {
    id: 'review',
    label: '리뷰 노트 (Review notes)',
    description: 'Integrator가 layout, state, content consistency를 점검한다.',
  },
  {
    id: 'final',
    label: '최종 글 (Final post)',
    description: '통합 리뷰를 거친 최종 Markdown과 export 상태를 제공한다.',
  },
]

export const workerProfiles: WorkerProfile[] = [
  {
    id: 'ui_worker',
    label: 'UI 워커 (UI Worker)',
    focus: 'stage tracker, CTA copy, empty/error UX, 정보 계층을 정리한다.',
    reviewLens: 'visual hierarchy and next-action clarity',
  },
  {
    id: 'state_worker',
    label: '상태 워커 (State Worker)',
    focus: 'loading, populated, review-complete, export-ready semantics를 설계한다.',
    reviewLens: 'state transition and interaction consistency',
  },
  {
    id: 'content_worker',
    label: '콘텐츠 워커 (Content Worker)',
    focus: 'research, outline, drafts, review, final markdown를 생성한다.',
    reviewLens: 'editorial flow and content usefulness',
  },
]

export const deliverables: DeliverableCard[] = [
  {
    id: 'manifest',
    title: 'run_manifest.json',
    description: 'orchestrator_worker run id, spec version, 시작/종료 시각, 상태를 남긴다.',
  },
  {
    id: 'artifacts',
    title: 'artifact_index.json',
    description: '스크린샷, final URL, task decomposition note, evaluation note를 저장한다.',
  },
  {
    id: 'review',
    title: 'review_report.md',
    description: '분해/ownership/integration fixes와 평가 결과 요약을 남긴다.',
  },
  {
    id: 'scorecard',
    title: 'scorecard.json',
    description: '공통 rubric 기준의 L3 점수를 저장한다.',
  },
  {
    id: 'evaluation',
    title: 'evaluation_report.json',
    description: 'L1/L2/L3 합산 결과를 평가 러너가 자동 생성한다.',
  },
]

export const topicPresets: TopicPreset[] = [
  {
    title: 'LangGraph 1.0에서 Supervisor 패턴 설계하기',
    audience: 'practitioner',
    tone: 'pragmatic',
    length: 'medium',
    rationale: '분해 기준과 상태/콘텐츠 ownership을 설명하기 좋은 주제',
  },
  {
    title: 'React Compiler 시대의 memoization 전략',
    audience: 'advanced',
    tone: 'opinionated',
    length: 'short',
    rationale: 'UI copy, 상태 전환, 콘텐츠 결론을 역할별로 나누기 좋은 주제',
  },
  {
    title: 'RAG에서 Vector DB 선택 기준과 트레이드오프',
    audience: 'practitioner',
    tone: 'clear',
    length: 'long',
    rationale: 'worker ownership이 길어진 글에서도 유지되는지 보기 좋은 주제',
  },
]

export const reviewLenses = [
  '분해 기준이 첫 화면에서 읽히는가',
  'ownership 분리가 충분히 명확한가',
  'integration 흐름이 일관되게 느껴지는가',
  '반응형 흐름이 안정적인가',
  '기본 접근성이 확보됐는가',
]

export const evaluationChecklist = [
  '앱을 `npm run build`로 빌드한다.',
  '`reports/scorecard.json`을 최신 상태로 둔다.',
  '`HARNESS=orchestrator_worker uv run python scripts/evaluate.py`를 실행한다.',
  '`reports/evaluation_report.json` 생성 여부를 확인한다.',
]

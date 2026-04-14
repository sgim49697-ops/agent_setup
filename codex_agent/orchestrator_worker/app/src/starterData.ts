// starterData.ts - orchestrator_worker 워크스페이스의 정적 데이터

import type { DeliverableCard, TopicPreset, WorkflowStage, WorkerProfile } from './contracts'

export const workflowStages: WorkflowStage[] = [
  {
    id: 'research',
    label: '리서치 결과',
    description: '오케스트레이터가 분해 기준을 먼저 잡고 콘텐츠 워커가 리서치 핵심을 만든다.',
  },
  {
    id: 'outline',
    label: '아웃라인',
    description: '작업 번들과 워커 소유 범위를 토대로 구조를 고정한다.',
  },
  {
    id: 'drafts',
    label: '섹션 초안',
    description: '각 워커가 맡은 산출물 미리보기를 만들고 콘텐츠 초안을 연결한다.',
  },
  {
    id: 'review',
    label: '리뷰 노트',
    description: '통합 담당자가 레이아웃, 상태, 콘텐츠 일관성을 점검한다.',
  },
  {
    id: 'final',
    label: '최종 글',
    description: '통합 리뷰를 거친 최종 마크다운과 내보내기 상태를 제공한다.',
  },
]

export const workerProfiles: WorkerProfile[] = [
  {
    id: 'ui_worker',
    label: '화면 워커',
    focus: '단계 추적기, 행동 문구, 빈/오류 화면, 정보 계층을 정리한다.',
    reviewLens: '시각 계층과 다음 행동 선명도',
  },
  {
    id: 'state_worker',
    label: '상태 워커',
    focus: '로딩, 초안 준비, 리뷰 완료, 내보내기 준비 의미 체계를 설계한다.',
    reviewLens: '상태 전이와 인터랙션 일관성',
  },
  {
    id: 'content_worker',
    label: '콘텐츠 워커',
    focus: '리서치, 아웃라인, 초안, 리뷰, 최종 마크다운을 생성한다.',
    reviewLens: '편집 흐름과 콘텐츠 실용성',
  },
]

export const deliverables: DeliverableCard[] = [
  {
    id: 'manifest',
    title: 'run_manifest.json',
    description: 'orchestrator_worker 실행 ID, 스펙 버전, 시작/종료 시각, 상태를 남긴다.',
  },
  {
    id: 'artifacts',
    title: 'artifact_index.json',
    description: '스크린샷, 최종 URL, 작업 분해 메모, 평가 메모를 저장한다.',
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
    rationale: '분해 기준과 상태/콘텐츠 소유 범위를 설명하기 좋은 주제',
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
    rationale: '워커 소유 범위가 길어진 글에서도 유지되는지 보기 좋은 주제',
  },
]

export const reviewLenses = [
  '분해 기준이 첫 화면에서 읽히는가',
  '소유 범위 분리가 충분히 명확한가',
  '통합 흐름이 일관되게 느껴지는가',
  '반응형 흐름이 안정적인가',
  '기본 접근성이 확보됐는가',
]

export const evaluationChecklist = [
  '앱을 `npm run build`로 빌드한다.',
  '`reports/scorecard.json`을 최신 상태로 둔다.',
  '`HARNESS=orchestrator_worker uv run python scripts/evaluate.py`를 실행한다.',
  '`reports/evaluation_report.json` 생성 여부를 확인한다.',
]

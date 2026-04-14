// starterData.ts - router 워크스페이스의 정적 데이터

import type { DeliverableCard, SpecialistProfile, TopicPreset, WorkflowStage } from './contracts'

export const workflowStages: WorkflowStage[] = [
  {
    id: 'research',
    label: '리서치 결과',
    description: '라우터가 topic을 분류하고 specialist 시각으로 리서치 앵글을 만든다.',
  },
  {
    id: 'outline',
    label: '개요',
    description: '선택된 specialist가 자기 렌즈에 맞는 글 구조를 설계한다.',
  },
  {
    id: 'drafts',
    label: '섹션 초안',
    description: '선택된 specialist가 섹션 초안을 작성한다.',
  },
  {
    id: 'review',
    label: '검토 메모',
    description: 'specialist별 리뷰 렌즈로 초안을 점검하고 수정 포인트를 남긴다.',
  },
  {
    id: 'final',
    label: '최종 포스트',
    description: '선택 근거와 specialist 스타일이 반영된 Markdown을 export한다.',
  },
]

export const specialistProfiles: SpecialistProfile[] = [
  {
    id: 'frontend',
    label: '프론트엔드 스페셜리스트',
    writingFocus: '브라우저 UX, 렌더링 감각, 사용 흐름을 앞세운다.',
    uiLens: '예시 흐름, UI 상태, interaction 비용을 강조한다.',
    reviewLens: 'clarity, usability, rendering trade-off를 중심으로 점검한다.',
  },
  {
    id: 'orchestration',
    label: '오케스트레이션 스페셜리스트',
    writingFocus: '역할 구조, 단계 흐름, 상태 경계를 분명하게 설명한다.',
    uiLens: 'pipeline order, handoff, control loop를 강조한다.',
    reviewLens: 'stage logic, coordination clarity, failure mode coverage를 점검한다.',
  },
  {
    id: 'infra',
    label: '인프라 스페셜리스트',
    writingFocus: '선택 기준, 비용, 확장성, latency를 비교 축으로 잡는다.',
    uiLens: 'trade-off matrix와 운영 리스크를 강조한다.',
    reviewLens: 'decision criteria, downside coverage, rollout caution을 점검한다.',
  },
  {
    id: 'fallback',
    label: '폴백 스페셜리스트',
    writingFocus: '불확실성을 숨기지 않고 범용적인 설명 구조로 정리한다.',
    uiLens: 'balanced framing과 안전한 일반화에 집중한다.',
    reviewLens: 'missing certainty, safer framing, next question clarity를 점검한다.',
  },
]

export const deliverables: DeliverableCard[] = [
  {
    id: 'manifest',
    title: 'run_manifest.json',
    description: 'router run id, spec version, 시작/종료 시각, 상태를 남긴다.',
  },
  {
    id: 'artifacts',
    title: 'artifact_index.json',
    description: '스크린샷, final URL, routing trace note, evaluation note를 저장한다.',
  },
  {
    id: 'review',
    title: 'review_report.md',
    description: '선택된 specialist와 fallback handling, 평가 결과 요약을 남긴다.',
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
    rationale: 'langgraph와 supervisor 신호가 강해서 orchestration specialist로 가기 좋은 주제',
  },
  {
    title: 'React Compiler 시대의 memoization 전략',
    audience: 'advanced',
    tone: 'opinionated',
    length: 'short',
    rationale: 'react, compiler 신호가 강한 frontend specialist용 주제',
  },
  {
    title: 'RAG에서 Vector DB 선택 기준과 트레이드오프',
    audience: 'practitioner',
    tone: 'clear',
    length: 'long',
    rationale: 'rag와 vector db 신호가 강한 infra specialist용 주제',
  },
  {
    title: 'Engineering team knowledge sharing habits',
    audience: 'practitioner',
    tone: 'clear',
    length: 'medium',
    rationale: '특정 specialist 신호가 약해서 fallback route를 보여주기 좋은 주제',
  },
]

export const reviewLenses = [
  '라우팅 근거가 기본 화면에서 읽히는가',
  '선택된 specialist 차이가 결과에 드러나는가',
  'fallback 경로가 이해되기 쉬운가',
  '반응형 흐름이 안정적인가',
  '기본 접근성이 확보됐는가',
]

export const evaluationChecklist = [
  '앱을 `npm run build`로 빌드한다.',
  '`reports/scorecard.json`을 최신 상태로 둔다.',
  '`HARNESS=router uv run python scripts/evaluate.py`를 실행한다.',
  '`reports/evaluation_report.json` 생성 여부를 확인한다.',
]

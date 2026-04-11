// starterData.ts - 공통 benchmark starter용 정적 데이터

import type { DeliverableCard, TopicPreset, WorkflowStage } from './contracts'

export const workflowStages: WorkflowStage[] = [
  {
    id: 'research',
    label: 'Research results',
    output: 'research_summary',
    description: '핵심 사실, 비교 포인트, 참고 근거를 구조화한다.',
  },
  {
    id: 'outline',
    label: 'Outline',
    output: 'outline',
    description: '문단 구조와 논리 흐름을 설계한다.',
  },
  {
    id: 'drafts',
    label: 'Section drafts',
    output: 'section_drafts',
    description: '섹션별 초안을 작성하고 일관성을 유지한다.',
  },
  {
    id: 'review',
    label: 'Review notes',
    output: 'review_notes',
    description: '빠진 논점, 과장, 모호성을 검토한다.',
  },
  {
    id: 'final',
    label: 'Final post',
    output: 'final_post',
    description: '최종 Markdown 결과물과 export 액션을 제공한다.',
  },
]

export const deliverables: DeliverableCard[] = [
  {
    id: 'manifest',
    title: 'run_manifest.json',
    description: '실행 시작/종료 시각, harness 이름, 상태를 남긴다.',
  },
  {
    id: 'artifacts',
    title: 'artifact_index.json',
    description: '스크린샷, final URL, 결과 파일 목록을 모은다.',
  },
  {
    id: 'review',
    title: 'review_report.md',
    description: '구현 요약, 리스크, 남은 이슈, self-evaluation을 남긴다.',
  },
  {
    id: 'scorecard',
    title: 'scorecard.json',
    description: '기능, UX, visual, a11y, process 점수를 저장한다.',
  },
]

export const topicPresets: TopicPreset[] = [
  {
    title: 'LangGraph 1.0에서 Supervisor 패턴 설계하기',
    audience: 'practitioner',
    tone: 'pragmatic',
    length: 'medium',
    rationale: '역할 분리와 상태 경계를 설명하기 좋은 주제',
  },
  {
    title: 'React Compiler 시대의 memoization 전략',
    audience: 'advanced',
    tone: 'opinionated',
    length: 'short',
    rationale: '논지 일관성과 요약력이 중요한 주제',
  },
  {
    title: 'RAG에서 Vector DB 선택 기준과 트레이드오프',
    audience: 'practitioner',
    tone: 'clear',
    length: 'long',
    rationale: '리서치 요약과 구조화가 중요한 주제',
  },
]

export const reviewLenses = [
  'flow clarity',
  'visual quality',
  'responsiveness',
  'a11y basics',
  'process adherence',
]

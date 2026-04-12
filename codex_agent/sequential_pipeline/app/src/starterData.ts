// starterData.ts - sequential pipeline용 정적 benchmark 데이터

import type { DeliverableCard, PipelineRoleCard, TopicPreset } from './contracts'

export const pipelineRoles: PipelineRoleCard[] = [
  {
    id: 'researcher',
    label: 'Researcher',
    stageLabel: 'Research results',
    description: '주제 브리프를 angle, thesis, supporting facts로 정리한다.',
    handoffLabel: 'Hands off to Outliner',
  },
  {
    id: 'outliner',
    label: 'Outliner',
    stageLabel: 'Outline',
    description: 'research 결과를 읽기 좋은 section order로 변환한다.',
    handoffLabel: 'Hands off to Writer',
  },
  {
    id: 'writer',
    label: 'Writer',
    stageLabel: 'Section drafts',
    description: 'outline을 section drafts와 pre-review markdown로 확장한다.',
    handoffLabel: 'Hands off to Reviewer',
  },
  {
    id: 'reviewer',
    label: 'Reviewer',
    stageLabel: 'Review notes',
    description: 'writer 초안을 보정하고 최종 Markdown을 확정한다.',
    handoffLabel: 'Prepares Final post',
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
  'handoff clarity',
  'reviewer reflection',
  'responsiveness',
  'a11y basics',
  'process adherence',
]

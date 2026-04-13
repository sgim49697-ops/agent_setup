// starterData.ts - sequential pipeline용 정적 benchmark 데이터

import type { DeliverableCard, PipelineRoleCard, TopicPreset } from './contracts'

export const pipelineRoles: PipelineRoleCard[] = [
  {
    id: 'researcher',
    label: '리서처',
    stageLabel: '자료 요약',
    description: '주제 브리프를 angle, thesis, supporting facts로 정리한다.',
    handoffLabel: '아웃라이너에게 전달',
  },
  {
    id: 'outliner',
    label: '아웃라이너',
    stageLabel: '구조 설계',
    description: 'research 결과를 읽기 좋은 section order로 변환한다.',
    handoffLabel: '라이터에게 전달',
  },
  {
    id: 'writer',
    label: '라이터',
    stageLabel: '초안 작성',
    description: 'outline을 section drafts와 pre-review markdown로 확장한다.',
    handoffLabel: '리뷰어에게 전달',
  },
  {
    id: 'reviewer',
    label: '리뷰어',
    stageLabel: '검토 메모',
    description: 'writer 초안을 보정하고 최종 Markdown을 확정한다.',
    handoffLabel: '최종 원고 잠금',
  },
]

export const deliverables: DeliverableCard[] = [
  {
    id: 'manifest',
    title: '실행 기록',
    description: '`run_manifest.json`에 시작/종료 시각, harness 이름, 상태를 남긴다.',
  },
  {
    id: 'artifacts',
    title: '산출물 목록',
    description: '`artifact_index.json`에 스크린샷, final URL, 결과 파일 목록을 모은다.',
  },
  {
    id: 'review',
    title: '검토 보고',
    description: '`review_report.md`에 구현 요약, 리스크, 남은 이슈를 남긴다.',
  },
  {
    id: 'scorecard',
    title: '점수 카드',
    description: '`scorecard.json`에 기능, UX, visual, a11y, process 점수를 저장한다.',
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
  '인계 선명도',
  '리뷰 반영도',
  '반응형',
  '기본 접근성',
  '프로세스 준수',
]

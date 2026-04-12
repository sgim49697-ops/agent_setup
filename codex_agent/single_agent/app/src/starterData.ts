// starterData.ts - 공통 benchmark starter용 정적 데이터

import type { DeliverableCard, TopicPreset, WorkflowStage } from './contracts'

export const workflowStages: WorkflowStage[] = [
  {
    id: 'research',
    label: '리서치 결과',
    hook: 'Research results',
    output: 'research_summary',
    description: '핵심 사실, 비교 포인트, 참고 근거를 한눈에 정리한다.',
  },
  {
    id: 'outline',
    label: '개요 설계',
    hook: 'Outline',
    output: 'outline',
    description: '문단 순서와 흐름을 읽기 좋은 구조로 잡는다.',
  },
  {
    id: 'drafts',
    label: '섹션 초안',
    hook: 'Section drafts',
    output: 'section_drafts',
    description: '섹션별 초안을 쓰고 톤과 밀도를 맞춘다.',
  },
  {
    id: 'review',
    label: '검토 메모',
    hook: 'Review notes',
    output: 'review_notes',
    description: '빠진 논점, 과장, 모호성을 빠르게 점검한다.',
  },
  {
    id: 'final',
    label: '최종 원고',
    hook: 'Final post',
    output: 'final_post',
    description: '최종 마크다운과 내보내기 준비 상태를 확인한다.',
  },
]

export const deliverables: DeliverableCard[] = [
  {
    id: 'manifest',
    title: '실행 기록',
    description: '실행 시작/종료 시각, harness 이름, 상태를 남긴다.',
  },
  {
    id: 'artifacts',
    title: '산출물 목록',
    description: '스크린샷, final URL, 결과 파일 목록을 모은다.',
  },
  {
    id: 'review',
    title: '리뷰 보고서',
    description: '구현 요약, 리스크, 남은 이슈, 자체 평가를 남긴다.',
  },
  {
    id: 'scorecard',
    title: '점수 카드',
    description: '기능, UX, 시각 완성도, 접근성, 절차 점수를 저장한다.',
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
  '흐름 명확성',
  '시각 완성도',
  '반응형 대응',
  '접근성 기본기',
  '절차 준수',
]

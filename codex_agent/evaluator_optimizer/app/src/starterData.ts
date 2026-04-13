// starterData.ts - evaluator_optimizer Loop Lab 정적 데이터

import type { DeliverableCard, TopicPreset, WorkflowStage } from './contracts'

export const workflowStages: WorkflowStage[] = [
  {
    id: 'research',
    label: '연구 결과',
    hookLabel: 'Research results',
    output: 'research_summary',
    description:
      '작성자가 논점을 세우고, 리뷰어가 허점을 짚고, 수정자가 근거 밀도를 조여 첫 인상을 단단하게 만듭니다.',
  },
  {
    id: 'outline',
    label: '개요',
    hookLabel: 'Outline',
    output: 'outline',
    description: '반복 루프가 섹션 순서를 잠그고, 각 섹션이 무엇을 증명해야 하는지 분명하게 만듭니다.',
  },
  {
    id: 'drafts',
    label: '섹션 초안',
    hookLabel: 'Section drafts',
    output: 'section_drafts',
    description:
      '각 반복이 초안을 다시 밀어 붙여, 메모처럼 흩어진 글을 하나의 주장처럼 읽히는 원고로 바꿉니다.',
  },
  {
    id: 'review',
    label: '리뷰 메모',
    hookLabel: 'Review notes',
    output: 'review_notes',
    description:
      '엄격한 리뷰어가 9개 체크리스트를 채점하고, 아직 출시를 막는 지점을 수정자에게 정확히 넘깁니다.',
  },
  {
    id: 'final',
    label: '최종 원고',
    hookLabel: 'Final post',
    output: 'final_post',
    description: '마지막 반복만 승인본 마크다운을 열 수 있고, 그 전까지는 내보내기가 잠긴 상태를 유지합니다.',
  },
]

export const topicPresets: TopicPreset[] = [
  {
    title: 'LangGraph 1.0에서 Supervisor 패턴 설계하기',
    audience: 'practitioner',
    tone: 'pragmatic',
    length: 'medium',
    rationale: '역할 경계, 반복 검증, release criteria를 설명하기 좋은 주제',
  },
  {
    title: 'React Compiler 시대의 memoization 전략',
    audience: 'advanced',
    tone: 'opinionated',
    length: 'short',
    rationale: '거친 초안에서 명확한 주장으로 다듬는 과정을 보여주기 좋다',
  },
  {
    title: 'RAG에서 Vector DB 선택 기준과 트레이드오프',
    audience: 'practitioner',
    tone: 'clear',
    length: 'long',
    rationale: '리서치와 리뷰 기준이 많은 주제라 반복 최적화가 잘 드러난다',
  },
  {
    title: 'Frontend 팀이 에이전트 평가판을 운영할 때 필요한 QA 루프',
    audience: 'beginner',
    tone: 'clear',
    length: 'medium',
    rationale: 'UX, 상태, 평가 readiness를 한 화면에서 설명하기 좋은 주제',
  },
]

export const checklistLabels = [
  '입력 계약 완성도',
  '생성 흐름 충실도',
  '상태 머신 완성도',
  '에러 처리 품질',
  '내보내기 동작',
  '반응형 레이아웃',
  '접근성 기본기',
  '시각 완성도',
  '하네스 프로세스 준수',
]

export const deliverables: DeliverableCard[] = [
  {
    id: 'iteration-log',
    title: '반복 기록 장부',
    path: 'runs/iteration_log.md',
    description: '최소 3회의 작성자-리뷰어-수정자 루프와 각 반복의 통과/보류/실패 집계를 남깁니다.',
  },
  {
    id: 'manifest',
    title: '실행 명세 묶음',
    path: 'runs/run_manifest.json',
    description: '하네스 이름, 실행 식별자, 타임스탬프, 스펙 버전, 종료 상태를 기록합니다.',
  },
  {
    id: 'scorecard',
    title: '평가 점수표',
    path: 'reports/scorecard.json',
    description: '과업 적합성, UX, 반응형, 접근성, 프로세스, 전체 평가 입력값을 담습니다.',
  },
  {
    id: 'evaluation',
    title: '통합 평가 리포트',
    path: 'reports/evaluation_report.json',
    description: 'scripts/evaluate.py가 생성한 통합 L1/L2/L3 평가 결과입니다.',
  },
]

export const evaluationTargets = [
  '앱 런타임에서 정확히 3개의 가시 루프를 드러냅니다.',
  'iteration_log.md에 최소 3회의 실제 리뷰·수정 반복을 남깁니다.',
  '마지막 가시 루프에서 8개 이상의 통과 판정을 확보합니다.',
  '승인된 최종 원고를 내보내기 가능 상태로 만들고 스모크, 빌드, 평가를 유지합니다.',
]

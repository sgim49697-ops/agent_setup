// starterData.ts - omx_evaluator_optimizer Gauntlet Lab 정적 데이터

import type { DeliverableCard, TopicPreset, WorkflowStage } from './contracts'

export const requiredLoops = 10

export const workflowStages: WorkflowStage[] = [
  {
    id: 'research',
    label: '연구 결과',
    output: 'research_summary',
    description:
      '작성자가 논점을 세우고, 리뷰어가 근거 밀도와 주장 강도를 반복해서 다시 점검합니다.',
  },
  {
    id: 'outline',
    label: '개요',
    output: 'outline',
    description:
      '매 루프마다 구조를 다듬어, 메모 묶음이 아니라 하나의 추천안처럼 읽히도록 압축합니다.',
  },
  {
    id: 'drafts',
    label: '섹션 초안',
    output: 'section_drafts',
    description:
      '수정자가 섹션을 반복 정리해도 명확성, 위계, 리듬이 무너지지 않도록 붙잡습니다.',
  },
  {
    id: 'review',
    label: '리뷰 메모',
    output: 'review_notes',
    description:
      '9개 체크리스트 게이트를 계속 드러내, 실패와 보류 판정이 낙관적 요약 뒤로 숨지 않게 합니다.',
  },
  {
    id: 'final',
    label: '최종 원고',
    output: 'final_post',
    description:
      '열 번째 루프와 검증 건틀릿이 모두 승인 신호를 낼 때만 내보내기를 엽니다.',
  },
]

export const topicPresets: TopicPreset[] = [
  {
    title: 'LangGraph 1.0에서 Supervisor 패턴 설계하기',
    audience: 'practitioner',
    tone: 'pragmatic',
    length: 'medium',
    rationale: '역할 분리와 검증 루프를 화면에 드러내기 좋은 주제',
  },
  {
    title: 'OMX로 에이전트 평가 하네스를 더 공격적으로 운영하는 법',
    audience: 'advanced',
    tone: 'opinionated',
    length: 'long',
    rationale: '가혹한 기준과 비교 지표를 정면으로 설명하기 좋은 주제',
  },
  {
    title: '프론트엔드 팀이 에이전트 결과를 QA 회로로 고정하는 방법',
    audience: 'beginner',
    tone: 'clear',
    length: 'medium',
    rationale: '상태 표현과 검증 사이클을 직관적으로 풀어낼 수 있다',
  },
  {
    title: 'RAG 평가 파이프라인에서 리뷰 기준을 수치화할 때 생기는 함정',
    audience: 'practitioner',
    tone: 'clear',
    length: 'short',
    rationale: '리뷰/최적화/비교의 긴장을 짧은 구조로도 보여주기 좋다',
  },
]

export const checklistLabels = [
  '입력 계약 완성도',
  '생성 흐름 충실도',
  '상태 머신 완성도',
  '오류 처리 품질',
  '내보내기 동작',
  '반응형 레이아웃',
  '접근성 기본기',
  '시각적 완성도',
  '하네스 절차 준수',
]

export const deliverables: DeliverableCard[] = [
  {
    id: 'iteration-log',
    title: 'runs/iteration_log.md',
    description: '작성자, 리뷰어, 수정자 루프를 10회 이상 기록하고 판정 수와 실제 수정 내용을 남깁니다.',
  },
  {
    id: 'verification-log',
    title: 'runs/verification_log.md',
    description: '검증, 비교, 평가 사이클을 10회 이상 누적해 append-only 증거로 보관합니다.',
  },
  {
    id: 'manifest',
    title: 'runs/run_manifest.json',
    description: '건틀릿 실행의 run id, 타임스탬프, 스펙 버전, 완료 상태를 정리합니다.',
  },
  {
    id: 'scorecard',
    title: 'reports/scorecard.json',
    description: '과업 적합성, UX, 시각 품질, 반응형, 접근성, 프로세스를 엄격하게 채점합니다.',
  },
  {
    id: 'evaluation',
    title: 'reports/evaluation_report.json',
    description: '건틀릿 루프 뒤에 scripts/evaluate.py가 생성한 L1/L2/L3 통합 보고서입니다.',
  },
]

export const evaluationTargets = [
  'UI 타임라인에 10회의 리뷰/수정 루프를 분명하게 노출합니다.',
  '반복 검증 중에도 benchmark 셀렉터와 단계 라벨을 안정적으로 유지합니다.',
  '워크스페이스 증거 로그에 검증 사이클을 10회 이상 기록합니다.',
  '리뷰어 9개 게이트를 모두 통과한 뒤에만 내보내기를 엽니다.',
  'smoke 100%, L3 9.2+, 최종 점수 9.4+를 목표로 둡니다.',
]

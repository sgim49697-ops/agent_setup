// starterData.ts - parallel_sections newsroom board의 정적 데이터

import type { DeliverableCard, TopicPreset, WorkflowStage, WriterLaneMeta } from './contracts'

export const workflowStages: WorkflowStage[] = [
  {
    id: 'research',
    label: 'Research results',
    description: 'Coordinator가 공통 브리프와 논지의 중심을 고정한다.',
  },
  {
    id: 'outline',
    label: 'Outline',
    description: '섹션 구조와 lane ownership을 먼저 확정한다.',
  },
  {
    id: 'drafts',
    label: 'Section drafts',
    description: 'Writer A, B, C가 자기 섹션만 병렬로 작성한다.',
  },
  {
    id: 'review',
    label: 'Review notes',
    description: 'Merge desk가 중복, 전환, 톤 밀도를 하나로 정리한다.',
  },
  {
    id: 'final',
    label: 'Final post',
    description: 'reader-ready article과 Markdown export를 제공한다.',
  },
]

export const writerLanes: WriterLaneMeta[] = [
  {
    id: 'writer_a',
    label: 'Writer A',
    focus: 'opening frame, audience lens, first decision point',
    mergeDuty: 'topic framing repetition을 만들지 않도록 opening scope만 맡는다.',
  },
  {
    id: 'writer_b',
    label: 'Writer B',
    focus: 'middle structure, trade-off lens, implementation choices',
    mergeDuty: '가운데 구간의 구조 설명을 책임지고, intro/closing 설명을 다시 가져오지 않는다.',
  },
  {
    id: 'writer_c',
    label: 'Writer C',
    focus: 'closing momentum, rollout checklist, final decision pressure',
    mergeDuty: 'checklist와 closing takeaways를 정리하되 앞선 framing은 반복하지 않는다.',
  },
]

export const deliverables: DeliverableCard[] = [
  {
    id: 'manifest',
    title: 'run_manifest.json',
    description: 'parallel_sections run id, spec version, 시작/종료 시각, 상태를 남긴다.',
  },
  {
    id: 'artifacts',
    title: 'artifact_index.json',
    description: '스크린샷, final URL, section ownership/merge note를 저장한다.',
  },
  {
    id: 'review',
    title: 'review_report.md',
    description: '왜 이전 버전이 약했는지와 이번 리워크가 무엇을 고쳤는지 기록한다.',
  },
  {
    id: 'scorecard',
    title: 'scorecard.json',
    description: '공통 rubric 기준의 L3 점수를 남긴다.',
  },
  {
    id: 'evaluation',
    title: 'evaluation_report.json',
    description: 'L1/L2/L3를 합산한 최종 평가 리포트를 자동 생성한다.',
  },
]

export const topicPresets: TopicPreset[] = [
  {
    title: 'LangGraph 1.0에서 Supervisor 패턴 설계하기',
    audience: 'practitioner',
    tone: 'pragmatic',
    length: 'medium',
    rationale: '분해 기준과 ownership, merge 기준을 병렬 기사 보드처럼 보여주기 좋은 주제',
  },
  {
    title: 'React Compiler 시대의 memoization 전략',
    audience: 'advanced',
    tone: 'opinionated',
    length: 'short',
    rationale: '짧은 섹션 묶음에서도 writer별 관점과 merge fix 차이를 잘 보여준다.',
  },
  {
    title: 'RAG에서 Vector DB 선택 기준과 트레이드오프',
    audience: 'practitioner',
    tone: 'clear',
    length: 'long',
    rationale: '섹션 수가 늘어도 3개 lane ownership과 reader-first merge가 유지되는지 보기 좋다.',
  },
]

export const reviewLenses = [
  'section ownership visibility',
  'merge fix clarity',
  'reader-first article quality',
  'responsiveness',
  'a11y basics',
]

export const evaluationChecklist = [
  'Build the app with npm run build',
  'Write reports/scorecard.json',
  'Run HARNESS=parallel_sections uv run python scripts/evaluate.py',
  'Confirm reports/evaluation_report.json exists',
]

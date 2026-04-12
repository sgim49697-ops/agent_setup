// starterData.ts - parallel_sections newsroom board의 정적 데이터

import type { DeliverableCard, TopicPreset, WorkflowStage, WriterLaneMeta } from './contracts'

export const workflowStages: WorkflowStage[] = [
  {
    id: 'research',
    label: '리서치 결과',
    description: '코디네이터가 공통 브리프와 논지의 중심을 먼저 고정한다.',
  },
  {
    id: 'outline',
    label: '아웃라인',
    description: '섹션 구조와 레인별 소유 범위를 먼저 확정한다.',
  },
  {
    id: 'drafts',
    label: '섹션 초안',
    description: '라이터 A, B, C가 자기 섹션만 병렬로 작성한다.',
  },
  {
    id: 'review',
    label: '리뷰 노트',
    description: '머지 데스크가 중복, 전환, 톤 밀도를 하나로 정리한다.',
  },
  {
    id: 'final',
    label: '최종 글',
    description: '읽기용 최종 글과 마크다운 내보내기를 제공한다.',
  },
]

export const writerLanes: WriterLaneMeta[] = [
  {
    id: 'writer_a',
    label: '라이터 A',
    focus: '도입 프레임, 독자 관점, 첫 판단 지점',
    mergeDuty: '주제 프레이밍이 반복되지 않도록 도입 범위만 맡는다.',
  },
  {
    id: 'writer_b',
    label: '라이터 B',
    focus: '중앙 구조, 트레이드오프 관점, 구현 선택지',
    mergeDuty: '가운데 구간의 구조 설명을 책임지고, 도입과 마무리 설명을 다시 가져오지 않는다.',
  },
  {
    id: 'writer_c',
    label: '라이터 C',
    focus: '마무리 흐름, 적용 체크리스트, 최종 결정 압력',
    mergeDuty: '체크리스트와 마무리 요점을 정리하되 앞선 프레이밍은 반복하지 않는다.',
  },
]

export const deliverables: DeliverableCard[] = [
  {
    id: 'manifest',
    title: '실행 매니페스트 · run_manifest.json',
    description: 'parallel_sections run id, spec version, 시작/종료 시각, 상태를 남긴다.',
  },
  {
    id: 'artifacts',
    title: '산출물 인덱스 · artifact_index.json',
    description: '스크린샷, final URL, section ownership/merge note를 저장한다.',
  },
  {
    id: 'review',
    title: '리뷰 보고서 · review_report.md',
    description: '왜 이전 버전이 약했는지와 이번 리워크가 무엇을 고쳤는지 기록한다.',
  },
  {
    id: 'scorecard',
    title: '점수표 · scorecard.json',
    description: '공통 rubric 기준의 L3 점수를 남긴다.',
  },
  {
    id: 'evaluation',
    title: '평가 리포트 · evaluation_report.json',
    description: 'L1/L2/L3를 합산한 최종 평가 리포트를 자동 생성한다.',
  },
]

export const topicPresets: TopicPreset[] = [
  {
    title: 'LangGraph 1.0에서 Supervisor 패턴 설계하기',
    audience: 'practitioner',
    tone: 'pragmatic',
    length: 'medium',
    rationale: '분해 기준과 소유 범위, 머지 기준을 병렬 기사 보드처럼 보여주기 좋은 주제',
  },
  {
    title: 'React Compiler 시대의 memoization 전략',
    audience: 'advanced',
    tone: 'opinionated',
    length: 'short',
    rationale: '짧은 섹션 묶음에서도 라이터별 관점과 머지 수정 차이를 잘 보여준다.',
  },
  {
    title: 'RAG에서 Vector DB 선택 기준과 트레이드오프',
    audience: 'practitioner',
    tone: 'clear',
    length: 'long',
    rationale: '섹션 수가 늘어도 3개 레인 소유 범위와 독자 우선 머지가 유지되는지 보기 좋다.',
  },
]

export const reviewLenses = [
  '섹션 ownership이 첫 화면에서 보이는가',
  'merge fix가 자연스럽게 이해되는가',
  'reader-first article 품질이 유지되는가',
  '반응형 흐름이 안정적인가',
  '기본 접근성이 확보됐는가',
]

export const evaluationChecklist = [
  '앱을 `npm run build`로 빌드한다.',
  '`reports/scorecard.json`을 최신 상태로 둔다.',
  '`HARNESS=parallel_sections uv run python scripts/evaluate.py`를 실행한다.',
  '`reports/evaluation_report.json` 생성 여부를 확인한다.',
]

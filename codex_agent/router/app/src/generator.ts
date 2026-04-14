// generator.ts - router용 deterministic local routing and specialist generation

import type {
  BlogGeneratorInputs,
  Length,
  OutlineSection,
  PipelineOutputs,
  ResearchSummary,
  ReviewNote,
  RoutingDecision,
  SectionDraft,
  SpecialistId,
  SpecialistOutput,
  SpecialistProfile,
} from './contracts'
import { specialistProfiles } from './starterData'

const keywordSignals: Record<Exclude<SpecialistId, 'fallback'>, string[]> = {
  frontend: ['react', 'browser', 'ui', 'ux', 'css', 'layout', 'compiler', 'render', 'frontend', 'vite'],
  orchestration: ['agent', 'workflow', 'langgraph', 'supervisor', 'state', 'orchestration', 'pipeline', 'routing'],
  infra: ['rag', 'vector db', 'vector', 'latency', 'infra', 'deployment', 'throughput', 'cost', 'scaling', 'storage'],
}

const lengthSectionCounts: Record<Length, number> = {
  short: 3,
  medium: 4,
  long: 5,
}

const specialistSectionTitles: Record<SpecialistId, string[]> = {
  frontend: [
    '사용자 흐름에서 압력이 생기는 지점',
    'UI 상태와 렌더링 기준',
    'React Compiler 이후의 판단 변화',
    '실전 shipping checklist',
    '팀에 적용할 rollout note',
  ],
  orchestration: [
    'coordination pressure와 문제 정의',
    '역할 구조와 state boundary',
    'control loop와 handoff 설계',
    'failure mode와 recovery 기준',
    '운영 checklist와 마무리 판단',
  ],
  infra: [
    '워크로드 shape와 병목 지형',
    '선택 기준과 trade-off surface',
    'latency, cost, storage 균형',
    '운영 리스크와 downside coverage',
    '도입 checklist와 rollback 조건',
  ],
  fallback: [
    '지금 확실한 것과 불확실한 것',
    '균형 잡힌 기본 설명 구조',
    '실무 관점에서 먼저 확인할 질문',
    '주의해야 할 일반화',
    '다음 탐색을 위한 checklist',
  ],
}

const specialistVoice: Record<SpecialistId, string[]> = {
  frontend: [
    '추상적 taxonomy보다 브라우저에서 체감되는 흐름을 먼저 설명한다.',
    '사용자가 보는 상태 전환과 개발자가 감당할 렌더 비용을 함께 묶는다.',
  ],
  orchestration: [
    '역할 구조와 상태 경계를 먼저 정의하고 단계 논리를 뒤에서 받쳐준다.',
    '무엇이 어느 단계에서 결정되는지 분명해야 설명이 설득력 있다.',
  ],
  infra: [
    '성능, 비용, 규모, 운영 복잡도를 같은 축 위에서 비교한다.',
    '좋은 선택 조건과 피해야 할 조건을 같이 놓고 본다.',
  ],
  fallback: [
    '확실하지 않은 부분은 숨기지 않고 보수적으로 표현한다.',
    '과장 없이 균형 잡힌 설명 구조를 우선한다.',
  ],
}

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^\w|\s\w)/g, (match) => match.toUpperCase())
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function specialistLabel(id: SpecialistId) {
  return specialistProfiles.find((profile) => profile.id === id)?.label ?? '폴백 스페셜리스트'
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function getSpecialistProfile(id: SpecialistId): SpecialistProfile {
  return specialistProfiles.find((profile) => profile.id === id) ?? specialistProfiles[3]
}

export function routeTopic(topic: string): RoutingDecision {
  const normalized = topic.toLowerCase()
  const scored = Object.entries(keywordSignals).map(([specialist, signals]) => {
    const matchedSignals = signals.filter((signal) => normalized.includes(signal))
    return {
      specialist: specialist as Exclude<SpecialistId, 'fallback'>,
      matchedSignals,
      score: matchedSignals.length,
    }
  })

  scored.sort((left, right) => right.score - left.score)
  const top = scored[0]
  const second = scored[1]

  if (top.score === 0) {
    return {
      specialist: 'fallback',
      confidence: 0.42,
      matchedSignals: [],
      reason: '주제 안에서 강한 도메인 신호가 보이지 않아, 라우터가 글을 범용 경로로 유지했다.',
      fallbackReason: '이 주제는 특정 specialist를 강하게 고를 만큼 신호가 뚜렷하지 않다.',
    }
  }

  if (top.score === second.score) {
    return {
      specialist: 'fallback',
      confidence: 0.48,
      matchedSignals: Array.from(new Set([...top.matchedSignals, ...second.matchedSignals])),
      reason: `라우터가 ${specialistLabel(top.specialist)}와 ${specialistLabel(second.specialist)} 사이에서 경쟁 신호를 동시에 감지했다.`,
      fallbackReason: '최상위 specialist 점수가 동률이라 더 안전한 fallback route를 사용한다.',
    }
  }

  const confidence = clamp(0.46 + top.score * 0.18 + (top.score - second.score) * 0.08, 0.54, 0.94)

  return {
    specialist: top.specialist,
    confidence,
    matchedSignals: top.matchedSignals,
    reason: `${top.matchedSignals.join(', ')} 신호가 강하게 겹쳐 ${specialistLabel(top.specialist)} 경로를 선택했다.`,
    fallbackReason: null,
  }
}

function buildResearchSummary(
  inputs: BlogGeneratorInputs,
  specialist: SpecialistId,
  profile: SpecialistProfile,
  routing: RoutingDecision,
): ResearchSummary {
  const cleanTopic = titleCase(inputs.topic)

  if (specialist === 'frontend') {
    return {
      angle: `${cleanTopic}를 브라우저 UX와 사용자 흐름 관점에서 설명해, ${inputs.audience} 독자가 체감 성능과 구현 선택을 함께 이해하게 만든다.`,
      thesis: `${cleanTopic}는 추상적 원칙보다 사용자가 겪는 UI 상태 전환과 렌더링 비용으로 설명할 때 훨씬 실용적이다.`,
      focusBullets: [
        '실제 화면에서 어떤 friction이 생기는지 먼저 짚는다.',
        'React나 browser runtime이 판단 기준을 어떻게 바꾸는지 연결한다.',
        '마지막에는 shipping checklist로 마무리한다.',
      ],
      supportingLens: `${profile.reviewLens} 라우트 신뢰도는 ${(routing.confidence * 100).toFixed(0)}%다.`,
    }
  }

  if (specialist === 'orchestration') {
    return {
      angle: `${cleanTopic}를 역할 구조와 state boundary 중심으로 설명해, ${inputs.audience} 독자가 어디서 무엇을 결정해야 하는지 빠르게 잡게 만든다.`,
      thesis: `${cleanTopic}는 개별 기능보다 control loop, handoff, recovery 기준을 중심으로 볼 때 설계 의도가 가장 선명해진다.`,
      focusBullets: [
        '역할 구조를 먼저 고정한다.',
        '단계별 handoff와 failure mode를 같은 흐름 안에 놓는다.',
        '실전 운영 시 recovery 기준까지 남긴다.',
      ],
      supportingLens: `${profile.reviewLens} 라우트 신뢰도는 ${(routing.confidence * 100).toFixed(0)}%다.`,
    }
  }

  if (specialist === 'infra') {
    return {
      angle: `${cleanTopic}를 scale, latency, cost, storage 관점으로 읽어 ${inputs.audience} 독자가 trade-off 표를 머릿속에 그리게 만든다.`,
      thesis: `${cleanTopic}는 기능 비교보다 workload shape와 운영 리스크를 함께 보는 편이 훨씬 정확한 선택 기준을 준다.`,
      focusBullets: [
        '워크로드 shape를 먼저 정의한다.',
        '선택 기준과 downside를 같은 축 위에 놓는다.',
        'rollout과 rollback 기준까지 함께 적는다.',
      ],
      supportingLens: `${profile.reviewLens} 라우트 신뢰도는 ${(routing.confidence * 100).toFixed(0)}%다.`,
    }
  }

  return {
    angle: `${cleanTopic}를 범용 설명 구조로 정리하되, 불확실한 부분은 추정으로 포장하지 않고 안전하게 적는다.`,
    thesis: `${cleanTopic}는 명확한 domain specialist가 없을 때도 "무엇이 확실하고 무엇이 추가 검증이 필요한지"를 먼저 보여주면 유용한 글이 된다.`,
    focusBullets: [
      '확실한 사실과 추정 영역을 구분한다.',
      '과장 없이 범용 구조를 유지한다.',
      '추가 조사 포인트를 마지막에 남긴다.',
    ],
    supportingLens: `${profile.reviewLens} 라우트 신뢰도는 ${(routing.confidence * 100).toFixed(0)}%다.`,
  }
}

function buildOutline(inputs: BlogGeneratorInputs, specialist: SpecialistId): OutlineSection[] {
  const count = lengthSectionCounts[inputs.length]
  const titles = specialistSectionTitles[specialist].slice(0, count)

  return titles.map((title, index) => ({
    id: `${slugify(inputs.topic)}-${index + 1}`,
    title,
    goal:
      specialist === 'frontend'
        ? `${title}에서 ${inputs.topic}를 UI 상태와 사용자 흐름 관점으로 설명한다.`
        : specialist === 'orchestration'
          ? `${title}에서 ${inputs.topic}의 역할 구조와 단계 논리를 정리한다.`
          : specialist === 'infra'
            ? `${title}에서 ${inputs.topic}의 선택 조건과 trade-off를 비교한다.`
            : `${title}에서 ${inputs.topic}를 안전한 범용 프레임으로 설명한다.`,
  }))
}

function buildDrafts(
  inputs: BlogGeneratorInputs,
  specialist: SpecialistId,
  outline: OutlineSection[],
  research: ResearchSummary,
): SectionDraft[] {
  return outline.map((section, index) => ({
    id: section.id,
    title: section.title,
    summary: `${section.goal} 이 섹션은 ${specialistLabel(specialist)}의 시선으로 ${inputs.topic}를 읽게 만든다.`,
    paragraphs: [
      specialist === 'frontend'
        ? `${titleCase(inputs.topic)}를 이 구간에서 볼 때 핵심은 사용자가 어떤 상태 변화를 보고, 개발자가 어떤 렌더 비용을 감당하는지 함께 드러내는 것이다.`
        : specialist === 'orchestration'
          ? `${titleCase(inputs.topic)}를 이 구간에서 다룰 때는 역할 분리와 상태 경계가 먼저 보여야 이후 단계 논리가 자연스럽게 연결된다.`
          : specialist === 'infra'
            ? `${titleCase(inputs.topic)}를 이 구간에서 설명할 때는 기능 자랑보다 workload shape와 운영 비용을 먼저 놓고 보는 편이 더 정확하다.`
            : `${titleCase(inputs.topic)}를 이 구간에서 설명할 때는 무엇이 확실한 사실이고 무엇이 추가 검증이 필요한지 먼저 나눠 적는 편이 안전하다.`,
      `${research.focusBullets[index % research.focusBullets.length]} 이 포인트를 중심으로 섹션 범위를 유지하면 글이 과하게 흩어지지 않는다.`,
      specialist === 'fallback'
        ? `${inputs.audience} 독자에게는 이 섹션에서 단정적인 결론보다 "다음에 무엇을 확인해야 하는지"를 남기는 편이 더 유용하다.`
        : `${inputs.audience} 독자에게는 ${section.goal.toLowerCase()}를 하나의 판단 단위로 보여주는 편이 실제 적용 판단에 더 도움이 된다.`,
    ],
    takeaway:
      specialist === 'infra'
        ? `${section.title} takeaway: ${inputs.topic}를 볼 때 이 구간에서는 선택 기준과 downside를 한 쌍으로 확인한다.`
        : specialist === 'frontend'
          ? `${section.title} takeaway: ${inputs.topic}를 볼 때 이 구간에서는 사용자 흐름과 렌더 비용을 같이 본다.`
          : specialist === 'orchestration'
            ? `${section.title} takeaway: ${inputs.topic}를 볼 때 이 구간에서는 역할 경계와 handoff를 먼저 본다.`
            : `${section.title} takeaway: ${inputs.topic}를 볼 때 이 구간에서는 확실한 정보와 추정을 구분한다.`,
  }))
}

function buildReviewNotes(
  inputs: BlogGeneratorInputs,
  specialist: SpecialistId,
  profile: SpecialistProfile,
): ReviewNote[] {
  if (specialist === 'frontend') {
    return [
      {
        label: '흐름 명료도',
        detail: '사용자 흐름과 구현 포인트가 같은 글 안에서 자연스럽게 연결된다.',
        severity: 'good',
      },
      {
        label: '렌더링 트레이드오프',
        detail: '추상적 최적화 조언 대신 실제 UI 비용을 더 직접적으로 적으면 더 좋다.',
        severity: 'watch',
      },
      {
        label: '사용성 프레이밍',
        detail: `${inputs.audience} 독자를 위해 예시 한두 개를 더 넣으면 이해 진입점이 더 빨라진다.`,
        severity: 'improve',
      },
    ]
  }

  if (specialist === 'orchestration') {
    return [
      {
        label: '단계 논리',
        detail: '역할 구조와 단계 논리가 분명하게 이어져서 오케스트레이션 글로 읽힌다.',
        severity: 'good',
      },
      {
        label: '실패 대응 범위',
        detail: '실패 복구나 재시도 포인트를 한 줄 더 붙이면 운영 감각이 더 살아난다.',
        severity: 'watch',
      },
      {
        label: '조율 명료도',
        detail: `${profile.reviewLens} 관점이 충분히 드러난다.`,
        severity: 'good',
      },
    ]
  }

  if (specialist === 'infra') {
    return [
      {
        label: '선택 기준',
        detail: '선택 조건과 반대편 downside가 함께 보여서 비교 글로 설득력이 있다.',
        severity: 'good',
      },
      {
        label: '도입 주의점',
        detail: '운영 체크리스트에 rollback 기준이 더 또렷하게 들어가면 더 좋다.',
        severity: 'watch',
      },
      {
        label: '트레이드오프 정직성',
        detail: `${inputs.topic}를 단일 해법처럼 보이지 않게 정리한 점이 좋다.`,
        severity: 'good',
      },
    ]
  }

  return [
    {
      label: '폴백 안정성',
      detail: '불확실한 지점을 과장하지 않고 기록해서 fallback route의 목적을 잘 살렸다.',
      severity: 'good',
    },
    {
      label: '불확실성 분리',
      detail: '확정 정보와 추가 확인 포인트를 시각적으로 더 분리하면 더 읽기 쉬워진다.',
      severity: 'watch',
    },
    {
      label: '균형 잡힌 프레이밍',
      detail: `${inputs.audience} 독자에게는 다음에 무엇을 조사해야 하는지 더 명확히 남기는 편이 좋다.`,
      severity: 'improve',
    },
  ]
}

function buildFinalPost(
  inputs: BlogGeneratorInputs,
  specialist: SpecialistId,
  routing: RoutingDecision,
  research: ResearchSummary,
  drafts: SectionDraft[],
): string {
  const intro =
    specialist === 'frontend'
      ? `${research.thesis} 이 글은 브라우저 UX와 구현 기준을 함께 읽게 만들어, 추상적 원칙 대신 실제 화면 감각으로 판단하게 한다.`
      : specialist === 'orchestration'
        ? `${research.thesis} 이 글은 역할 구조와 handoff를 먼저 세우고, 그 위에 control loop와 failure mode를 얹는 순서로 설명한다.`
        : specialist === 'infra'
          ? `${research.thesis} 이 글은 workload shape, latency, cost, scale을 한 표면 위에 놓고 비교하도록 구성한다.`
          : `${research.thesis} 이 글은 범용 설명을 유지하되, 확실하지 않은 부분은 명시적으로 남겨 안전한 결론만 가져가게 만든다.`

  const closing =
    specialist === 'fallback'
      ? `- 최종 판단: ${inputs.topic}는 specialist route가 명확하지 않기 때문에, 현재는 보수적인 기본 구조로 이해하고 추가 검증 질문을 먼저 정리하는 편이 안전하다.`
      : `- 최종 판단: ${inputs.topic}는 ${specialistLabel(specialist)}의 렌즈로 읽을 때 가장 설명력이 높았고, 라우터는 ${(routing.confidence * 100).toFixed(0)}% 신뢰도로 이 경로를 선택했다.`

  return [
    `# ${titleCase(inputs.topic)}`,
    '',
    `> 경로: ${specialistLabel(specialist)} | 신뢰도: ${(routing.confidence * 100).toFixed(0)}%`,
    '',
    '## 시작 메모',
    intro,
    '',
    ...drafts.flatMap((draft) => [
      `## ${draft.title}`,
      '',
      draft.summary,
      '',
      ...draft.paragraphs,
      '',
      `- 핵심 정리: ${draft.takeaway}`,
      '',
    ]),
    '## 마무리 체크리스트',
    '',
    closing,
  ].join('\n')
}

export function generateSpecialistOutput(
  inputs: BlogGeneratorInputs,
  routing: RoutingDecision,
  profile: SpecialistProfile,
): SpecialistOutput {
  const researchSummary = buildResearchSummary(inputs, routing.specialist, profile, routing)
  const outline = buildOutline(inputs, routing.specialist)
  const sectionDrafts = buildDrafts(inputs, routing.specialist, outline, researchSummary)
  const reviewNotes = buildReviewNotes(inputs, routing.specialist, profile)
  const finalPost = buildFinalPost(inputs, routing.specialist, routing, researchSummary, sectionDrafts)

  return {
    researchSummary,
    outline,
    sectionDrafts,
    reviewNotes,
    finalPost,
    voiceNotes: specialistVoice[routing.specialist],
  }
}

export function assembleFinalOutputs(
  routing: RoutingDecision,
  specialistOutput: SpecialistOutput,
): PipelineOutputs {
  return {
    routing_decision: routing,
    research_summary: specialistOutput.researchSummary,
    outline: specialistOutput.outline,
    section_drafts: specialistOutput.sectionDrafts,
    review_notes: specialistOutput.reviewNotes,
    final_post: specialistOutput.finalPost,
    voice_notes: specialistOutput.voiceNotes,
  }
}

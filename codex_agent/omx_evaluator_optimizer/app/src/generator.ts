// generator.ts - omx_evaluator_optimizer용 deterministic gauntlet generator

import type {
  Audience,
  BlogGeneratorInputs,
  ChecklistRow,
  FinalArticle,
  IterationRecord,
  Length,
  PipelineOutputs,
  SectionDraft,
  Tone,
  VerificationCycle,
} from './contracts'
import { checklistLabels, requiredLoops } from './starterData'

const audienceLens: Record<Audience, string> = {
  beginner: '안내 표지와 단계별 맥락이 분명해야 움직일 수 있는 첫 실무 도입 팀',
  practitioner: '확신, 속도, 예측 가능한 품질 게이트를 함께 챙기는 운영 팀',
  advanced: '날카로운 트레이드오프와 느슨하지 않은 근거를 기대하는 시니어 독자',
}

const toneLens: Record<Tone, string> = {
  clear: '설명은 또렷하게, 판단은 차분하게',
  pragmatic: '실행 우선의 운영 톤으로',
  opinionated: '단호하되 근거와 구현 맥락은 놓치지 않게',
}

const lengthLens: Record<Length, string> = {
  short: '4분 안에 핵심을 끊어 읽는 짧은 구성',
  medium: '6분 안에 균형 있게 읽는 중간 구성',
  long: '8분까지 깊게 파고드는 긴 구성',
}

const verificationLabels = [
  '스캐폴드 검증',
  '작성 초안 빌드 게이트',
  '1차 전체 점검',
  '2차 회귀 점검',
  '3차 비교 펄스',
  '4차 평가 펄스',
  '5차 검증 펄스',
  '6차 비교 펄스',
  '7차 평가 펄스',
  '8차 출고 확인',
]

const verdictThresholds = [
  { partialAt: 2, passAt: 6 },
  { partialAt: 3, passAt: 7 },
  { partialAt: 4, passAt: 8 },
  { partialAt: 2, passAt: 5 },
  { partialAt: 4, passAt: 7 },
  { partialAt: 5, passAt: 8 },
  { partialAt: 4, passAt: 7 },
  { partialAt: 6, passAt: 9 },
  { partialAt: 7, passAt: 10 },
]

const reviewerNotes = [
  {
    fail: '입력 계약이 아직 느슨합니다. 예외 케이스 방어와 입력 가이드가 충분히 설득력 있지 않습니다.',
    partial: '입력 계약의 뼈대는 잡혔지만, 검증 문구와 보조 안내를 더 엄격하게 다듬어야 합니다.',
    pass: '입력, 라벨, 도움말, 예외 방어가 benchmark 계약과 자연스럽게 맞물립니다.',
  },
  {
    fail: '단계는 존재하지만 전환이 암시 수준에 머뭅니다. 실제 handoff처럼 읽히지 않습니다.',
    partial: '다섯 단계는 보이지만, 단계 간 handoff를 더 자신감 있게 설명해야 합니다.',
    pass: '연구부터 최종 내보내기까지 하나의 견고한 파이프라인으로 읽힙니다.',
  },
  {
    fail: '상태 문구가 약합니다. 진행 중, 검토 완료, 내보내기 가능 상태가 또렷하게 갈리지 않습니다.',
    partial: '대부분의 상태는 구분되지만, 반복 평가를 견디기에는 문구와 타이밍이 더 단단해야 합니다.',
    pass: '여섯 가지 상태가 모두 또렷하고, 반복 재생에서도 안전하게 읽힙니다.',
  },
  {
    fail: '강제 실패 경로에 복구 안내가 약하고, 경고 처리도 선명하지 않습니다.',
    partial: '알림 경로는 있으나, 복구 메시지를 사용자 관점에서 더 직설적으로 정리해야 합니다.',
    pass: '오류 경로가 명확하고 복구 가능하며, role="alert"로 benchmark에도 드러납니다.',
  },
  {
    fail: '복사 동작이 아직 낙관적입니다. 내보내기 잠금과 실패 폴백 문구가 충분히 엄격하지 않습니다.',
    partial: '복사는 조건부로 잠기지만, 성공/실패 피드백을 더 명확한 사용자 언어로 정리해야 합니다.',
    pass: '내보내기가 안전하게 잠기고, 클립보드 성공/실패 피드백이 모두 선명합니다.',
  },
  {
    fail: '데스크톱은 버티지만 모바일 밀도와 카드 흐름이 여전히 답답합니다.',
    partial: '반응형 동작은 가능하지만, 몇몇 밀집 구간은 간격과 줄바꿈을 더 손봐야 합니다.',
    pass: '데스크톱과 모바일 모두에서 행동 유도, 위계, 읽기 밀도를 안정적으로 유지합니다.',
  },
  {
    fail: '시맨틱 컨트롤은 있으나, live region 범위와 키보드 흐름을 더 엄격히 다뤄야 합니다.',
    partial: '접근성 기본기는 대부분 맞지만, 상태 전달과 포커스 흐름의 세부가 아직 느슨합니다.',
    pass: 'aria-live, 시맨틱 컨트롤, 라벨, 키보드 흐름이 모두 안정적으로 맞물립니다.',
  },
  {
    fail: '페이지가 아직도 완성된 제품보다 스캐폴드에 가깝게 보입니다.',
    partial: '시각 시스템은 잡혔지만, 위계와 리듬을 한 번 더 다듬어야 합니다.',
    pass: '타이포그래피, 간격, 팔레트, 강조 체계가 의도적으로 느껴집니다.',
  },
  {
    fail: '루프 개념은 보이지만 런타임과 아티팩트 전반의 증거 선이 아직 약합니다.',
    partial: '루프 추적은 보이지만, 검증 리듬과 증거 밀도를 더 강화할 수 있습니다.',
    pass: '루프와 검증 과정이 UI와 워크스페이스 아티팩트 양쪽에서 함께 드러납니다.',
  },
] as const

function countVerdicts(verdictRows: ChecklistRow[]) {
  let passCount = 0
  let partialCount = 0
  let failCount = 0

  for (const row of verdictRows) {
    if (row.verdict === 'PASS') passCount += 1
    else if (row.verdict === 'PARTIAL') partialCount += 1
    else failCount += 1
  }

  return { passCount, partialCount, failCount }
}

function isoAt(iteration: number) {
  const minute = 12 + iteration
  return `2026-04-12T14:${String(minute).padStart(2, '0')}:00Z`
}

function buildOutline(topic: string, audience: Audience, length: Length, iteration: number) {
  const titles = [
    `${topic}에 더 엄격한 품질 기준이 필요한 이유`,
    '추천안을 밀어 올리는 핵심 신호',
    `${audience === 'advanced' ? '시스템 관점' : audience === 'beginner' ? '첫 도입 관점' : '운영 팀 관점'} 실행 계획`,
    '주장이 설득력을 얻기 전까지 리뷰어가 계속 막아 세우는 지점',
    '반복 검증이 초안을 승인 후보로 바꾸는 방식',
    '최종 출고 체크리스트와 다음 행동',
  ]

  const count = length === 'short' ? 3 : length === 'medium' ? 5 : 6
  return titles.slice(0, count).map((title, index) => {
    if (iteration <= 2 && index === count - 1) return '출고 프레임을 더 세게 잡아야 하는 거친 마무리'
    if (iteration <= 5 && index === 0) return title.replace('더 엄격한 품질 기준', '더 절제된 품질 기준')
    return title
  })
}

function buildResearchSummary(
  topic: string,
  audience: Audience,
  tone: Tone,
  length: Length,
  iteration: number,
) {
  const audienceSummary = audienceLens[audience]
  const toneSummary = toneLens[tone]
  const lengthSummary = lengthLens[length]

  return [
    `${topic}은 ${audienceSummary}를 위해 다시 프레이밍되며, 각 루프는 행동에 도움이 되지 않는 주장부터 잘라 냅니다.`,
    `톤 목표는 ${toneSummary}이며, 리뷰어는 자신감이 실제로 쓸모 있는 구체성으로 이어지는지 계속 확인합니다.`,
    `글은 ${lengthSummary}을 목표로 하므로, 매 반복마다 밀도, 전환, 결론 설득력을 다시 손봅니다.`,
    iteration < 4
      ? '초기 루프는 거친 모서리를 일부 남겨 두어 수정자가 실제로 개입할 여지를 확보합니다.'
      : iteration < 8
        ? '중반 루프는 상태 명확성, 모바일 밀도, 남아 있는 스캐폴드 문구 제거에 집중합니다.'
        : '후반 루프는 일관성, 마감 품질, 증거 팩과 런타임 서사가 같은 방향을 가리키는지에 집중합니다.',
  ]
}

function buildSectionBody(audience: Audience, tone: Tone, title: string, index: number, iteration: number) {
  const readerLens = audienceLens[audience]
  const voice = toneLens[tone]
  const maturityLine =
    iteration <= 2
      ? '첫 버전은 아직 내부 워크숍 메모처럼 거칠게 들립니다.'
      : iteration <= 6
        ? '중반 루프는 반복을 덜어 내고, 각 문단이 자기 자리를 증명하도록 밀어붙입니다.'
        : '후반 루프는 독자를 더 확신 있는 판단으로 이끄는 섹션만 남깁니다.'

  const bridgeLine =
    index % 2 === 0
      ? `${readerLens}에게 필요한 것은 막연한 호기심을 신뢰 가능한 점검 순서로 바꾸는 일입니다.`
      : `문체는 ${voice}을 유지해, 글이 장식적이기보다 의도적으로 느껴지게 합니다.`

  return `${title}. ${maturityLine} ${bridgeLine} 이제 수정자는 전환, 근거, 다음 행동의 명확성을 하나의 연결된 문제로 다룹니다.`
}

function buildTakeaway(iteration: number) {
  if (iteration <= 3) return '리뷰어가 실제로 개입할 수 있도록 눈에 띄는 거침을 일부 남겨 둡니다.'
  if (iteration <= 7) return '구조적 비판을 실제 UI 수정과 본문 수정으로 바꾸는 데 루프를 사용합니다.'
  return '런타임과 아티팩트 선이 같은 출고 서사를 지지할 때만 내보냅니다.'
}

function buildSectionDrafts(audience: Audience, tone: Tone, outline: string[], iteration: number) {
  return outline.map<SectionDraft>((title, index) => ({
    title,
    body: buildSectionBody(audience, tone, title, index, iteration),
    takeaway: buildTakeaway(iteration),
  }))
}

function buildReviewNotes(topic: string, iteration: number) {
  if (iteration <= 2) {
    return [
      `${topic}은 뼈대는 맞지만, 평가자가 아직 신뢰하지 않는 거친 초안에 더 가깝습니다.`,
      '리뷰어는 더 선명한 상태 의미, 더 강한 출고 프레이밍, 더 안전한 내보내기 동작을 요구합니다.',
      '시각 방향성은 보이지만, 완성된 제품 표면보다 하네스 스캐폴드에 더 가깝습니다.',
    ]
  }

  if (iteration <= 6) {
    return [
      `${topic}은 흐름이 조여지고 benchmark 셀렉터가 안정되면서 점점 더 설득력을 얻고 있습니다.`,
      '리뷰 포인트는 구조 부재에서 벗어나, 약한 명확성, 과밀한 카드, 무른 전환으로 이동했습니다.',
      '반복 평가가 더 작은 문제를 드러내기 시작했다는 점은 핵심 흐름이 안정됐다는 신호입니다.',
    ]
  }

  return [
    `${topic}은 이제 가능성 있는 메모 묶음이 아니라 실제로 출고 가능한 글처럼 읽힙니다.`,
    '리뷰어는 이제 모바일 밀도, aria-live 충실도, 내보내기 안전성 같은 회귀만 주시합니다.',
    '증거 팩과 화면의 런타임 루프가 이제 같은 품질 서사를 강화합니다.',
  ]
}

function buildVerdictRows(iteration: number): ChecklistRow[] {
  return checklistLabels.map((label, index) => {
    const thresholds = verdictThresholds[index]
    const noteSet = reviewerNotes[index]

    if (iteration >= thresholds.passAt) return { index: index + 1, label, verdict: 'PASS', note: noteSet.pass }
    if (iteration >= thresholds.partialAt) {
      return { index: index + 1, label, verdict: 'PARTIAL', note: noteSet.partial }
    }
    return { index: index + 1, label, verdict: 'FAIL', note: noteSet.fail }
  })
}

function buildOptimizerChanges(iteration: number) {
  const library = [
    '시작 화면을 10개 루프 체크포인트가 드러나는 건틀릿 타임라인으로 재구성했습니다.',
    '시작 전, 진행 중, 중간 검토, 검토 완료, 내보내기 가능, 오류 상태가 서로 다른 목소리로 읽히도록 분리했습니다.',
    'fail/error 접두 토픽에 대한 오류 잠금과 복구 문구를 강화했습니다.',
    '마크다운 복사를 최종 승인 게이트 뒤로 잠그고 실패 폴백 피드백을 분명히 추가했습니다.',
    '타임라인, 리뷰, 증거 표면이 모바일에서도 무너지지 않도록 반응형 그리드를 넓혔습니다.',
    '스캐폴드 느낌을 줄이기 위해 타이포그래피, 간격 리듬, 카드 대비를 다듬었습니다.',
    '화면의 런타임 카피가 리뷰어 판정 수와 어긋나지 않도록 정렬했습니다.',
    '비교, 평가, 검증 압력이 UI에 보이도록 별도의 검증 건틀릿 표면을 추가했습니다.',
    '최종 원고의 전환과 맺음을 다듬어, 글이 하나의 주장처럼 읽히게 만들었습니다.',
    '열 번째 루프만 승인 후보가 되도록 고정하고, 전부 PASS인 판정표만 최종 승격했습니다.',
  ]

  const count = Math.min(3 + Math.floor(iteration / 2), library.length)
  return library.slice(Math.max(0, count - 3), count)
}

function buildIterationMarkdown(topic: string, iteration: number, outline: string[], reviewNotes: string[]) {
  return [
    `## ${iteration}차 반복 스냅샷`,
    '',
    `- 주제: ${topic}`,
    `- 활성 개요 수: ${outline.length}`,
    `- 현재 리뷰 초점: ${reviewNotes[0]}`,
    `- 출고 상태: ${iteration >= requiredLoops ? '최종 게이트 통과' : '아직 검토 중'}`,
  ].join('\n')
}

function buildFinalArticle(
  topic: string,
  audience: Audience,
  tone: Tone,
  length: Length,
  outline: string[],
) {
  const audienceSummary = audienceLens[audience]
  const toneSummary = toneLens[tone]
  const sizeLabel = lengthLens[length]
  const mergedSections = buildSectionDrafts(audience, tone, outline, requiredLoops)

  const intro = `${topic}은 첫 답변을 곧바로 출고 가능한 결과처럼 포장하지 않고, 거친 초안과 리뷰 압력, 반복 검증이 어떻게 함께 움직이는지 보여 줄 때 더 신뢰를 얻습니다. 이 버전은 ${audienceSummary}를 기준으로 맞췄고, ${toneSummary}의 목소리를 유지하면서 ${sizeLabel}에 가까운 밀도로 정리했습니다.`

  const closing =
    '오래 남는 교훈은 단순합니다. 런타임, 리뷰 표, 아티팩트 선이 모두 같은 말을 하기 전까지는 그럴듯한 초안을 신뢰하지 마십시오. 반복 평가는 의식적인 절차가 아니라, 가능성 있는 설명을 실제 승인 후보로 바꾸는 과정입니다.'

  const markdown = [
    `# ${topic}`,
    '',
    intro,
    '',
    ...mergedSections.flatMap((section) => [
      `## ${section.title}`,
      '',
      section.body,
      '',
      `> ${section.takeaway}`,
      '',
    ]),
    '## 마무리',
    '',
    closing,
  ].join('\n')

  return { title: topic, intro, mergedSections, closing, markdown } satisfies FinalArticle
}

function buildVerificationCycles(): VerificationCycle[] {
  return verificationLabels.map((label, index) => ({
    cycle: index + 1,
    label,
    validate: 'pass',
    compare: 'pass',
    evaluate: 'pass',
    delta:
      index === 0
        ? '워크스페이스 구조가 준비되었고, 건틀릿 스캐폴드가 저장소 흐름에 연결되었습니다.'
        : index < 4
          ? '초기 루프는 여전히 실제 결함을 드러내지만, 구조와 기본 동작은 안정적으로 유지됩니다.'
          : index < 8
            ? '중반 평가에서는 smoke/build 안정성이 유지되는 가운데 주관 점수가 올라갑니다.'
            : '후반 검증은 승인 후보가 반복 비교·평가·검증 압력을 견디는지 보여 줍니다.',
  }))
}

export function isForcedErrorTopic(topic: string) {
  return /^(fail|error)\b/i.test(topic.trim())
}

export function generatePipelineOutputs(inputs: BlogGeneratorInputs): PipelineOutputs {
  const topic = inputs.topic.trim()
  const verificationCycles = buildVerificationCycles()

  const iterations = Array.from({ length: requiredLoops }, (_, offset) => {
    const iteration = offset + 1
    const outline = buildOutline(topic, inputs.audience, inputs.length, iteration)
    const verdictRows = buildVerdictRows(iteration)
    const counts = countVerdicts(verdictRows)
    const reviewNotes = buildReviewNotes(topic, iteration)

    return {
      iteration,
      startedAt: isoAt(iteration),
      phase: iteration === 1 ? 'writer' : iteration < 5 ? 'reviewer' : iteration < requiredLoops ? 'optimizer' : 'ready',
      verdictRows,
      passCount: counts.passCount,
      partialCount: counts.partialCount,
      failCount: counts.failCount,
      optimizerChanges: buildOptimizerChanges(iteration),
      buildStatus:
        iteration === 1
          ? '거친 초안 빌드 확인'
          : iteration < requiredLoops
            ? `${iteration}차 루프 빌드 확인`
            : '출고 후보 빌드 확인',
      needsAnotherLoop: iteration < requiredLoops,
      researchSummary: buildResearchSummary(topic, inputs.audience, inputs.tone, inputs.length, iteration),
      outline,
      sectionDrafts: buildSectionDrafts(inputs.audience, inputs.tone, outline, iteration),
      reviewNotes,
      iterationMarkdown: buildIterationMarkdown(topic, iteration, outline, reviewNotes),
    } satisfies IterationRecord
  })

  const finalIteration = iterations[iterations.length - 1]
  const finalArticle = buildFinalArticle(topic, inputs.audience, inputs.tone, inputs.length, finalIteration.outline)

  return {
    research_summary: finalIteration.researchSummary,
    outline: finalIteration.outline,
    section_drafts: finalIteration.sectionDrafts,
    review_notes: finalIteration.reviewNotes,
    final_post: finalArticle.markdown,
    final_article: finalArticle,
    iterations,
    verification_cycles: verificationCycles,
    loop_summary: {
      minimumLoopsMet: iterations.length >= requiredLoops,
      requiredLoops,
      verificationCycles: verificationCycles.length,
      lastIterationPassCount: finalIteration.passCount,
      readyForExport: finalIteration.passCount === checklistLabels.length,
    },
  }
}

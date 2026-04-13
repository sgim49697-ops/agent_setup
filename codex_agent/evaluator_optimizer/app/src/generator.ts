// generator.ts - evaluator_optimizer용 deterministic loop generator

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
} from './contracts'
import { checklistLabels } from './starterData'

const audienceLens: Record<Audience, string> = {
  beginner: '처음 실전에 붙이는 팀',
  practitioner: '새로움보다 전달 품질을 중시하는 실무 팀',
  advanced: '트레이드오프와 근거 밀도를 끝까지 따지는 시니어 독자',
}

const toneLens: Record<Tone, string> = {
  clear: '설명 중심으로 또렷한 톤',
  pragmatic: '실행 순서를 바로 잡아 주는 실무 톤',
  opinionated: '단호하지만 근거를 놓치지 않는 톤',
}

const lengthLens: Record<Length, string> = {
  short: '빠르게 읽히는 짧은 분량',
  medium: '균형 잡힌 중간 분량',
  long: '배경까지 충분히 설명하는 긴 분량',
}

const buildStatusByIteration = ['거친 초안 확인', '보정 빌드 확인', '출시 빌드 확인']

const loopTimes = ['T+00:00', 'T+00:45', 'T+01:30']

function countVerdicts(verdictRows: ChecklistRow[]) {
  let passCount = 0
  let partialCount = 0
  let failCount = 0

  for (const row of verdictRows) {
    if (row.verdict === 'PASS') {
      passCount += 1
    } else if (row.verdict === 'PARTIAL') {
      partialCount += 1
    } else {
      failCount += 1
    }
  }

  return { passCount, partialCount, failCount }
}

function buildOutline(topic: string, audience: Audience, length: Length, iteration: number) {
  const audienceLabel =
    audience === 'beginner' ? '첫 도입 관점' : audience === 'advanced' ? '시스템 관점' : '팀 운영 관점'
  const titles = [
    `${topic}를 더 좁고 선명하게 다뤄야 하는 이유`,
    '권고안을 움직이는 핵심 신호',
    `${audienceLabel}에서 바로 적용할 운영 순서`,
    '메모를 발행 가능한 원고로 바꾸는 리뷰 루프',
    '출시 체크리스트와 다음 행동',
  ]

  const sectionCount = length === 'short' ? 3 : length === 'medium' ? 4 : 5
  const activeTitles = titles.slice(0, sectionCount)

  if (iteration === 1) {
    return activeTitles.map((title) => title.replace('더 좁고 선명하게 다뤄야 하는 이유', '지금 중요한 이유'))
  }

  if (iteration === 2) {
    return activeTitles.map((title, index) =>
      index === activeTitles.length - 1 && sectionCount < 5 ? '출시 체크리스트와 다음 행동' : title,
    )
  }

  return activeTitles
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

  if (iteration === 1) {
    return [
      `${topic}는 분명 중요한 주제지만, 첫 초안은 아직 의사결정 지점보다 넓은 트렌드 요약처럼 보입니다.`,
      `현재 독자 설정은 ${audienceSummary} 쪽을 가리키지만, 1차 초안은 입문자와 실무자 언어가 뒤섞여 있습니다.`,
      `문체는 ${toneSummary}로 가야 하지만, 아직은 반복이 많고 읽고 나서 남는 행동 신호가 약합니다.`,
    ]
  }

  if (iteration === 2) {
    return [
      `${topic}는 이제 일반 요약이 아니라 실제 운영 질문을 중심으로 다시 묶였습니다.`,
      `원고는 ${audienceSummary}에 맞춰 다시 정리되어, 예시와 다음 행동이 실제 실행 압력을 향하도록 바뀌고 있습니다.`,
      `중간 섹션이 아직 카드 조각처럼 보이기 때문에, 수정 루프는 전환 문장을 특히 강하게 감시합니다.`,
      `목표 분량은 ${lengthSummary}이므로, 각 문단은 장식이 아니라 분명한 역할을 가져야 합니다.`,
    ]
  }

  return [
    `${topic}는 이제 호기심 차원의 설명이 아니라, 실제 구현 경로를 어떻게 신뢰 가능한 선택으로 바꿀지에 초점이 맞춰져 있습니다.`,
    `연구, 개요, 초안, 리뷰가 분리되어 보이기 때문에, 사용자는 지금 무엇을 읽는지 더 빠르게 파악할 수 있습니다.`,
    `마지막 패스는 ${toneSummary}을 유지하면서도 ${audienceSummary}가 왜 지금 행동해야 하는지 더 또렷하게 말합니다.`,
    `전환 문장이 각 섹션을 이어 주기 때문에, 독자는 메모 조각이 아니라 하나의 진행감 있는 주장으로 읽게 됩니다.`,
    `승인본은 ${lengthSummary}에 맞게 압축되었고, 각 루프에서 무엇이 달라졌는지를 분명하게 드러냅니다.`,
  ]
}

function buildSectionBody(
  topic: string,
  audience: Audience,
  tone: Tone,
  title: string,
  index: number,
  iteration: number,
) {
  const audienceSummary = audienceLens[audience]
  const toneSummary = toneLens[tone]
  const firstSentence =
    iteration === 1
      ? `${topic}는 흥미롭지만, 1차 초안은 아직 워크숍 메모에 가깝습니다.`
      : iteration === 2
        ? `${topic}는 가능성을 나열하던 초안이 실제 선택을 말하기 시작할 때 훨씬 유용해집니다.`
        : `${topic}는 몇 가지 오래 가는 점검 기준으로 판단을 좁혀 줄 때 비로소 도입 가능한 글이 됩니다.`

  const secondSentence =
    index % 2 === 0
      ? `${audienceSummary}에게는 무엇을 먼저 신뢰하고, 무엇을 뒤로 미루고, 무엇을 출시 전에 검증해야 하는지가 중요합니다.`
      : `이 루프는 ${toneSummary}을 유지해, 글이 과장되지 않고 의도적으로 설계된 원고처럼 들리게 합니다.`

  const thirdSentence =
    iteration === 1
      ? '이 섹션은 아직 전환이 거칠고, 마지막에 무엇을 기억해야 하는지가 흐립니다.'
      : iteration === 2
        ? '수정 루프가 전환을 조였지만, 몇몇 문장은 아직 더 부드럽게 착지할 필요가 있습니다.'
        : '최종 패스에서는 섹션마다 하나의 선명한 takeaway를 남기고, 다음 섹션으로 자연스럽게 넘깁니다.'

  return `${title}는 여기서 시작됩니다. ${firstSentence} ${secondSentence} ${thirdSentence}`
}

function buildTakeaway(topic: string, iteration: number) {
  if (iteration === 1) {
    return `${topic}를 더 설명하기 전에, 먼저 하나의 결정 질문에 고정하세요.`
  }

  if (iteration === 2) {
    return '리뷰 루프로 반복을 줄이고, 각 섹션이 왜 남아 있어야 하는지 스스로 증명하게 만드세요.'
  }

  return '연구, 구조, 출시 가이드가 하나의 주장처럼 이어질 때만 원고를 내보내세요.'
}

function buildSectionDrafts(
  topic: string,
  audience: Audience,
  tone: Tone,
  outline: string[],
  iteration: number,
) {
  return outline.map<SectionDraft>((title, index) => ({
    title,
    body: buildSectionBody(topic, audience, tone, title, index, iteration),
    takeaway: buildTakeaway(topic, iteration),
  }))
}

function buildReviewNotes(topic: string, iteration: number) {
  if (iteration === 1) {
    return [
      `${topic}에 대한 첫 작성 방향은 맞지만, 독자 관점이 아직 충분히 좁혀지지 않았습니다.`,
      '섹션 사이 전환이 갑작스러워서, 지금 필요한 것은 문단 추가보다 다리 역할을 하는 연결 문장입니다.',
      '마무리가 아직 너무 일반적이라, 독자가 다음에 무엇을 해야 하는지 분명히 말해 주지 못합니다.',
    ]
  }

  if (iteration === 2) {
    return [
      `${topic}를 둘러싼 주장은 훨씬 선명해졌지만, 중간 섹션의 인계 문장은 아직 더 조일 여지가 있습니다.`,
      '이제 리뷰 포인트는 구조 결함보다 마감 완성도에 가깝습니다. 반복, 밀도, 다음 행동의 선명도가 핵심입니다.',
      '클로징만 더 단호해지면, 한 번의 수정 패스로 발행 가능한 원고 수준에 도달할 수 있습니다.',
    ]
  }

  return [
    `최종 패스는 ${topic}를 유망한 메모 묶음이 아니라 실제로 발행 가능한 글로 바꿉니다.`,
    '전환, 톤, 결론이 같은 권고안을 밀어 주기 때문에, 원고 전체가 하나의 주장처럼 읽힙니다.',
    '리뷰 게이트가 모두 닫혀서, 이제는 수동 구조조정 없이도 최종 마크다운을 바로 내보낼 수 있습니다.',
  ]
}

function buildVerdictRows(iteration: number): ChecklistRow[] {
  const notesByIteration = [
    [
      ['PARTIAL', '입력 4개는 보이지만, 예외 상황을 다루는 복구 문구가 아직 얇습니다.'],
      ['FAIL', '거친 초안은 흐름을 암시할 뿐, 승인본으로 보기엔 단계 구분이 아직 충분히 선명하지 않습니다.'],
      ['FAIL', '상태 전환이 암시 수준에 머물러 있어 진행 중 상태와 내보내기 상태를 더 분명하게 드러내야 합니다.'],
      ['FAIL', '에러 처리에는 즉시 보이는 경고 면과 복구 안내가 더 필요합니다.'],
      ['FAIL', '복사 동작은 아직 내보내기 준비 상태와 안전하게 연결되어 있지 않습니다.'],
      ['PARTIAL', '기본 레이아웃은 맞지만, 모바일 밀도와 스크롤 리듬은 더 의도적으로 다듬어야 합니다.'],
      ['PARTIAL', '의미 라벨은 있지만 실시간 상태와 키보드 흐름은 한 번 더 엄격하게 점검해야 합니다.'],
      ['FAIL', '시각 방향이 아직 제품 작업대보다 초기 골격 화면에 더 가깝습니다.'],
      ['FAIL', '반복 기록과 수정 추적이 드러나기 전까지는 개선 근거가 충분히 보이지 않습니다.'],
    ],
    [
      ['PASS', '입력, 라벨, 기본 가드가 이제 평가 계약을 충분히 덮습니다.'],
      ['PASS', '필수 5단계가 눈에 보이고, 개선 루프 서사와도 연결됩니다.'],
      ['PARTIAL', '대부분의 상태는 분리됐지만, 내보내기 안내와 리뷰 완료 문구는 더 조일 수 있습니다.'],
      ['PASS', '강제 실패 토픽은 복구 경로가 있는 경고 패널로 안전하게 분기됩니다.'],
      ['PARTIAL', '복사는 동작하지만, 잠금 해제 전 안내는 더 명확해질 수 있습니다.'],
      ['PARTIAL', '모바일 적층은 사용 가능하지만, 몇몇 조밀한 구간은 숨 쉴 공간이 더 필요합니다.'],
      ['PASS', '라벨, 실시간 상태 안내, 키보드 기본기는 갖춰졌습니다.'],
      ['PASS', '작업대 방향이 의도적으로 보이며 더 이상 기본 starter처럼 느껴지지 않습니다.'],
      ['PASS', '반복 추적과 리뷰-수정 연결이 이제 분명합니다.'],
    ],
    [
      ['PASS', '입력, 라벨, 빈 상태 안내가 모두 계약과 맞아 떨어집니다.'],
      ['PASS', '연구, 개요, 초안, 리뷰, 최종 원고가 하나의 흐름으로 자연스럽게 보입니다.'],
      ['PASS', '6개 상태가 모두 구분되고, 설명되며, 안전하게 게이트됩니다.'],
      ['PASS', '에러 진입, 경고 처리, 복구 안내가 명확하고 반복 가능하게 정리됐습니다.'],
      ['PASS', '내보내기는 마지막 반복에만 연결되고, 복사 피드백도 분명하게 돌아옵니다.'],
      ['PASS', '데스크톱과 모바일 모두 핵심 행동과 읽기 위계를 유지합니다.'],
      ['PASS', '실시간 상태 안내, 의미 있는 컨트롤, 키보드 흐름이 온전하게 살아 있습니다.'],
      ['PASS', '타이포그래피, 여백, 색 방향이 의도적이고 일관되게 맞춰졌습니다.'],
      ['PASS', '작성-리뷰-수정 루프가 UI와 반복 기록 계약 모두에서 보입니다.'],
    ],
  ] as const

  return notesByIteration[iteration - 1].map((row, index) => ({
    index: index + 1,
    label: checklistLabels[index],
    verdict: row[0] as ChecklistRow['verdict'],
    note: row[1],
  }))
}

function buildOptimizerChanges(iteration: number) {
  if (iteration === 1) {
    return [
      '기본 구조를 반복 이력이 보이는 루프 전용 작업대로 다시 세웠습니다.',
      '진행 중, 리뷰 완료, 내보내기 가능, 오류 문구를 추가해 상태 머신을 눈으로 따라가게 만들었습니다.',
      '승인 원고를 범용 미리보기 안이 아니라 별도의 최종 패널로 옮겨, 출시 후보가 바로 보이게 했습니다.',
    ]
  }

  if (iteration === 2) {
    return [
      '현재 반복 표를 압축하고, 실패·보류 수정 지시를 리뷰 판정 옆으로 끌어올렸습니다.',
      '모바일 적층을 다듬어 마크다운 내보내기 블록 전에도 최종 원고를 읽기 쉽게 유지했습니다.',
      '내보내기 액션이 왜 3차 승인안에만 열리는지 복사 피드백으로 분명하게 설명하게 했습니다.',
    ]
  }

  return [
    '최종 패스를 9/9 리뷰 게이트에 고정하고, 상태 배너를 내보내기 가능 안내와 정렬했습니다.',
    '여백, 표 overflow, CTA 위계를 다듬어 최종 원고를 묻지 않으면서도 루프 추적이 살아 있게 했습니다.',
    '반복 기록, scorecard, evaluation report로 이어지는 근거 묶음 준비를 마쳤습니다.',
  ]
}

function buildFinalArticle(
  topic: string,
  audience: Audience,
  tone: Tone,
  sectionDrafts: SectionDraft[],
  iteration: number,
): FinalArticle {
  const audienceSummary = audienceLens[audience]
  const toneSummary = toneLens[tone]
  const intro =
    iteration === 1
      ? `${topic}는 분명 중요하지만, 첫 패스는 아직 가능성만 보여 주는 워크숍 요약처럼 읽힙니다. ${audienceSummary}에게 신뢰할 만한 글이 되려면 논지의 초점을 더 강하게 좁혀야 합니다.`
      : iteration === 2
        ? `${topic}는 이제 넓은 아이디어 소개에서 실제 권고안으로 이동하고 있습니다. 이 패스는 반복을 덜어 내고, ${audienceSummary}가 바로 실행할 수 있는 방향으로 주장을 세우기 시작합니다.`
        : `${topic}는 아이디어 자체를 칭찬하는 글이 아니라, 어떤 운영 점검 기준으로 판단해야 하는지 말해 줄 때 비로소 유용해집니다. 이 최종 패스는 ${audienceSummary}를 기준으로 조정됐고, ${toneSummary}을 유지합니다.`

  const closing =
    iteration === 1
      ? '아직 출시할 단계는 아닙니다. 리뷰 루프가 전환 문장과 마무리 압축을 한 번 더 책임져야 합니다.'
      : iteration === 2
        ? '수정 패스를 한 번 더 거치면, 이 글은 내부 메모에서 외부 발행용 원고 수준으로 올라설 수 있습니다.'
        : `이제 원고는 출시 준비가 됐습니다. 프레이밍이 더 단단해졌고, 전환은 매끄러워졌으며, 결론은 ${topic}를 어떻게 행동으로 옮길지 직접 말해 줍니다.`

  const markdownLines = [`# ${topic}`, '', intro, '']

  for (const section of sectionDrafts) {
    markdownLines.push(`## ${section.title}`)
    markdownLines.push('')
    markdownLines.push(section.body)
    markdownLines.push('')
    markdownLines.push(`> 핵심 정리: ${section.takeaway}`)
    markdownLines.push('')
  }

  markdownLines.push('## 마무리')
  markdownLines.push('')
  markdownLines.push(closing)

  return {
    title: topic,
    intro,
    mergedSections: sectionDrafts,
    closing,
    markdown: markdownLines.join('\n'),
  }
}

export function isForcedErrorTopic(topic: string) {
  const normalized = topic.trim().toLowerCase()
  return normalized.startsWith('fail') || normalized.startsWith('error')
}

export function generatePipelineOutputs(inputs: BlogGeneratorInputs): PipelineOutputs {
  const topic = inputs.topic.trim().replace(/\s+/g, ' ')
  const iterations: IterationRecord[] = [1, 2, 3].map((iteration) => {
    const outline = buildOutline(topic, inputs.audience, inputs.length, iteration)
    const researchSummary = buildResearchSummary(
      topic,
      inputs.audience,
      inputs.tone,
      inputs.length,
      iteration,
    )
    const sectionDrafts = buildSectionDrafts(
      topic,
      inputs.audience,
      inputs.tone,
      outline,
      iteration,
    )
    const reviewNotes = buildReviewNotes(topic, iteration)
    const verdictRows = buildVerdictRows(iteration)
    const verdictCounts = countVerdicts(verdictRows)
    const finalArticle = buildFinalArticle(topic, inputs.audience, inputs.tone, sectionDrafts, iteration)

    return {
      iteration,
      startedAt: loopTimes[iteration - 1],
      phase: iteration === 1 ? 'reviewer' : iteration === 2 ? 'optimizer' : 'ready',
      verdictRows,
      passCount: verdictCounts.passCount,
      partialCount: verdictCounts.partialCount,
      failCount: verdictCounts.failCount,
      optimizerChanges: buildOptimizerChanges(iteration),
      buildStatus: buildStatusByIteration[iteration - 1],
      needsAnotherLoop: iteration < 3,
      researchSummary,
      outline,
      sectionDrafts,
      reviewNotes,
      iterationMarkdown: finalArticle.markdown,
    }
  })

  const finalIteration = iterations[iterations.length - 1]
  const finalArticle = buildFinalArticle(
    topic,
    inputs.audience,
    inputs.tone,
    finalIteration.sectionDrafts,
    3,
  )

  return {
    research_summary: finalIteration.researchSummary,
    outline: finalIteration.outline,
    section_drafts: finalIteration.sectionDrafts,
    review_notes: finalIteration.reviewNotes,
    final_post: finalArticle.markdown,
    final_article: finalArticle,
    iterations,
    loop_summary: {
      minimumLoopsMet: iterations.length >= 3,
      lastIterationPassCount: finalIteration.passCount,
      readyForExport: finalIteration.passCount >= 8,
    },
  }
}

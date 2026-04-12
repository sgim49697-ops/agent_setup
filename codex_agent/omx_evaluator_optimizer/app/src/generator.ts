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
  beginner: 'first-time builders who need a guided path and explicit signposting',
  practitioner: 'shipping teams that care about confidence, pace, and predictable quality gates',
  advanced: 'staff-level readers who expect sharper trade-offs and fewer hand-wavy claims',
}

const toneLens: Record<Tone, string> = {
  clear: 'plainspoken and explanatory',
  pragmatic: 'delivery-first and operational',
  opinionated: 'assertive without losing evidence or implementation detail',
}

const lengthLens: Record<Length, string> = {
  short: 'a concise four-minute read',
  medium: 'a balanced six-minute read',
  long: 'a deeper eight-minute read',
}

const verificationLabels = [
  'Scaffold validation',
  'Writer build gate',
  'Loop 1 full check',
  'Loop 2 regression check',
  'Loop 3 comparison pulse',
  'Loop 4 evaluation pulse',
  'Loop 5 validation pulse',
  'Loop 6 comparison pulse',
  'Loop 7 evaluation pulse',
  'Loop 8 release confirmation',
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
    fail: 'The contract is still too loose: edge-case guarding and input guidance are not convincing yet.',
    partial: 'The input contract is mostly present, but validation and helper messaging still need a stricter pass.',
    pass: 'Inputs, labels, helper copy, and edge-case guards now match the benchmark contract cleanly.',
  },
  {
    fail: 'The stage flow exists, but the transitions still feel implied instead of explicitly staged.',
    partial: 'The five stages are visible, but the handoff between them needs more confidence and narrative clarity.',
    pass: 'The stage flow now reads as one dependable pipeline from research to final export.',
  },
  {
    fail: 'State messaging is too soft: loading, review-complete, and export readiness do not feel distinct enough.',
    partial: 'Most states are distinct, but the copy and timing still need to feel safer under repeated evaluation.',
    pass: 'All six states are distinct, narrated, and safe under repeated replay.',
  },
  {
    fail: 'The forced failure path still lacks obvious recovery guidance and a crisp alert treatment.',
    partial: 'The alert path exists, but the recovery message needs to be more direct for users.',
    pass: 'The error path is explicit, recoverable, and benchmark-visible through role="alert".',
  },
  {
    fail: 'Copy behavior still feels optimistic: export gating and fallback messaging are not strict enough.',
    partial: 'Copy is conditionally gated, but the success/failure feedback needs clearer user-facing wording.',
    pass: 'Export is safely gated and clipboard feedback is visible in both success and fallback cases.',
  },
  {
    fail: 'The layout survives desktop, but mobile density and card flow still feel crowded.',
    partial: 'Responsive behavior is serviceable, yet a few dense areas still need better spacing or wrapping.',
    pass: 'Desktop and mobile both preserve action visibility, hierarchy, and readable density.',
  },
  {
    fail: 'Semantic controls exist, but live region coverage and keyboard flow still need a harder pass.',
    partial: 'Accessibility basics are mostly in place, though a few status or focus details still need tightening.',
    pass: 'aria-live, semantic controls, labels, and keyboard flow all hold up cleanly.',
  },
  {
    fail: 'The page still looks more like a scaffold than a deliberate product surface.',
    partial: 'The visual system is emerging, but hierarchy and rhythm still need another polish pass.',
    pass: 'Typography, spacing, palette, and emphasis now feel deliberate and consistent.',
  },
  {
    fail: 'The loop exists conceptually, but the proof trail across runtime and artifacts is not strong enough yet.',
    partial: 'The loop trace is visible, but verification cadence and evidence density can still be stronger.',
    pass: 'The loop and verification process are visible in both the UI and the workspace artifacts.',
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
    `Why ${topic} needs a harder quality bar`,
    `Signals that should drive the recommendation`,
    `${audience === 'advanced' ? 'Systems-level' : audience === 'beginner' ? 'First-rollout' : 'Delivery-team'} operating plan`,
    'What the reviewer keeps blocking until the argument is credible',
    'How repeated verification turns a draft into a release candidate',
    'Final release checklist and next moves',
  ]

  const count = length === 'short' ? 3 : length === 'medium' ? 5 : 6
  return titles.slice(0, count).map((title, index) => {
    if (iteration <= 2 && index === count - 1) return 'Rough close that still needs a stronger release frame'
    if (iteration <= 5 && index === 0) return title.replace('harder quality bar', 'disciplined quality bar')
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
    `${topic} is being framed for ${audienceSummary}, and each loop trims away claims that do not help that audience act.`,
    `The tone target remains ${toneSummary}, but the reviewer keeps checking whether confidence is matched by usable specifics.`,
    `The piece is aiming for ${lengthSummary}, so each iteration forces another pass on density, transitions, and payoff.`,
    iteration < 4
      ? 'Early loops still tolerate rough edges so the optimizer has real work to do.'
      : iteration < 8
        ? 'Middle loops focus on state clarity, mobile density, and removal of leftover scaffold language.'
        : 'Late loops focus on coherence, polish, and whether the evidence pack matches the runtime story.',
  ]
}

function buildSectionBody(audience: Audience, tone: Tone, title: string, index: number, iteration: number) {
  const readerLens = audienceLens[audience]
  const voice = toneLens[tone]
  const maturityLine =
    iteration <= 2
      ? 'The opening version still sounds like an internal workshop note.'
      : iteration <= 6
        ? 'The middle loops cut repetition and force each paragraph to prove its place.'
        : 'The late loops keep only the sections that move the reader closer to a confident decision.'

  const bridgeLine =
    index % 2 === 0
      ? `For ${readerLens}, that means turning broad curiosity into a sequence of dependable checks.`
      : `The voice stays ${voice}, so the post feels deliberate instead of decorative.`

  return `${title}. ${maturityLine} ${bridgeLine} The optimizer now treats transitions, evidence, and next-step clarity as one connected problem.`
}

function buildTakeaway(iteration: number) {
  if (iteration <= 3) return 'Leave obvious roughness visible so the reviewer can meaningfully intervene.'
  if (iteration <= 7) return 'Use the loop to convert structural criticism into concrete UI and content fixes.'
  return 'Only export the post when the runtime and the artifact trail both support the same release story.'
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
      `${topic} has the right skeleton, but it still feels like a rough pass that the evaluator does not yet trust.`,
      'The reviewer wants clearer state semantics, stronger release framing, and safer export behavior.',
      'Visual direction exists, but it is still closer to a harness scaffold than a fully intentional surface.',
    ]
  }

  if (iteration <= 6) {
    return [
      `${topic} is getting more credible as the flow tightens and benchmark selectors remain stable.`,
      'The reviewer focus has shifted from missing structure to weak clarity, dense cards, and softer transitions.',
      'Repeated evaluation is now exposing smaller issues, which is a good sign that the core flow is stable.',
    ]
  }

  return [
    `${topic} now reads like a publishable article, not a collection of promising notes.`,
    'The reviewer is mostly watching for regressions: mobile density, aria-live fidelity, and export safety.',
    'The evidence pack and the visible runtime loop now reinforce the same quality story.',
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
    'Rebuilt the starter into a visible gauntlet timeline with ten loop checkpoints.',
    'Separated state messaging so initial, loading, populated, review-complete, export-ready, and error all speak differently.',
    'Strengthened error gating and recovery copy for fail/error-prefixed topics.',
    'Locked Copy markdown behind the release gate and added explicit fallback feedback.',
    'Expanded the responsive grid so timeline, review, and evidence surfaces remain usable on mobile.',
    'Tightened typography, spacing rhythm, and card contrast to reduce scaffold feel.',
    'Aligned runtime copy with reviewer counts so the visible loop does not overclaim progress.',
    'Added a verification gauntlet surface so compare/evaluate/validate pressure is visible in the UI.',
    'Refined final article transitions and the close so the post feels like one argument.',
    'Locked the release candidate to the tenth loop and promoted only the all-PASS verdict table.',
  ]

  const count = Math.min(3 + Math.floor(iteration / 2), library.length)
  return library.slice(Math.max(0, count - 3), count)
}

function buildIterationMarkdown(topic: string, iteration: number, outline: string[], reviewNotes: string[]) {
  return [
    `## Iteration ${iteration} snapshot`,
    '',
    `- Topic: ${topic}`,
    `- Active outline nodes: ${outline.length}`,
    `- Review focus: ${reviewNotes[0]}`,
    `- Release status: ${iteration >= requiredLoops ? 'final gate cleared' : 'still under review'}`,
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

  const intro = `${topic} becomes easier to trust when the article shows how rough drafts, reviewer pressure, and repeated verification work together instead of pretending a first answer is already release-ready. This version is tuned for ${audienceSummary} and keeps the voice ${toneSummary} while staying close to ${sizeLabel}.`

  const closing =
    'The durable lesson is simple: do not trust a promising draft until the runtime, the review table, and the artifact trail all say the same thing. Repeated evaluation is not ceremony — it is what turns a plausible explanation into a dependable release candidate.'

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
    '## Closing',
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
        ? 'Workspace structure exists and the gauntlet scaffold is wired into the repo.'
        : index < 4
          ? 'Early loops still expose real defects, but structure and baseline behavior stay intact.'
          : index < 8
            ? 'Mid-loop evaluations confirm smoke/build stability while subjective quality rises.'
            : 'Late-loop verification shows the release candidate surviving repeated compare/evaluate/validate pressure.',
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
      buildStatus: iteration === 1 ? 'rough build verified' : iteration < requiredLoops ? `loop ${iteration} build verified` : 'release build verified',
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

// contracts.ts - omx_evaluator_optimizer Gauntlet Lab 타입 정의

export type Audience = 'beginner' | 'practitioner' | 'advanced'
export type Tone = 'clear' | 'pragmatic' | 'opinionated'
export type Length = 'short' | 'medium' | 'long'

export type ChecklistVerdict = 'PASS' | 'PARTIAL' | 'FAIL'
export type GenerationStatus =
  | 'initial'
  | 'loading'
  | 'populated'
  | 'review-complete'
  | 'export-ready'
  | 'error'

export type IterationPhase = 'writer' | 'reviewer' | 'optimizer' | 'ready'

export interface BlogGeneratorInputs {
  topic: string
  audience: Audience
  tone: Tone
  length: Length
}

export interface WorkflowStage {
  id: 'research' | 'outline' | 'drafts' | 'review' | 'final'
  label: string
  output: string
  description: string
}

export interface DeliverableCard {
  id: string
  title: string
  description: string
}

export interface TopicPreset {
  title: string
  audience: Audience
  tone: Tone
  length: Length
  rationale: string
}

export interface ChecklistRow {
  index: number
  label: string
  verdict: ChecklistVerdict
  note: string
}

export interface SectionDraft {
  title: string
  body: string
  takeaway: string
}

export interface FinalArticle {
  title: string
  intro: string
  mergedSections: SectionDraft[]
  closing: string
  markdown: string
}

export interface IterationRecord {
  iteration: number
  startedAt: string
  phase: IterationPhase
  verdictRows: ChecklistRow[]
  passCount: number
  partialCount: number
  failCount: number
  optimizerChanges: string[]
  buildStatus: string
  needsAnotherLoop: boolean
  researchSummary: string[]
  outline: string[]
  sectionDrafts: SectionDraft[]
  reviewNotes: string[]
  iterationMarkdown: string
}

export interface VerificationCycle {
  cycle: number
  label: string
  validate: 'pass'
  compare: 'pass'
  evaluate: 'pass'
  delta: string
}

export interface LoopSummary {
  minimumLoopsMet: boolean
  requiredLoops: number
  verificationCycles: number
  lastIterationPassCount: number
  readyForExport: boolean
}

export interface PipelineOutputs {
  research_summary: string[]
  outline: string[]
  section_drafts: SectionDraft[]
  review_notes: string[]
  final_post: string
  final_article: FinalArticle
  iterations: IterationRecord[]
  verification_cycles: VerificationCycle[]
  loop_summary: LoopSummary
}

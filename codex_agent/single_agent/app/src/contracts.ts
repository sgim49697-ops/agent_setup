// contracts.ts - single_agent 워크스페이스의 제품 계약과 실행 타입 정의

export type Audience = 'beginner' | 'practitioner' | 'advanced'
export type Tone = 'clear' | 'pragmatic' | 'opinionated'
export type Length = 'short' | 'medium' | 'long'

export type GenerationStageId = 'research' | 'outline' | 'drafts' | 'review' | 'final'
export type GenerationStatus =
  | 'initial'
  | 'loading'
  | 'populated'
  | 'review-complete'
  | 'export-ready'
  | 'error'

export interface BlogGeneratorInputs {
  topic: string
  audience: Audience
  tone: Tone
  length: Length
}

export interface WorkflowStage {
  id: GenerationStageId
  label: string
  hook: string
  output: keyof PipelineOutputs
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

export interface ResearchSummary {
  angle: string
  thesis: string
  audienceFit: string
  searchTerms: string[]
  findings: string[]
  references: string[]
}

export interface OutlineSection {
  id: string
  title: string
  summary: string
}

export interface SectionDraft {
  id: string
  title: string
  body: string[]
  takeaway: string
}

export interface ReviewNote {
  label: string
  detail: string
  severity: 'good' | 'watch' | 'improve'
}

export interface PipelineOutputs {
  research_summary: ResearchSummary
  outline: OutlineSection[]
  section_drafts: SectionDraft[]
  review_notes: ReviewNote[]
  final_post: string
}

export interface GenerationState {
  status: GenerationStatus
  currentStage: GenerationStageId | null
  completedStages: GenerationStageId[]
  outputs: Partial<PipelineOutputs>
  statusMessage: string
  errorMessage: string | null
}

export interface RunManifest {
  harness: string
  run_id: string
  started_at: string
  finished_at: string
  task_spec_version: string
  status: 'completed' | 'failed' | 'partial'
}

export interface ArtifactIndex {
  screenshots: string[]
  final_urls: string[]
  notes: string[]
  deliverables: string[]
}

export interface Scorecard {
  task_success: number
  ux_score: number
  flow_clarity: number
  visual_quality: number
  responsiveness: number
  a11y_score: number
  process_adherence: number
  overall_score: number
}

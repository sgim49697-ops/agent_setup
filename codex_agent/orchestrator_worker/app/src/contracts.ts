// contracts.ts - orchestrator_worker 워크스페이스의 타입 계약

export type Audience = 'beginner' | 'practitioner' | 'advanced'
export type Tone = 'clear' | 'pragmatic' | 'opinionated'
export type Length = 'short' | 'medium' | 'long'

export type WorkerId = 'ui_worker' | 'state_worker' | 'content_worker'
export type WorkerStatus = 'pending' | 'working' | 'complete' | 'error'
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

export interface WorkerProfile {
  id: WorkerId
  label: string
  focus: string
  reviewLens: string
}

export interface TaskBundle {
  workerId: WorkerId
  scope: string
  ownedDeliverables: string[]
  integrationRisks: string[]
}

export interface OrchestratorPlan {
  productGoal: string
  decompositionReason: string
  bundles: TaskBundle[]
  integrationChecklist: string[]
}

export interface WorkerOutput {
  workerId: WorkerId
  summary: string
  handoffNote: string
  deliverablePreview: string[]
}

export interface ResearchSummary {
  angle: string
  thesis: string
  focusBullets: string[]
  supportNote: string
}

export interface OutlineSection {
  id: string
  title: string
  goal: string
}

export interface SectionDraft {
  id: string
  title: string
  summary: string
  paragraphs: string[]
  takeaway: string
}

export interface ReviewNote {
  label: string
  detail: string
  severity: 'good' | 'watch' | 'improve'
}

export interface IntegrationReview {
  layoutConsistency: string
  stateConsistency: string
  contentConsistency: string
  fixesApplied: string[]
  finalizationNote: string
}

export interface PipelineOutputs {
  research_summary: ResearchSummary
  outline: OutlineSection[]
  section_drafts: SectionDraft[]
  review_notes: ReviewNote[]
  final_post: string
  orchestrator_plan: OrchestratorPlan
  worker_outputs: WorkerOutput[]
  integration_review: IntegrationReview
}

export interface GenerationState {
  status: GenerationStatus
  currentStage: GenerationStageId | null
  completedStages: GenerationStageId[]
  workerStatuses: Record<WorkerId, WorkerStatus>
  orchestratorPlan: OrchestratorPlan | null
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

import { useState } from 'react'
import './App.css'
import type { Audience, BlogGeneratorInputs, Length, Tone } from './contracts'
import { deliverables, reviewLenses, topicPresets, workflowStages } from './starterData'

function App() {
  const [inputs, setInputs] = useState<BlogGeneratorInputs>({
    topic: topicPresets[0].title,
    audience: 'practitioner',
    tone: 'pragmatic',
    length: 'medium',
  })
  const [statusMessage, setStatusMessage] = useState(
    'Starter mode only. Each harness will implement the real generation workflow from here.',
  )

  function updateField<Key extends keyof BlogGeneratorInputs>(
    field: Key,
    value: BlogGeneratorInputs[Key],
  ) {
    setInputs((current) => ({ ...current, [field]: value }))
  }

  function applyPreset(title: string, audience: Audience, tone: Tone, length: Length) {
    setInputs({ topic: title, audience, tone, length })
    setStatusMessage('Preset loaded. Use this as a shared benchmark input when you run Codex.')
  }

  async function copyContract() {
    const payload = JSON.stringify(inputs, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      setStatusMessage('Input contract copied. Future harness runs can paste this into their prompt bundle.')
    } catch {
      setStatusMessage(
        'Clipboard copy failed in this browser context. The input contract is still visible on screen.',
      )
    }
  }

  function handleGenerateStub() {
    setStatusMessage(
      'Generation is intentionally not implemented in the starter. Codex should build the pipeline inside each harness workspace.',
    )
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Codex Benchmark Starter</p>
          <h1>Tech Blog Post Generator</h1>
          <p className="lead">
            A shared starting point for six Codex harnesses. The UI already knows the
            product contract, but the real generation flow is intentionally left for each
            workspace to implement.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary" onClick={handleGenerateStub}>
              Generate post
            </button>
            <button type="button" className="secondary" onClick={copyContract}>
              Copy markdown
            </button>
          </div>
          <p className="status" aria-live="polite">
            {statusMessage}
          </p>
        </div>

        <aside className="hero-panel">
          <p className="panel-label">Shared Input Contract</p>
          <form className="input-grid">
            <label>
              <span>Topic</span>
              <textarea
                name="topic"
                rows={4}
                value={inputs.topic}
                onChange={(event) => updateField('topic', event.target.value)}
              />
            </label>
            <label>
              <span>Audience</span>
              <select
                name="audience"
                value={inputs.audience}
                onChange={(event) => updateField('audience', event.target.value as Audience)}
              >
                <option value="beginner">Beginner</option>
                <option value="practitioner">Practitioner</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label>
              <span>Tone</span>
              <select
                name="tone"
                value={inputs.tone}
                onChange={(event) => updateField('tone', event.target.value as Tone)}
              >
                <option value="clear">Clear</option>
                <option value="pragmatic">Pragmatic</option>
                <option value="opinionated">Opinionated</option>
              </select>
            </label>
            <label>
              <span>Length</span>
              <select
                name="length"
                value={inputs.length}
                onChange={(event) => updateField('length', event.target.value as Length)}
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>
          </form>
        </aside>
      </section>

      <section className="preset-strip" aria-label="Benchmark topics">
        {topicPresets.map((preset) => (
          <button
            key={preset.title}
            type="button"
            className="preset-chip"
            onClick={() =>
              applyPreset(preset.title, preset.audience, preset.tone, preset.length)
            }
          >
            <strong>{preset.title}</strong>
            <span>{preset.rationale}</span>
          </button>
        ))}
      </section>

      <section className="panel">
        <div className="section-head">
          <p className="eyebrow">Required Workflow</p>
          <h2>Common stage contract</h2>
        </div>
        <div className="stage-grid">
          {workflowStages.map((stage, index) => (
            <article key={stage.id} className="stage-card">
              <p className="stage-order">0{index + 1}</p>
              <h3>{stage.label}</h3>
              <p>{stage.description}</p>
              <code>{stage.output}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="two-up">
        <article className="panel">
          <div className="section-head">
            <p className="eyebrow">Artifacts</p>
            <h2>Every harness must leave evidence</h2>
          </div>
          <div className="artifact-list">
            {deliverables.map((item) => (
              <article key={item.id} className="artifact-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="section-head">
            <p className="eyebrow">Review Lenses</p>
            <h2>What the evaluator will look for</h2>
          </div>
          <ul className="review-list">
            {reviewLenses.map((lens) => (
              <li key={lens}>{lens}</li>
            ))}
          </ul>
          <pre className="contract-preview">{JSON.stringify(inputs, null, 2)}</pre>
        </article>
      </section>

      <section className="panel starter-note">
        <div className="section-head">
          <p className="eyebrow">Starter Status</p>
          <h2>What still needs to be built by Codex</h2>
        </div>
        <div className="status-grid">
          <div>
            <h3>Implemented now</h3>
            <ul>
              <li>Shared input contract UI</li>
              <li>Benchmark topic presets</li>
              <li>Workflow and artifact contract visualization</li>
            </ul>
          </div>
          <div>
            <h3>Left for each harness</h3>
            <ul>
              <li>Real step progression and loading states</li>
              <li>Research, outline, draft, review, and final content generation</li>
              <li>Final export behavior and per-harness reporting artifacts</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App

# AI Workflow Rules

## Approach

Build Threshold incrementally against the specifications in this `context/` directory. Context files are the source of truth for what to build. The product axiom — *every recommendation is traceable to a number, every number is traceable to a public dataset* — overrides any other implementation instinct.

When in doubt, prefer:

1. Real data over synthetic data, even if the real-data path is harder.
2. Smaller, defensible models over larger, hand-wavy ones.
3. Wiring an end-to-end vertical slice (one source → one factor → one map colour → one recommendation card) over horizontal completeness.

## Scoping Rules

- Work on one feature unit at a time. A unit is a single vertical slice that produces something user-visible.
- Prefer small, verifiable increments. If a unit takes more than ~3 hours without producing something demonstrable, the unit is too large.
- Do not combine work across folder boundaries (`frontend/`, `backend/`, `pipeline/`) in a single commit unless the change is genuinely cross-cutting (e.g. a new ontology field that all three layers must adopt).
- Hackathon submission is 2026-05-26 23:59. MVP scope in `project-overview.md` is the hard floor. Stretch features ship only if MVP is green.

## When to Split Work

Split an implementation step if it combines:

- Frontend UI changes and backend API contract changes that have not been agreed upon.
- New ingestion logic and new ontology fields without a clear migration path.
- ML model training and inference wiring at the same time. Train first, validate, then wire.
- A new LLM-backed feature and a new data source — pick one to add per step.
- Anything not clearly defined in the context files. Resolve the spec in `progress-tracker.md` first.

If a change cannot be verified end to end in under 30 minutes, the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behaviour not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context file (`project-overview.md`, `architecture.md`, `ui-context.md`) before implementing.
- If a requirement is missing, add it to Open Questions in `progress-tracker.md` and ask before continuing.
- Never substitute a "reasonable default" for a missing data source. If the real source is not wired, the feature does not ship — even with placeholder numbers.

## Protected Files

Do not modify without explicit instruction:

- `frontend/components/ui/*` — shadcn-generated primitives, regenerated from CLI.
- `backend/models/*.onnx` — exported model artifacts. Regenerate by running the training pipeline, not by editing.
- `pipeline/data/raw/*` — raw downloaded source files. Treat as immutable input.
- `docs/*` — reference material from the hackathon and external sources.

## LLM and Model Discipline

- An LLM call must always receive structured numeric inputs and return structured output (or prose that wraps those exact inputs). LLMs do not produce probabilities, scores, ranks, or counts.
- If a model output influences a UI surface, the UI must be able to display the model's confidence or input attribution.
- DeepSeek is the critic, not the source. Its role is to evaluate ML outputs and surface low-confidence cases, not to generate new predictions.
- Gemini is the synthesizer. Its role is to compose briefings from already-computed numbers.

## Keeping Docs in Sync

Update the relevant context file in the same commit whenever implementation changes:

- New data source → update `architecture.md` ontology and storage sections.
- New ML model → update `architecture.md` Stack table and `project-overview.md` features.
- New UI surface → update `ui-context.md` and `project-overview.md` user flow.
- New invariant or convention → update `architecture.md` invariants or `code-standards.md`.
- Any completed unit → update `progress-tracker.md` Completed section.

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope, demonstrated in a running app or notebook.
2. No invariant in `architecture.md` was violated. In particular: numbers come from models, not LLMs; sources are recorded on every entity row.
3. `progress-tracker.md` Completed and Session Notes reflect the work.
4. Frontend: `npm run build` passes. Backend: `pytest` passes if tests exist, `uvicorn` boots clean. Pipeline: notebook runs top-to-bottom without errors.
5. Any new data surfaces show source provenance to the user.

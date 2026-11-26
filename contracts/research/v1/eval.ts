import { z } from "zod";
import { Id, Instant, ItemRef, RevisionRef, issue, sameRevision } from "./die.ts";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const VersionedRef = z.object({ id: Id, version: Id }).strict();
const seal = z.object({ digest, actor_id: Id, sealed_at: Instant }).strict();
const layer = z.enum(["deterministic", "real_source", "human", "domain", "lived"]);
export const Scenario = VersionedRef.extend({
  suite: VersionedRef, decision: Id, layer, preconditions: z.array(Id),
  observable_criteria: z.array(Id).min(1), stopping_conditions: z.array(Id).min(1),
  variation_of: VersionedRef.optional(), transfer_from: VersionedRef.optional(),
}).strict();
export const Fixture = VersionedRef.extend({
  dataset: VersionedRef, classification: z.enum(["synthetic", "real"]),
  revision: RevisionRef, provenance: Id, scope_ref: Id, digest,
}).strict();
export const BlindInput = z.object({
  id: Id, fixture: VersionedRef, authorized_context_refs: z.array(Id),
  allowed_question_refs: z.array(Id), environment: VersionedRef,
}).strict();
export const Contrast = z.object({
  id: Id, reference_ref: Id, historical_receipt_refs: z.array(Id),
  custodian_id: Id, authorization_ref: Id,
}).strict();
export const Rubric = VersionedRef.extend({
  dimensions: z.array(Id).min(1), critical_blocks: z.array(Id),
  expected_digest: digest.optional(), seal,
}).strict();
export const EvaluationRun = z.object({
  id: Id, eval_version: z.literal("1.0.0"), die_version: z.literal("1.0.0"),
  suite: VersionedRef, scenario: VersionedRef, fixture: Fixture, rubric: Rubric,
  runtime: VersionedRef, model: VersionedRef, tool_config: VersionedRef,
  started_at: Instant, output: seal.extend({ revision: RevisionRef, trace_ref: Id }).strict().optional(),
  reveal_at: Instant.optional(), baseline: VersionedRef.optional(), comparison_limits: z.array(Id),
  attempts: z.array(z.object({ id: Id, reason: Id, budget_trace_ref: Id }).strict()).min(1),
  contamination: z.array(z.object({ incident_ref: Id, invalidated_at: Instant }).strict()),
  judge_prior_knowledge_ref: Id.optional(),
  verdicts: z.array(z.object({
    dimension: Id, layer, result: z.enum(["accredited", "partial", "blocked"]),
    observations: z.array(z.object({ statement: Id, evidence: z.array(ItemRef) }).strict()),
    missing: z.array(Id), critical_findings: z.array(Id), judgment: Id,
  }).strict()),
}).strict().superRefine((run, ctx) => {
  if (new Set(run.attempts.map(({ id }) => id)).size !== run.attempts.length) {
    issue(ctx, ["attempts"], "Attempt identities must be unique");
  }
  const rubricAt = Date.parse(run.rubric.seal.sealed_at);
  const outputAt = run.output && Date.parse(run.output.sealed_at);
  if ((outputAt !== undefined && (outputAt < Date.parse(run.started_at) || rubricAt >= outputAt)) ||
      (run.reveal_at && (outputAt === undefined || outputAt >= Date.parse(run.reveal_at)))) {
    issue(ctx, ["output"], "Seal the rubric before output and the output before reveal");
  }
  for (const verdict of run.verdicts) {
    const supports = verdict.observations.flatMap(({ evidence }) => evidence);
    if (!run.rubric.dimensions.includes(verdict.dimension) ||
        supports.some((ref) => !run.output || !sameRevision(ref, run.output.revision))) {
      issue(ctx, ["verdicts"], "Judgment must resolve to a rubric dimension and the sealed DIE revision");
    }
    if (verdict.result === "accredited" && (!run.output || !run.judge_prior_knowledge_ref ||
        verdict.critical_findings.length || verdict.missing.length || !supports.length ||
        run.contamination.length || (run.fixture.classification === "synthetic" && verdict.layer !== "deterministic"))) {
      issue(ctx, ["verdicts"], "Accreditation requires evidenced judgment with no critical block");
    }
  }
});

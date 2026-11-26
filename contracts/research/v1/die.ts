import { z } from "zod";

export const Id = z.string().min(1).refine((value) => value.trim() === value, "ID must be exact");
export const Instant = z.string().datetime({ offset: true });
export const Count = z.number().int().nonnegative().safe();
export const RevisionRef = z.object({ dossier_id: Id, revision_id: Id }).strict();
export const ItemRef = RevisionRef.extend({ item_id: Id }).strict();
export const Visibility = z.enum(["personal", "subgroup", "trip_shared"]);
const Text = z.string().trim().min(1);
const Links = z.array(Id);
const item = z.object({ id: Id });
const subject = item.extend({ person_id: Id, contributed_by: Id }).strict();
const criterion = item.extend({
  description: Text, subject_ids: Links.min(1), provenance: Id,
  interpretation: Text, hardness: z.enum(["hard", "soft", "ambiguous"]),
  essential: z.boolean(), rationale: Text, valid_until: Instant.optional(),
}).strict();
const question = item.extend({
  text: Text, resolution: z.enum(["human", "external"]), essential: z.boolean(),
  criterion_ids: Links, candidate_ids: Links,
}).strict();
const candidate = item.extend({
  label: Text, identity: z.discriminatedUnion("status", [
    z.object({ status: z.literal("unresolved") }).strict(),
    z.object({ status: z.literal("ambiguous"), reason: Text }).strict(),
    z.object({ status: z.literal("resolved"), place_id: Id, provenance: Id }).strict(),
  ]),
}).strict();
const evidence = item.extend({
  candidate_id: Id, origin: Id, intermediary: Id.optional(), locator_ref: Id.optional(),
  observed_at: Instant, fact_at: Instant.nullable(), scope: Text, limitations: z.array(Text),
  freshness: z.discriminatedUnion("status", [
    z.object({ status: z.literal("bounded"), until: Instant }).strict(),
    z.object({ status: z.literal("revalidate"), condition: Text }).strict(),
  ]),
  independence: z.enum(["independent", "derived", "unknown"]),
  visibility: Visibility, contributed_by: Id.optional(),
}).strict();
const claim = item.extend({
  candidate_id: Id, statement: Text, producer: Id, scope: Text, essential: z.boolean(),
  criterion_ids: Links, status: z.enum(["verified", "inferred", "contradictory", "pending"]),
  evidence: z.array(z.object({
    evidence_id: Id, relation: z.enum(["supports", "refutes", "limits"]), rationale: Text,
  }).strict()), explanation: Text,
}).strict();
const assessment = item.extend({
  candidate_id: Id, criterion_id: Id, claim_ids: Links,
  finding: z.enum(["meets", "fails", "tradeoff", "ambiguous", "unknown"]),
  explanation: Text,
}).strict();
const disposition = item.extend({
  candidate_id: Id, reason: Text,
  detail: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("criterion_failure"), assessment_id: Id }).strict(),
    z.object({ kind: z.literal("personal_rejection"), actor_id: Id, scope: Text, at: Instant }).strict(),
    z.object({ kind: z.literal("postponed"), actor_id: Id, scope: Text, at: Instant }).strict(),
    z.object({ kind: z.literal("insufficient"), question_ids: Links.min(1) }).strict(),
    z.object({ kind: z.literal("unavailable"), evidence_id: Id, scope: Text }).strict(),
  ]),
}).strict();
const recommendation = item.extend({
  candidate_id: Id.optional(), outcome: z.enum(["supported", "partial", "none_sufficient", "blocked"]),
  assessment_ids: Links, open_question_ids: Links, rationale: Text, limitations: z.array(Text),
}).strict();
export const Invalidation = z.object({
  origin: RevisionRef, caused_by: RevisionRef, actor_id: Id, recorded_at: Instant,
  correction: Text, scope: Text,
  affected: z.array(z.object({
    item: ItemRef, status: z.enum(["invalidated", "revalidate", "retained"]), reason: Text,
  }).strict()),
  affected_proposal_ids: Links,
}).strict().superRefine((value, ctx) => {
  const { origin, caused_by } = value;
  if (origin.dossier_id !== caused_by.dossier_id || origin.revision_id === caused_by.revision_id ||
      value.affected.some(({ item }) => !sameRevision(item, origin))) {
    issue(ctx, ["affected"], "Invalidation must link items of an earlier revision of the same dossier");
  }
});

export function sameRevision(a: z.infer<typeof RevisionRef>, b: z.infer<typeof RevisionRef>) {
  return a.dossier_id === b.dossier_id && a.revision_id === b.revision_id;
}
export function issue(ctx: z.RefinementCtx, path: (string | number)[], message: string) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

export const Dossier = z.object({
  dossier_id: Id, owner_id: Id, visibility: Visibility, purpose: Text, trip_id: Id.optional(),
}).strict();

export const ResearchRevision = RevisionRef.extend({
  die_version: z.literal("1.0.0"), producer: Id, recorded_at: Instant, reason: Text,
  preceding_revision_id: Id.optional(),
  objective: z.object({ question: Text, category: Id, scope: Text, temporal_context: Text }).strict(),
  subjects: z.array(subject),
  criteria: z.array(criterion),
  questions: z.array(question),
  strategy: z.object({ question_ids: Links, rationale: Text, coverage: Text, limits: z.array(Text) }).strict(),
  candidates: z.array(candidate),
  evidence: z.array(evidence),
  claims: z.array(claim),
  assessments: z.array(assessment),
  dispositions: z.array(disposition),
  recommendations: z.array(recommendation),
  invalidations: z.array(Invalidation),
}).strict().superRefine((revision, ctx) => {
  const groups = {
    subjects: revision.subjects, criteria: revision.criteria, questions: revision.questions,
    candidates: revision.candidates, evidence: revision.evidence, claims: revision.claims,
    assessments: revision.assessments, dispositions: revision.dispositions,
    recommendations: revision.recommendations,
  };
  const ids = Object.values(groups).flatMap((items) => items.map(({ id }) => id));
  if (new Set(ids).size !== ids.length) {
    issue(ctx, [], "Item IDs must be unique within a revision");
    return;
  }
  const requireRefs = (group: keyof typeof groups, refs: string[], path: string[]) => {
    if (refs.some((id) => !groups[group].some((item) => item.id === id))) {
      issue(ctx, path, "Reference must resolve within this revision");
    }
  };
  if (revision.preceding_revision_id === revision.revision_id ||
      revision.invalidations.some(({ caused_by }) => !sameRevision(caused_by, revision))) {
    issue(ctx, ["invalidations"], "Correction must identify this revision and a distinct origin");
  }
  requireRefs("questions", revision.strategy.question_ids, ["strategy", "question_ids"]);
  for (const value of revision.criteria) {
    requireRefs("subjects", value.subject_ids, ["criteria", value.id]);
    if (value.hardness === "hard" && !value.essential) issue(ctx, ["criteria", value.id], "Hard criteria are essential");
  }
  for (const value of revision.questions) {
    requireRefs("criteria", value.criterion_ids, ["questions", value.id]);
    requireRefs("candidates", value.candidate_ids, ["questions", value.id]);
  }
  const at = Date.parse(revision.recorded_at);
  for (const value of revision.evidence) {
    requireRefs("candidates", [value.candidate_id], ["evidence", value.id]);
    if (Date.parse(value.observed_at) > at) issue(ctx, ["evidence", value.id], "Observation postdates the revision");
  }
  for (const value of revision.claims) {
    const path = ["claims", value.id];
    requireRefs("candidates", [value.candidate_id], path);
    requireRefs("criteria", value.criterion_ids, path);
    const linked = value.evidence.map(({ evidence_id, relation }) => ({
      evidence: revision.evidence.find(({ id }) => id === evidence_id), relation,
    }));
    if (linked.some(({ evidence }) => evidence?.candidate_id !== value.candidate_id)) {
      issue(ctx, path, "Claim evidence must identify the same candidate");
    }
    const supports = linked.filter(({ relation }) => relation === "supports");
    const refutes = linked.some(({ relation }) => relation === "refutes");
    if (value.status === "verified" && (refutes || !supports.some(({ evidence }) =>
      evidence?.freshness.status === "bounded" && Date.parse(evidence.freshness.until) > at))) {
      issue(ctx, path, "Verified claim requires current support without unresolved refutation");
    }
    if (value.status === "contradictory" && (!refutes || !supports.length)) {
      issue(ctx, path, "A contradiction requires opposing observations");
    }
    if (value.status === "verified" &&
        revision.candidates.find(({ id }) => id === value.candidate_id)?.identity.status === "ambiguous") {
      issue(ctx, path, "Ambiguous candidate identity cannot support verification");
    }
  }
  for (const value of revision.assessments) {
    const path = ["assessments", value.id];
    requireRefs("candidates", [value.candidate_id], path);
    requireRefs("criteria", [value.criterion_id], path);
    const claims = value.claim_ids.map((id) => revision.claims.find((claim) => id === claim.id));
    if (claims.some((claim) => claim?.candidate_id !== value.candidate_id || !claim.criterion_ids.includes(value.criterion_id))) {
      issue(ctx, path, "Assessment claims must resolve for its candidate and criterion");
    }
    if (["meets", "fails"].includes(value.finding) && !claims.some((claim) => claim?.status === "verified")) {
      issue(ctx, path, "A definitive finding requires a verified claim");
    }
  }
  for (const { id, candidate_id, detail } of revision.dispositions) {
    const path = ["dispositions", id];
    requireRefs("candidates", [candidate_id], path);
    if (detail.kind === "insufficient") requireRefs("questions", detail.question_ids, path);
    if (detail.kind === "criterion_failure" && !revision.assessments.some((a) =>
      a.id === detail.assessment_id && a.candidate_id === candidate_id && a.finding === "fails")) {
      issue(ctx, path, "Criterion failure requires a matching failed assessment");
    }
    if (detail.kind === "unavailable" && !revision.evidence.some((e) => e.id === detail.evidence_id && e.candidate_id === candidate_id)) {
      issue(ctx, path, "Unavailability requires matching scoped evidence");
    }
  }
  for (const value of revision.recommendations) {
    const path = ["recommendations", value.id];
    requireRefs("candidates", value.candidate_id ? [value.candidate_id] : [], path);
    requireRefs("questions", value.open_question_ids, path);
    requireRefs("assessments", value.assessment_ids, path);
    const assessments = revision.assessments.filter(({ id }) => value.assessment_ids.includes(id));
    const candidateId = value.candidate_id;
    if (candidateId && assessments.some((a) => a.candidate_id !== candidateId)) {
      issue(ctx, path, "Recommendation assessments must match its candidate");
    }
    if (value.outcome !== "supported") continue;
    const blocked = revision.questions.some((q) => q.essential &&
      (!q.candidate_ids.length || (candidateId && q.candidate_ids.includes(candidateId))));
    const unverified = revision.claims.some((c) => c.candidate_id === candidateId && c.essential && c.status !== "verified");
    const unmet = revision.criteria.some((c) => c.essential &&
      (c.hardness === "ambiguous" || (c.valid_until && Date.parse(c.valid_until) <= at) ||
        !assessments.some((a) => a.criterion_id === c.id && a.finding === "meets")));
    const failed = revision.assessments.some((a) => a.candidate_id === candidateId && a.finding === "fails" &&
      revision.criteria.some((c) => c.id === a.criterion_id && c.essential));
    if (!candidateId || !assessments.length || blocked || unverified || unmet || failed) {
      issue(ctx, path, "Essential gaps prevent a supported recommendation");
    }
  }
});

export const HumanChoice = z.object({
  id: Id, actor_id: Id, subject_ids: Links, chosen_candidate: ItemRef.optional(),
  chosen_option: Text, scope: Text, at: Instant, rationale: Text,
}).strict();

export const Expectation = z.object({
  id: Id, subject_id: Id, at: Instant, context: Text, prediction: Text, evidence: z.array(ItemRef),
}).strict();

export const LivedOutcome = z.object({
  id: Id, declared_by: Id, subject_id: Id, declared_at: Instant, experienced_at: Instant.nullable(),
  retrospective: z.boolean(), context: Text, account: Text, provenance: Id,
  choice_id: Id.optional(), expectation_id: Id.optional(),
}).strict();

export const Learning = z.object({
  id: Id, subject_id: Id, producer: Id, outcome_id: Id, expectation_id: Id.nullable(),
  scope: Text, hypothesis: Text, evidence: z.array(ItemRef), limits: Text,
  review_condition: Text, correction_ref: Id.optional(), storage: z.literal("personal"),
}).strict();

export const LearningPromotion = z.object({
  learning_id: Id, subject_id: Id, actor_id: Id,
  authorization_ref: Id, destination: z.enum(["subgroup", "trip_shared"]),
  destination_ref: Id, approved_summary: Text, recorded_at: Instant,
}).strict();

export const ExecutionLink = z.object({
  choice_id: Id, proposal_id: Id, action_request_id: Id, canonical_result_ref: Id.optional(),
}).strict();

import assert from "node:assert/strict";
import test from "node:test";
import {
  BlindInput, ResearchRevision, ToolObservation, assessResume, classifyOperation, markDispatched, reconcileOperation, LearningPromotion,
  closeWithAvailableEvidence, nextSharedStateVersion, reserveOperation,
} from "./index.ts";
import { baseTokyoResponseFixture, lodgingProposalFixture } from "../../agent-application/v1/fixtures.ts";
import { ResponseEnvelopeSchema, ResponseUnitSchema } from "../../agent-application/v1/schemas.ts";
import { projectResearchResponse, readResearchSidecar } from "../../agent-application/v1/research-compatibility.ts";

const at = "2030-01-01T00:00:00Z";
const later = "2030-01-01T00:00:10Z";
const revision = { dossier_id: "dossier", revision_id: "revision" };
const ref = { ...revision, item_id: "evidence" };
const money = (minor_units) => ({ minor_units, currency: "MXN" });
const amounts = (active_ms, calls, cost) => ({ active_ms, calls, cost: money(cost) });
const budget = {
  version: "budget-v1", authorization_ref: "grant", deadline: later,
  limit: amounts(5000, 2, 5), consumed: amounts(0, 0, 0), reservations: [],
};
const budgets = { research: budget, execution: budget };
const call = { id: "tool", kind: "tool", active_ms: 4000, timeout_ms: 4000, cost_bound: money(2), permission_verified: true };

test("DIE distinguishes partial evidence from supported conclusions", () => {
  const data = {
    ...revision, die_version: "1.0.0", producer: "researcher", recorded_at: at, reason: "initial",
    objective: { question: "Is there a lift?", category: "lodging", scope: "demo", temporal_context: "fixture" },
    subjects: [], criteria: [], questions: [],
    strategy: { question_ids: [], rationale: "Check the entrance", coverage: "one candidate", limits: [] },
    candidates: [{ id: "hotel", label: "Example", identity: { status: "unresolved" } }],
    evidence: [{
      id: "evidence", candidate_id: "hotel", origin: "source", observed_at: at, fact_at: null,
      scope: "entrance", limitations: [], freshness: { status: "bounded", until: later },
      independence: "unknown", visibility: "personal",
    }],
    claims: [{
      id: "claim", candidate_id: "hotel", producer: "researcher", statement: "There is a lift", scope: "entrance",
      essential: true, criterion_ids: [], status: "verified", explanation: "Direct observation",
      evidence: [{ evidence_id: "evidence", relation: "supports", rationale: "Entrance checked" }],
    }],
    assessments: [], dispositions: [], invalidations: [],
    recommendations: [{ id: "recommendation", outcome: "partial", candidate_id: "hotel", rationale: "Coverage limited",
      assessment_ids: [], open_question_ids: [], limitations: [] }],
  };
  ResearchRevision.parse(data);
  for (const change of [
    (x) => { x.evidence[0].freshness.until = at; },
    (x) => { x.claims[0].evidence[0].evidence_id = "missing"; },
    (x) => { x.evidence.push(x.evidence[0]); },
    (x) => { x.recommendations[0].outcome = "supported"; },
  ]) {
    const invalid = structuredClone(data);
    change(invalid);
    assert.equal(ResearchRevision.safeParse(invalid).success, false);
  }
});

test("model and tool reservations share time, cost and call limits", () => {
  const first = reserveOperation(budgets, call, at, false);
  assert.equal(first.budgets.execution.reservations[0].active_ms, 4000);
  const second = { research: first.budgets.research, execution: budget };
  const model = { ...call, id: "model", kind: "model" };
  assert.equal(reserveOperation(second, model, at, false), null);
  assert.equal(reserveOperation(second, model, at, true).budgets.execution.reservations[0].active_ms, 1000);
  assert.equal(reserveOperation(second, { ...model, cost_bound: money(4) }, at, true), null);
  assert.equal(reserveOperation(first.budgets, model, at, true), null);
  assert.throws(() => reserveOperation(budgets, { ...call, cost_bound: undefined }, at, true));
});

test("unknown cost is explicit and a timeout cannot carry verified evidence", () => {
  const observation = {
    attempt_id: "attempt", call_id: "call", capability_id: "capability", configuration_version: "cfg", interface_version: "1",
    parameter_ref: "parameters", origin_ref: "source", scope: "fixture", observed_at: at, fact_at: null,
    freshness_condition: "check source", limitations: [], revision, access: "authorized",
    outcome: "timeout", evidence: [], claims: [], cost: { status: "unknown", reason: "no receipt" },
  };
  ToolObservation.parse(observation);
  assert.equal(ToolObservation.safeParse({ ...observation, evidence: [ref] }).success, false);
});

test("resume requires explicit authority, matching versions and current dependencies", () => {
  const dep = { id: "dep", version: "one", revision, expires_at: later, access: "authorized" };
  const checkpoint = {
    hec_version: "1.0.0", id: "checkpoint", version: 1, configuration_version: "cfg", revision,
    attempt_id: "attempt", scope_ref: "scope", authority_ref: "grant", state_version: 2, paused_at: at,
    reason: "requested", pending: [], dependencies: [dep], evidence: [ref], dispositions: [], budgets,
  };
  const context = { explicit: true, authorized: true, version: 1, configuration_version: "cfg",
    state_version: 2, revision, dependencies: [dep], now: at };
  assert.equal(assessResume(checkpoint, context), "eligible");
  assert.equal(assessResume(checkpoint, { ...context, explicit: false }), "denied");
  assert.equal(assessResume(checkpoint, { ...context, now: later }), "revalidate");
  assert.equal(assessResume(checkpoint, { ...context, dependencies: [{ ...dep, access: "revoked" }] }), "revalidate");
  assert.equal(nextSharedStateVersion(2, ["private", "checkpoint"]), 2);
  assert.equal(nextSharedStateVersion(2, ["shared_material", "shared_material"]), 3);
  assert.equal(classifyOperation({ key: "key", fingerprint: "one" }, { key: "key", fingerprint: "one" }), "replay");
  assert.equal(classifyOperation({ key: "key", fingerprint: "two" }, { key: "key", fingerprint: "one" }), "conflict");
});

test("partial close returns admitted evidence or the prebuilt minimum", () => {
  const input = { revision, projectionAdmitted: true, authorizedEvidence: [ref], missing: ["availability"], cause: "deadline" };
  assert.equal(closeWithAvailableEvidence(input).kind, "partial");
  assert.deepEqual(Object.keys(closeWithAvailableEvidence({ ...input, projectionAdmitted: false })), ["kind", "message"]);
});

test("reserved contrast stays outside the blind exchange", () => {
  const versioned = { id: "artifact", version: "1" };
  const blind = { id: "blind", fixture: versioned, authorized_context_refs: [], allowed_question_refs: [], environment: versioned };
  BlindInput.parse(blind);
  assert.equal(BlindInput.safeParse({ ...blind, contrast: "sealed" }).success, false);
});

test("V1 and research producers preserve strict transport and authorize separately on read", () => {
  const transport = ResponseEnvelopeSchema.parse(baseTokyoResponseFixture);
  const allow = () => true;
  const params = { envelope: transport, evidenceNoticeSupported: true, canReadRevision: allow, canReadItem: allow };
  const sidecar = { die_version: "1.0.0", response_id: transport.response_id, revision, references: [ref] };
  assert.deepEqual(ResponseEnvelopeSchema.parse(transport), transport);
  assert.deepEqual(readResearchSidecar(transport, undefined, allow, allow), { response: transport });
  for (const capability of [undefined, { version: "future", verified: true }, { version: "1.0.0", verified: false }]) {
    assert.deepEqual(projectResearchResponse({ ...params, capability, sidecar }), { envelope: transport });
  }
  const capability = { version: "1.0.0", verified: true };
  const emitted = projectResearchResponse({ ...params, capability, sidecar });
  assert.deepEqual(emitted.research, sidecar);
  assert.deepEqual(readResearchSidecar(emitted.envelope, emitted.research, allow, allow).research, sidecar);
  assert.deepEqual(readResearchSidecar(emitted.envelope, emitted.research, allow, () => false).research.references, []);
  assert.equal(readResearchSidecar(emitted.envelope, emitted.research, () => false, allow).research, undefined);
});

test("optional unknown unit drops while its essential block stays visible", () => {
  const envelope = structuredClone(baseTokyoResponseFixture);
  envelope.units[0].confidence = 0;
  const unknown = { id: "extra", type: "research_future", schema_version: "1.0", visibility: "trip_shared", required: false, payload: {} };
  envelope.units.push(unknown);
  const params = { envelope, evidenceNoticeSupported: true, canReadRevision: () => false, canReadItem: () => false };
  const block = { noticeId: "missing", text: "Lift access still pending", visibility: "trip_shared",
    affectedActionUnitIds: [], affectedActionTypes: [] };
  const output = projectResearchResponse({ ...params, block }).envelope;
  assert.equal(output.units[0].type, "evidence_notice");
  assert.equal(output.units[1].confidence, 0);
  assert.equal(output.units.length, 3);
  output.units.forEach((unit) => ResponseUnitSchema.parse(unit));
  assert.deepEqual(projectResearchResponse({ ...params, block, evidenceNoticeSupported: false }).envelope.units.map((u) => u.type), ["message"]);
  unknown.required = true;
  assert.throws(() => projectResearchResponse(params));
  for (const confidence of [null, 1.01, -0.01]) assert.equal(ResponseUnitSchema.safeParse({ ...envelope.units[0], confidence }).success, false);
});

test("dispatched calls hold unknown charges and settle once after cessation", () => {
  const reserved = reserveOperation(budgets, call, at, false).budgets;
  const dispatched = markDispatched(reserved, call.id);
  const completion = { id: call.id, active_ms: 3000, cessation_confirmed: true };
  assert.equal(reconcileOperation(dispatched, completion).status, "held");
  assert.equal(reconcileOperation(dispatched, { ...completion, cost: money(3) }).status, "incident");
  const settled = reconcileOperation(dispatched, { ...completion, cost: money(1) });
  assert.equal(settled.status, "settled");
  assert.deepEqual(settled.budgets.research.consumed, amounts(3000, 1, 1));
  assert.equal(reconcileOperation(settled.budgets, completion).status, "missing");
});

test("promotion requires explicit authorization and a bounded destination", () => {
  const promotion = { learning_id: "learning", subject_id: "subject", actor_id: "actor", authorization_ref: "grant",
    destination: "trip_shared", destination_ref: "trip", approved_summary: "Step-free preference", recorded_at: at };
  LearningPromotion.parse(promotion);
  assert.equal(LearningPromotion.safeParse({ ...promotion, authorization_ref: undefined }).success, false);
});

test("compatibility omits affected actions without rewriting surviving proposals", () => {
  const unit = {
    id: "lodging", type: "action_proposal", schema_version: "1.0", visibility: "trip_shared",
    required: true, payload: { proposal: lodgingProposalFixture },
  };
  const envelope = { ...baseTokyoResponseFixture, units: [unit, { ...unit, id: "unaffected" }] };
  const block = { noticeId: "missing", text: "Lift access pending", visibility: "trip_shared",
    affectedActionUnitIds: [unit.id], affectedActionTypes: ["lodging.select"] };
  const output = projectResearchResponse({ envelope, evidenceNoticeSupported: true, block,
    canReadRevision: () => false, canReadItem: () => false }).envelope;
  assert.deepEqual(output.units.map(({ id }) => id), ["missing", "unaffected"]);
  assert.deepEqual(output.units[1].payload.proposal, lodgingProposalFixture);
});

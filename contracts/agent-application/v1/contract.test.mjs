import assert from "node:assert/strict";
import {
  ActionDefinitionSchema,
  ActionEnvelopeSchema,
  ActionExecutionSchema,
  ContractErrorSchema,
  ProposalSchema,
  ResponseEnvelopeSchema,
  ResponseUnitSchema,
  UNIT_SCHEMA_VERSION,
} from "./schemas.ts";
import {
  anaReferenceUnitFixture,
  baseTokyoResponseFixture,
  lodgingProposalFixture,
  recoverableToolErrorFixture,
} from "./fixtures.ts";

const response = ResponseEnvelopeSchema.parse(baseTokyoResponseFixture);
assert.equal(response.units.length, 2);

const withOptionalFutureUnit = {
  ...baseTokyoResponseFixture,
  units: [...baseTokyoResponseFixture.units, {
    id: "future", type: "future_unit", schema_version: "2.0",
    visibility: "trip_shared", required: false, payload: { future: true },
  }],
};
assert.equal(ResponseEnvelopeSchema.parse(withOptionalFutureUnit).units.length, 2);
assert.throws(() => ResponseEnvelopeSchema.parse({
  ...baseTokyoResponseFixture,
  units: [{ required: false }],
}));
assert.throws(() => ResponseEnvelopeSchema.parse({
  ...baseTokyoResponseFixture,
  units: [{
    id: "future", type: "future_unit", schema_version: "invalid",
    visibility: "trip_shared", required: false, payload: {},
  }],
}));
assert.throws(() => ResponseEnvelopeSchema.parse({
  ...baseTokyoResponseFixture,
  units: [{
    id: "future", type: "future_unit", schema_version: "2.0",
    visibility: "public", required: false, payload: {},
  }],
}));
assert.throws(() => ResponseEnvelopeSchema.parse({
  ...baseTokyoResponseFixture,
  units: [{
    id: "future", type: "future_unit", schema_version: "2.0",
    visibility: "trip_shared", required: false,
  }],
}));
assert.throws(() => ResponseEnvelopeSchema.parse({
  ...baseTokyoResponseFixture,
  units: [{
    id: "future", type: "future_unit", schema_version: "2.0",
    visibility: "trip_shared", payload: {},
  }],
}));
assert.throws(() => ResponseEnvelopeSchema.parse({
  ...baseTokyoResponseFixture,
  units: [{ id: "bad", type: "action_proposal", schema_version: UNIT_SCHEMA_VERSION, visibility: "trip_shared", required: false, payload: {} }],
}));
assert.throws(() => ResponseEnvelopeSchema.parse({
  ...baseTokyoResponseFixture,
  units: [{ ...anaReferenceUnitFixture, schema_version: "2.0", required: false }],
}));
assert.throws(() => ResponseEnvelopeSchema.parse({
  ...baseTokyoResponseFixture,
  units: [{ id: "future", type: "future_unit", required: true }],
}));

const proposal = ProposalSchema.parse(lodgingProposalFixture);
assert.equal(proposal.action.action_type, "lodging.select");
assert.throws(() => ActionDefinitionSchema.parse({ ...proposal.action, payload: {} }));
assert.throws(() => ActionDefinitionSchema.parse({
  ...proposal.action,
  payload: { place_id: "place_kiyosumi", start_date: "2027-02-14", end_date: "2027-02-01" },
}));
for (const invalidRange of [
  { start_date: "2027-02-30", end_date: "2027-03-01" },
  { start_date: "2027-13-01", end_date: "2028-01-01" },
  { start_date: "2027-02-29", end_date: "2027-03-01" },
]) {
  assert.throws(() => ActionDefinitionSchema.parse({
    ...proposal.action,
    payload: { place_id: "place_kiyosumi", ...invalidRange },
    expected_effects: [{
      kind: "lodging_selection_created", place_id: "place_kiyosumi", ...invalidRange,
    }],
  }));
}
const leapYearRange = { start_date: "2028-02-29", end_date: "2028-03-01" };
assert.equal(ActionDefinitionSchema.parse({
  ...proposal.action,
  payload: { place_id: "place_kiyosumi", ...leapYearRange },
  expected_effects: [{
    kind: "lodging_selection_created", place_id: "place_kiyosumi", ...leapYearRange,
  }],
}).payload.start_date, "2028-02-29");
assert.throws(() => ActionDefinitionSchema.parse({
  ...proposal.action,
  expected_effects: [{ ...proposal.action.expected_effects[0], place_id: "place_other" }],
}));
assert.throws(() => ActionDefinitionSchema.parse({
  ...proposal.action,
  action_type: "plan.apply_proposal",
  scope: "trip_shared",
  payload: {},
  expected_effects: [{ kind: "plan_items_applied", plan_proposal_id: "plan_1" }],
}));
const planAction = ActionDefinitionSchema.parse({
  action_type: "plan.apply_proposal",
  action_version: "1.0",
  scope: "trip_shared",
  affected_person_ids: ["person_jhoset", "person_carms"],
  payload: { plan_proposal_id: "plan_ginza_1" },
  preconditions: [{ kind: "plan_version", value: "plan-v2" }],
  expected_effects: [{ kind: "plan_items_applied", plan_proposal_id: "plan_ginza_1" }],
});
assert.equal(planAction.payload.plan_proposal_id, "plan_ginza_1");
assert.throws(() => ActionDefinitionSchema.parse({
  ...planAction,
  expected_effects: [{ kind: "plan_items_applied", plan_proposal_id: "plan_other" }],
}));

const action = ActionEnvelopeSchema.parse({
  ...proposal.action,
  action_id: "act_lodging_1",
  trip_id: "trip_tokyo",
  actor_id: "person_jhoset",
  proposal_id: proposal.proposal_id,
  idempotency_key: proposal.idempotency_key,
  requested_at: "2026-10-24T18:05:00.000Z",
});
assert.equal(action.idempotency_key, proposal.idempotency_key);

const stale = ActionExecutionSchema.parse({
  action_id: action.action_id,
  status: "failed",
  canonical_changes: [],
  error: { code: "stale_proposal", message: "El viaje cambió.", retryable: false },
});
assert.equal(stale.canonical_changes.length, 0);
assert.throws(() => ActionExecutionSchema.parse({
  ...stale,
  canonical_changes: [{ kind: "lodging_changed" }],
}));
assert.throws(() => ActionExecutionSchema.parse({
  action_id: action.action_id,
  status: "succeeded",
  canonical_changes: [],
  resulting_state_version: "trip-v4",
  error: recoverableToolErrorFixture,
}));
assert.throws(() => ActionExecutionSchema.parse({ action_id: "act_bad", status: "uncertain", canonical_changes: [] }));

const anaReference = ResponseUnitSchema.parse(anaReferenceUnitFixture);
assert.equal(anaReference.payload.contributed_by_person_id, "person_ana");
assert.equal(anaReference.source_refs[0].contributed_by_person_id, "person_ana");
assert.throws(() => ResponseUnitSchema.parse({
  ...anaReferenceUnitFixture,
  source_refs: [{ id: "source_missing_author", kind: "user_reference", label: "Sin autora" }],
}));
assert.throws(() => ResponseUnitSchema.parse({
  ...anaReferenceUnitFixture,
  payload: { ...anaReferenceUnitFixture.payload, contributed_by_person_id: "person_jhoset" },
}));
const jhosetSourceRef = {
  id: "source_jhoset_blog", kind: "user_reference", label: "Blog compartido por Jhoset",
  contributed_by_person_id: "person_jhoset", url: "https://example.com/jhoset-tokyo",
};
assert.throws(() => ResponseUnitSchema.parse({
  ...anaReferenceUnitFixture,
  source_refs: [...anaReferenceUnitFixture.source_refs, jhosetSourceRef],
  payload: {
    ...anaReferenceUnitFixture.payload,
    source_ref_ids: [anaReferenceUnitFixture.source_refs[0].id, jhosetSourceRef.id],
  },
}));
assert.throws(() => ResponseUnitSchema.parse({
  ...anaReferenceUnitFixture,
  payload: { ...anaReferenceUnitFixture.payload, source_ref_ids: ["source_missing"] },
}));
const duplicateJhosetSourceRef = {
  ...anaReferenceUnitFixture.source_refs[0],
  label: "Fuente duplicada de Jhoset",
  contributed_by_person_id: "person_jhoset",
};
const expectedDuplicateIssues = [{
  path: ["source_refs", 1, "id"],
  message: "source_ref.id must be unique within the unit",
}];
const duplicateIssues = (source_refs) => {
  const parsed = ResponseUnitSchema.safeParse({
    ...anaReferenceUnitFixture,
    source_refs,
    payload: { ...anaReferenceUnitFixture.payload, contributed_by_person_id: "person_jhoset" },
  });
  assert.equal(parsed.success, false);
  return parsed.error.issues.map(({ path, message }) => ({ path, message }));
};
for (const source_refs of [
  [anaReferenceUnitFixture.source_refs[0], duplicateJhosetSourceRef],
  [duplicateJhosetSourceRef, anaReferenceUnitFixture.source_refs[0]],
]) {
  assert.deepEqual(duplicateIssues(source_refs), expectedDuplicateIssues);
}
assert.deepEqual(
  duplicateIssues([
    anaReferenceUnitFixture.source_refs[0],
    { ...anaReferenceUnitFixture.source_refs[0], label: "Misma fuente repetida" },
  ]),
  expectedDuplicateIssues,
);

assert.equal(ContractErrorSchema.parse(recoverableToolErrorFixture).retryable, true);
console.log("PASS contrato V1 R4: duplicados cortan procedencia sin regresiones");

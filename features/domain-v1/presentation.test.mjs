import assert from "node:assert/strict";
import {
  anaReferenceUnitFixture,
  baseTokyoResponseFixture,
  lodgingProposalFixture,
} from "../../contracts/agent-application/v1/fixtures.ts";
import {
  ResponseEnvelopeSchema,
  ResponseUnitSchema,
  UNIT_SCHEMA_VERSION,
} from "../../contracts/agent-application/v1/schemas.ts";
import { toResponseViewModel, toUnitViewModel } from "./presentation.ts";

const clone = (value) => structuredClone(value);
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
};

const tokyoViewModel = toResponseViewModel(baseTokyoResponseFixture);
assert.deepEqual(
  tokyoViewModel.units.map(({ id, type }) => ({ id, type })),
  [
    { id: "unit_summary_1", type: "context_summary" },
    { id: "unit_question_1", type: "structured_question" },
  ],
);

const copyOnlyEnvelope = clone(baseTokyoResponseFixture);
copyOnlyEnvelope.units[0].payload.summary = "Aplicar, guardar y confirmar todo ahora";
copyOnlyEnvelope.units[1].payload.prompt = "¿Quieres ejecutar el cambio?";
copyOnlyEnvelope.units[1].payload.options[0].label = "Aplicar plan";
copyOnlyEnvelope.units[1].payload.options[1].label = "Elegir alojamiento";
const copyOnlyViewModel = toResponseViewModel(copyOnlyEnvelope);
assert.deepEqual(
  copyOnlyViewModel.units.map((unit) => unit.available_actions),
  [undefined, undefined],
);

const messageWithStructuredAction = {
  id: "unit_action_message",
  type: "message",
  schema_version: UNIT_SCHEMA_VERSION,
  visibility: "trip_shared",
  required: true,
  payload: { text: "Este texto no define la acción.", author: "gustave" },
  available_actions: [{
    action_type: "plan.apply_proposal",
    label: "Aplicar propuesta",
    requires_confirmation: true,
  }],
};
const actionDescriptor = toUnitViewModel(ResponseUnitSchema.parse(messageWithStructuredAction));
assert.deepEqual(actionDescriptor.available_actions, [{
  action_type: "plan.apply_proposal",
  label: "Aplicar propuesta",
  requires_confirmation: true,
}]);
assert.deepEqual(Object.keys(actionDescriptor.available_actions[0]).sort(), [
  "action_type",
  "label",
  "requires_confirmation",
]);
const rewrittenActionMessage = toUnitViewModel(ResponseUnitSchema.parse({
  ...messageWithStructuredAction,
  payload: { text: "Guardar hotel, descartar plan o cualquier otra frase.", author: "gustave" },
}));
assert.deepEqual(rewrittenActionMessage.available_actions, actionDescriptor.available_actions);

const proposalUnit = ResponseUnitSchema.parse({
  id: "unit_lodging_proposal",
  type: "action_proposal",
  schema_version: UNIT_SCHEMA_VERSION,
  visibility: "trip_shared",
  required: true,
  payload: { proposal: lodgingProposalFixture },
});
const proposalViewModel = toUnitViewModel(proposalUnit);
assert.deepEqual(proposalViewModel.payload.proposal, proposalUnit.payload.proposal);
assert.deepEqual(proposalViewModel.payload.proposal.action.payload, lodgingProposalFixture.action.payload);
assert.deepEqual(proposalViewModel.payload.proposal.action.preconditions, lodgingProposalFixture.action.preconditions);
assert.deepEqual(proposalViewModel.payload.proposal.action.expected_effects, lodgingProposalFixture.action.expected_effects);
assert.equal(proposalViewModel.payload.proposal.required_role, lodgingProposalFixture.required_role);
assert.equal(proposalViewModel.payload.proposal.idempotency_key, lodgingProposalFixture.idempotency_key);

const successfulResult = ResponseUnitSchema.parse({
  id: "unit_action_success",
  type: "action_result",
  schema_version: UNIT_SCHEMA_VERSION,
  visibility: "trip_shared",
  required: true,
  payload: {
    execution: {
      action_id: "action_apply_1",
      status: "succeeded",
      canonical_changes: [{ kind: "plan_item_added", plan_item_id: "item_1", order: 0 }],
      resulting_state_version: "plan-v3",
    },
  },
});
const failedResult = ResponseUnitSchema.parse({
  id: "unit_action_failure",
  type: "action_result",
  schema_version: UNIT_SCHEMA_VERSION,
  visibility: "trip_shared",
  required: true,
  payload: {
    execution: {
      action_id: "action_apply_2",
      status: "failed",
      canonical_changes: [],
      error: {
        code: "stale_proposal",
        message: "El plan cambió.",
        retryable: false,
        safe_context: { current_plan_version: "plan-v4" },
      },
    },
  },
});
assert.deepEqual(
  toUnitViewModel(successfulResult).payload.execution,
  successfulResult.payload.execution,
);
assert.deepEqual(
  toUnitViewModel(failedResult).payload.execution,
  failedResult.payload.execution,
);

const anaReference = ResponseUnitSchema.parse(anaReferenceUnitFixture);
const anaReferenceViewModel = toUnitViewModel(anaReference);
assert.equal(anaReferenceViewModel.payload.contributed_by_person_id, "person_ana");
assert.deepEqual(anaReferenceViewModel.payload.source_ref_ids, ["source_ana_tiktok"]);
assert.deepEqual(anaReferenceViewModel.source_refs, anaReference.source_refs);

const withFutureOptionalUnit = {
  ...clone(baseTokyoResponseFixture),
  units: [
    clone(baseTokyoResponseFixture.units[0]),
    {
      id: "unit_future_optional",
      type: "future_panel",
      schema_version: "2.0",
      visibility: "trip_shared",
      required: false,
      payload: { executable_hint: "must remain opaque" },
    },
    clone(baseTokyoResponseFixture.units[1]),
  ],
};
assert.deepEqual(
  toResponseViewModel(withFutureOptionalUnit).units.map((unit) => unit.id),
  ["unit_summary_1", "unit_question_1"],
);
assert.throws(() => toResponseViewModel({
  ...clone(baseTokyoResponseFixture),
  units: [{
    id: "unit_future_required",
    type: "future_panel",
    schema_version: "2.0",
    visibility: "trip_shared",
    required: true,
    payload: {},
  }],
}));
assert.throws(() => toResponseViewModel({
  ...clone(baseTokyoResponseFixture),
  units: [{
    id: "unit_known_incompatible",
    type: "action_proposal",
    schema_version: UNIT_SCHEMA_VERSION,
    visibility: "trip_shared",
    required: false,
    payload: {},
  }],
}));

const opaquePayloads = [
  { type: "comparison", payload: { nested: { arbitrary: ["value"] } } },
  { type: "conflict_summary", payload: { decisions: { unknown: true } } },
  { type: "orientation", payload: { hints: [{ at: "now" }] } },
];
for (const [index, opaque] of opaquePayloads.entries()) {
  const parsed = ResponseUnitSchema.parse({
    id: `unit_opaque_${index}`,
    type: opaque.type,
    schema_version: UNIT_SCHEMA_VERSION,
    visibility: "trip_shared",
    required: true,
    payload: opaque.payload,
  });
  assert.deepEqual(toUnitViewModel(parsed).payload, opaque.payload);
}

const frozenInput = deepFreeze(clone(withFutureOptionalUnit));
const before = JSON.stringify(frozenInput);
const frozenViewModel = toResponseViewModel(frozenInput);
assert.equal(JSON.stringify(frozenInput), before);
assert.deepEqual(
  frozenViewModel.units.map((unit) => unit.id),
  ["unit_summary_1", "unit_question_1"],
);
assert.notEqual(frozenViewModel.units[0].payload, frozenInput.units[0].payload);
assert.deepEqual(
  ResponseEnvelopeSchema.parse(frozenInput).units.map((unit) => unit.id),
  frozenViewModel.units.map((unit) => unit.id),
);

console.log("PASS domain-v1 presentation adapters");

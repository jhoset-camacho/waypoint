import assert from "node:assert/strict";
import {
  ActionEnvelopeSchema,
  ActionExecutionSchema,
  ContractErrorSchema,
  ProposalSchema,
  ResponseEnvelopeSchema,
} from "./schemas.ts";
import {
  baseTokyoResponseFixture,
  lodgingProposalFixture,
  recoverableToolErrorFixture,
} from "./fixtures.ts";

const response = ResponseEnvelopeSchema.parse(baseTokyoResponseFixture);
assert.equal(response.units.length, 2);
assert.equal(response.units[0].type, "context_summary");

const withOptionalFutureUnit = {
  ...baseTokyoResponseFixture,
  units: [...baseTokyoResponseFixture.units, { id: "future", type: "future_unit", required: false }],
};
assert.equal(ResponseEnvelopeSchema.parse(withOptionalFutureUnit).units.length, 2);

assert.throws(() => ResponseEnvelopeSchema.parse({
  ...baseTokyoResponseFixture,
  units: [{ id: "future", type: "future_unit", required: true }],
}));

const proposal = ProposalSchema.parse(lodgingProposalFixture);
assert.equal(proposal.action.action_type, "lodging.select");
assert.deepEqual(proposal.action.payload, {
  place_id: "place_kiyosumi",
  start_date: "2027-02-01",
  end_date: "2027-02-14",
});

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
  error: {
    code: "stale_proposal",
    message: "El viaje cambió después de mostrar la propuesta.",
    retryable: false,
    safe_context: { current_version: "trip-v4" },
  },
});
assert.equal(stale.canonical_changes.length, 0);
assert.equal(stale.error.code, "stale_proposal");

assert.equal(ContractErrorSchema.parse(recoverableToolErrorFixture).retryable, true);
assert.throws(() => ActionExecutionSchema.parse({ action_id: "act_bad", status: "uncertain" }));

console.log("PASS contrato V1: envelope, compatibilidad, propuesta exacta, stale y error recuperable");


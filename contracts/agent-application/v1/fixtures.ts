import { CONTRACT_VERSION, UNIT_SCHEMA_VERSION } from "./schemas.ts";

export const baseTokyoResponseFixture = {
  contract_version: CONTRACT_VERSION,
  response_id: "resp_tokyo_base_1",
  trip_id: "trip_tokyo",
  conversation_space_id: "conv_tokyo_group",
  in_reply_to_message_id: "msg_101",
  context_trace_id: "ctx_101",
  created_at: "2026-10-24T18:00:00.000Z",
  units: [
    {
      id: "unit_summary_1",
      type: "context_summary",
      schema_version: UNIT_SCHEMA_VERSION,
      visibility: "trip_shared",
      required: true,
      payload: {
        summary: "Buscan una base tranquila en Tokio, cerca de un parque y comercio, compatible con la siesta de Lucian.",
        claim_ids: ["claim_park", "claim_calm", "claim_commerce"],
      },
    },
    {
      id: "unit_question_1",
      type: "structured_question",
      schema_version: UNIT_SCHEMA_VERSION,
      visibility: "trip_shared",
      required: true,
      payload: {
        question_id: "question_park_distance",
        prompt: "¿Qué pesa más para esta base?",
        selection_mode: "single",
        options: [
          { id: "opt_walk", label: "Parque caminable" },
          { id: "opt_room", label: "Habitación amplia" },
          { id: "opt_transit", label: "Mejor conexión" },
        ],
      },
    },
  ],
} as const;

export const lodgingProposalFixture = {
  proposal_id: "proposal_lodging_1",
  status: "proposed",
  proposed_by: "person_jhoset",
  required_role: "organizer",
  idempotency_key: "lodging:trip_tokyo:2027-02-01:2027-02-14:place_kiyosumi",
  expires_at: "2026-10-25T18:00:00.000Z",
  action: {
    action_type: "lodging.select",
    action_version: "1.0",
    scope: "structural",
    affected_person_ids: ["person_jhoset", "person_carms", "person_lucian"],
    payload: { place_id: "place_kiyosumi", start_date: "2027-02-01", end_date: "2027-02-14" },
    preconditions: [{ kind: "trip_version", value: "trip-v3" }],
    expected_effects: [{ kind: "lodging_selection_created", place_id: "place_kiyosumi" }],
  },
} as const;

export const recoverableToolErrorFixture = {
  code: "tool_failed",
  message: "No pude confirmar el horario de la tienda.",
  retryable: true,
  safe_context: { reference_id: "ref_ginza_shop" },
} as const;

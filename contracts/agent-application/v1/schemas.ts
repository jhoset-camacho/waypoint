import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0" as const;
export const UNIT_SCHEMA_VERSION = "1.0" as const;

const id = z.string().min(1).max(160);
const isoDateTime = z.string().datetime({ offset: true });
const jsonObject = z.record(z.string(), z.unknown());

export const VisibilitySchema = z.enum(["personal", "subgroup", "trip_shared"]);
export const ScopeSchema = z.enum(["personal", "subgroup", "trip_shared", "structural"]);
export const RoleSchema = z.enum(["organizer", "participant", "viewer"]);
export const ConfidenceSchema = z.number().min(0).max(1);

export const ActionTypeSchema = z.enum([
  "structured_answer.record",
  "place.save_to_lists",
  "place.remove_from_lists",
  "intention.record",
  "message.pin",
  "message.unpin",
  "profile_memory.confirm",
  "profile_memory.correct",
  "profile_memory.reject",
  "profile_memory.delete",
  "profile_ai_settings.update",
  "trip.update",
  "membership.invite",
  "membership.set_role",
  "reference.share_to_trip",
  "trip_place.dismiss",
  "trip_place.restore",
  "lodging.select",
  "lodging.replace",
  "lodging.remove",
  "plan.apply_proposal",
  "plan_item.add",
  "plan_item.move",
  "plan_item.remove",
  "plan_item.complete",
  "plan_item.reopen",
  "plan_item_note.upsert",
  "plan_leg.set_mode",
]);

export const ErrorCodeSchema = z.enum([
  "not_found",
  "uncertain",
  "permission_denied",
  "precondition_failed",
  "stale_proposal",
  "tool_failed",
  "execution_uncertain",
  "conflict",
  "sensitive_input_unsupported",
]);

export const ContractErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  safe_context: jsonObject.optional(),
});

export const SourceRefSchema = z.object({
  id,
  kind: z.enum(["official", "structured", "community", "user_reference", "system"]),
  label: z.string().min(1),
  url: z.string().url().optional(),
  retrieved_at: isoDateTime.optional(),
  valid_until: isoDateTime.optional(),
});

export const AvailableActionSchema = z.object({
  action_type: ActionTypeSchema,
  label: z.string().min(1),
  requires_confirmation: z.boolean().default(true),
});

export const ActionDefinitionSchema = z.object({
  action_type: ActionTypeSchema,
  action_version: z.literal("1.0"),
  scope: ScopeSchema,
  affected_person_ids: z.array(id),
  payload: jsonObject,
  preconditions: z.array(jsonObject),
  expected_effects: z.array(jsonObject).min(1),
});

export const ProposalSchema = z.object({
  proposal_id: id,
  status: z.enum([
    "proposed",
    "approved",
    "applied",
    "dismissed",
    "rejected",
    "failed",
    "stale",
    "cancelled",
    "reverted",
  ]),
  proposed_by: id,
  required_role: RoleSchema,
  idempotency_key: z.string().min(8).max(200),
  expires_at: isoDateTime.optional(),
  action: ActionDefinitionSchema,
});

export const ActionEnvelopeSchema = ActionDefinitionSchema.extend({
  action_id: id,
  trip_id: id,
  actor_id: id,
  proposal_id: id.optional(),
  idempotency_key: z.string().min(8).max(200),
  requested_at: isoDateTime,
});

export const ActionExecutionSchema = z.object({
  action_id: id,
  status: z.enum(["ready", "running", "succeeded", "failed", "uncertain", "reverted"]),
  canonical_changes: z.array(jsonObject).default([]),
  resulting_state_version: z.string().min(1).optional(),
  error: ContractErrorSchema.optional(),
}).superRefine((value, ctx) => {
  if (["failed", "uncertain"].includes(value.status) && !value.error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "failed/uncertain requires error" });
  }
});

const PlaceSchema = z.object({
  place_id: id,
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().optional(),
});

const UnitBaseSchema = z.object({
  id,
  schema_version: z.literal(UNIT_SCHEMA_VERSION),
  visibility: VisibilitySchema,
  required: z.boolean().default(true),
  source_refs: z.array(SourceRefSchema).optional(),
  confidence: ConfidenceSchema.optional(),
  available_actions: z.array(AvailableActionSchema).optional(),
});

const genericPayload = z.object({ payload: jsonObject });
const unit = <T extends z.ZodTypeAny>(type: string, payload: T) =>
  UnitBaseSchema.extend({ type: z.literal(type), payload });

export const ResponseUnitSchema = z.discriminatedUnion("type", [
  unit("message", z.object({ text: z.string().min(1), author: z.enum(["gustave", "person"]), person_id: id.optional() })),
  unit("structured_question", z.object({
    question_id: id,
    prompt: z.string().min(1),
    selection_mode: z.enum(["single", "multiple", "range"]),
    options: z.array(z.object({ id, label: z.string().min(1), description: z.string().optional() })).optional(),
  })),
  unit("context_summary", z.object({ summary: z.string().min(1), claim_ids: z.array(id) })),
  unit("place_collection", z.object({ title: z.string().min(1), places: z.array(PlaceSchema).min(1) })),
  unit("comparison", genericPayload.shape.payload),
  unit("evidence_notice", z.object({ text: z.string().min(1), severity: z.enum(["info", "warning", "critical"]) })),
  unit("reference_result", genericPayload.shape.payload),
  unit("conflict_summary", genericPayload.shape.payload),
  unit("action_proposal", z.object({ proposal: ProposalSchema })),
  unit("action_result", z.object({ execution: ActionExecutionSchema })),
  unit("orientation", genericPayload.shape.payload),
]);

const RawResponseEnvelopeSchema = z.object({
  contract_version: z.literal(CONTRACT_VERSION),
  response_id: id,
  trip_id: id,
  conversation_space_id: id,
  in_reply_to_message_id: id,
  units: z.array(z.unknown()),
  context_trace_id: id,
  created_at: isoDateTime,
});

export const ResponseEnvelopeSchema = RawResponseEnvelopeSchema.transform((envelope, ctx) => {
  const units: Array<z.infer<typeof ResponseUnitSchema>> = [];
  for (const rawUnit of envelope.units) {
    const parsed = ResponseUnitSchema.safeParse(rawUnit);
    if (parsed.success) {
      units.push(parsed.data);
      continue;
    }
    const optionalUnknown = typeof rawUnit === "object" && rawUnit !== null && "required" in rawUnit && rawUnit.required === false;
    if (!optionalUnknown) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unknown or incompatible required unit" });
      return z.NEVER;
    }
  }
  return { ...envelope, units };
});

export type ResponseEnvelope = z.infer<typeof ResponseEnvelopeSchema>;
export type ResponseUnit = z.infer<typeof ResponseUnitSchema>;
export type ActionEnvelope = z.infer<typeof ActionEnvelopeSchema>;


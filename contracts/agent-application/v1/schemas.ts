import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0" as const;
export const UNIT_SCHEMA_VERSION = "1.0" as const;

const id = z.string().min(1).max(160);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}, "Invalid calendar date");
const isoDateTime = z.string().datetime({ offset: true });
const jsonObject = z.record(z.string(), z.unknown());

export const VisibilitySchema = z.enum(["personal", "subgroup", "trip_shared"]);
export const ScopeSchema = z.enum(["personal", "subgroup", "trip_shared", "structural"]);
export const RoleSchema = z.enum(["organizer", "participant", "viewer"]);
export const ConfidenceSchema = z.number().min(0).max(1);

export const ActionTypeSchema = z.enum([
  "structured_answer.record", "place.save_to_lists", "place.remove_from_lists", "intention.record",
  "message.pin", "message.unpin", "profile_memory.confirm", "profile_memory.correct",
  "profile_memory.reject", "profile_memory.delete", "profile_ai_settings.update", "trip.update",
  "membership.invite", "membership.set_role", "reference.share_to_trip", "trip_place.dismiss",
  "trip_place.restore", "lodging.select", "lodging.replace", "lodging.remove", "plan.apply_proposal",
  "plan_item.add", "plan_item.move", "plan_item.remove", "plan_item.complete", "plan_item.reopen",
  "plan_item_note.upsert", "plan_leg.set_mode",
]);

export const ErrorCodeSchema = z.enum([
  "not_found", "uncertain", "permission_denied", "precondition_failed", "stale_proposal",
  "tool_failed", "execution_uncertain", "conflict", "sensitive_input_unsupported",
]);

export const ContractErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  safe_context: jsonObject.optional(),
}).strict();

const ExternalSourceRefSchema = z.object({
  id,
  kind: z.enum(["official", "structured", "community", "system"]),
  label: z.string().min(1),
  url: z.string().url().optional(),
  retrieved_at: isoDateTime.optional(),
  valid_until: isoDateTime.optional(),
}).strict();

const UserSourceRefSchema = z.object({
  id,
  kind: z.literal("user_reference"),
  label: z.string().min(1),
  contributed_by_person_id: id,
  url: z.string().url().optional(),
  retrieved_at: isoDateTime.optional(),
}).strict();

export const SourceRefSchema = z.discriminatedUnion("kind", [ExternalSourceRefSchema, UserSourceRefSchema]);

export const AvailableActionSchema = z.object({
  action_type: ActionTypeSchema,
  label: z.string().min(1),
  requires_confirmation: z.boolean().default(true),
}).strict();

const TripVersionPreconditionSchema = z.object({ kind: z.literal("trip_version"), value: z.string().min(1) }).strict();
const PlanVersionPreconditionSchema = z.object({ kind: z.literal("plan_version"), value: z.string().min(1) }).strict();
const GenericPreconditionSchema = z.object({ kind: z.string().min(1), value: z.unknown() }).strict();
const PreconditionsSchema = z.array(z.union([
  TripVersionPreconditionSchema,
  PlanVersionPreconditionSchema,
  GenericPreconditionSchema,
]));

const ActionBase = {
  action_version: z.literal("1.0"),
  scope: ScopeSchema,
  affected_person_ids: z.array(id),
};

const LodgingSelectActionSchema = z.object({
  action_type: z.literal("lodging.select"),
  ...ActionBase,
  scope: z.literal("structural"),
  payload: z.object({ place_id: id, start_date: isoDate, end_date: isoDate }).strict(),
  preconditions: PreconditionsSchema.min(1),
  expected_effects: z.array(z.object({
    kind: z.literal("lodging_selection_created"),
    place_id: id,
    start_date: isoDate,
    end_date: isoDate,
  }).strict()).length(1),
}).strict().superRefine((action, ctx) => {
  const effect = action.expected_effects[0];
  if (action.payload.start_date >= action.payload.end_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payload", "end_date"], message: "end_date must be after start_date" });
  }
  if (effect.place_id !== action.payload.place_id || effect.start_date !== action.payload.start_date || effect.end_date !== action.payload.end_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expected_effects"], message: "effect must exactly match lodging payload" });
  }
});

const PlanApplyProposalActionSchema = z.object({
  action_type: z.literal("plan.apply_proposal"),
  ...ActionBase,
  scope: z.literal("trip_shared"),
  payload: z.object({ plan_proposal_id: id }).strict(),
  preconditions: z.array(z.union([TripVersionPreconditionSchema, PlanVersionPreconditionSchema])).min(1),
  expected_effects: z.array(z.object({
    kind: z.literal("plan_items_applied"),
    plan_proposal_id: id,
  }).strict()).length(1),
}).strict().superRefine((action, ctx) => {
  if (action.expected_effects[0].plan_proposal_id !== action.payload.plan_proposal_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expected_effects"], message: "effect must match plan proposal" });
  }
});

const GenericActionSchema = z.object({
  action_type: ActionTypeSchema.exclude(["lodging.select", "plan.apply_proposal"]),
  ...ActionBase,
  payload: jsonObject,
  preconditions: PreconditionsSchema,
  expected_effects: z.array(jsonObject).min(1),
}).strict();

export const ActionDefinitionSchema = z.union([
  LodgingSelectActionSchema,
  PlanApplyProposalActionSchema,
  GenericActionSchema,
]);

export const ProposalSchema = z.object({
  proposal_id: id,
  status: z.enum(["proposed", "approved", "applied", "dismissed", "rejected", "failed", "stale", "cancelled", "reverted"]),
  proposed_by: id,
  required_role: RoleSchema,
  idempotency_key: z.string().min(8).max(200),
  expires_at: isoDateTime.optional(),
  action: ActionDefinitionSchema,
}).strict();

export const ActionEnvelopeSchema = z.object({
  action_id: id,
  trip_id: id,
  actor_id: id,
  proposal_id: id.optional(),
  idempotency_key: z.string().min(8).max(200),
  requested_at: isoDateTime,
  action_type: ActionTypeSchema,
  action_version: z.literal("1.0"),
  scope: ScopeSchema,
  affected_person_ids: z.array(id),
  payload: jsonObject,
  preconditions: z.array(jsonObject),
  expected_effects: z.array(jsonObject),
}).strict().superRefine((envelope, ctx) => {
  const parsed = ActionDefinitionSchema.safeParse({
    action_type: envelope.action_type,
    action_version: envelope.action_version,
    scope: envelope.scope,
    affected_person_ids: envelope.affected_person_ids,
    payload: envelope.payload,
    preconditions: envelope.preconditions,
    expected_effects: envelope.expected_effects,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ ...issue, path: issue.path });
    }
  }
});

const ExecutionBase = { action_id: id, canonical_changes: z.array(jsonObject) };
const PendingExecutionSchema = z.object({
  ...ExecutionBase,
  status: z.enum(["ready", "running"]),
  canonical_changes: z.array(jsonObject).max(0).default([]),
}).strict();
const SucceededExecutionSchema = z.object({
  ...ExecutionBase,
  status: z.literal("succeeded"),
  resulting_state_version: z.string().min(1),
}).strict();
const FailedExecutionSchema = z.object({
  ...ExecutionBase,
  status: z.literal("failed"),
  canonical_changes: z.array(jsonObject).max(0).default([]),
  error: ContractErrorSchema,
}).strict();
const UncertainExecutionSchema = z.object({
  ...ExecutionBase,
  status: z.literal("uncertain"),
  canonical_changes: z.array(jsonObject).max(0).default([]),
  error: ContractErrorSchema.extend({ code: z.literal("execution_uncertain") }),
}).strict();
const RevertedExecutionSchema = z.object({
  ...ExecutionBase,
  status: z.literal("reverted"),
  canonical_changes: z.array(jsonObject).min(1),
  resulting_state_version: z.string().min(1),
}).strict();

export const ActionExecutionSchema = z.discriminatedUnion("status", [
  PendingExecutionSchema,
  SucceededExecutionSchema,
  FailedExecutionSchema,
  UncertainExecutionSchema,
  RevertedExecutionSchema,
]);

const PlaceSchema = z.object({
  place_id: id,
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().optional(),
}).strict();

const UnitBaseFields = {
  id,
  visibility: VisibilitySchema,
  required: z.boolean().default(true),
  source_refs: z.array(SourceRefSchema).optional(),
  confidence: ConfidenceSchema.optional(),
  available_actions: z.array(AvailableActionSchema).optional(),
};
const UnitBaseSchema = z.object({
  ...UnitBaseFields,
  schema_version: z.literal(UNIT_SCHEMA_VERSION),
});
const CompatibleUnitBaseSchema = z.object({
  id,
  type: id,
  schema_version: z.string().regex(/^\d+\.\d+$/),
  visibility: VisibilitySchema,
  required: z.boolean(),
  payload: z.unknown(),
}).passthrough().superRefine((value, ctx) => {
  if (!Object.prototype.hasOwnProperty.call(value, "payload")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payload"], message: "payload is required" });
  }
});
const unit = <T extends z.ZodTypeAny>(type: string, payload: T) => UnitBaseSchema.extend({ type: z.literal(type), payload }).strict();

const ReferenceResultPayloadSchema = z.object({
  reference_id: id,
  contributed_by_person_id: id,
  status: z.enum(["resolved", "partial", "failed"]),
  source_ref_ids: z.array(id).min(1),
  resolved_place_ids: z.array(id).default([]),
}).strict();

const ResponseUnitDiscriminatedUnion = z.discriminatedUnion("type", [
  unit("message", z.object({ text: z.string().min(1), author: z.enum(["gustave", "person"]), person_id: id.optional() }).strict()),
  unit("structured_question", z.object({
    question_id: id,
    prompt: z.string().min(1),
    selection_mode: z.enum(["single", "multiple", "range"]),
    options: z.array(z.object({ id, label: z.string().min(1), description: z.string().optional() }).strict()).optional(),
  }).strict()),
  unit("context_summary", z.object({ summary: z.string().min(1), claim_ids: z.array(id) }).strict()),
  unit("place_collection", z.object({ title: z.string().min(1), places: z.array(PlaceSchema).min(1) }).strict()),
  unit("comparison", jsonObject),
  unit("evidence_notice", z.object({ text: z.string().min(1), severity: z.enum(["info", "warning", "critical"]) }).strict()),
  unit("reference_result", ReferenceResultPayloadSchema),
  unit("conflict_summary", jsonObject),
  unit("action_proposal", z.object({ proposal: ProposalSchema }).strict()),
  unit("action_result", z.object({ execution: ActionExecutionSchema }).strict()),
  unit("orientation", jsonObject),
]);

export const ResponseUnitSchema = ResponseUnitDiscriminatedUnion.superRefine((responseUnit, ctx) => {
  if (responseUnit.type !== "reference_result") return;

  const payload = ReferenceResultPayloadSchema.safeParse(responseUnit.payload);
  if (!payload.success) return;
  const sourceRefsById = new Map(responseUnit.source_refs?.map((sourceRef) => [sourceRef.id, sourceRef]) ?? []);
  for (const [index, sourceRefId] of payload.data.source_ref_ids.entries()) {
    const sourceRef = sourceRefsById.get(sourceRefId);
    if (!sourceRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "source_ref_ids", index],
        message: "source_ref_id must identify a present source_ref",
      });
      continue;
    }
    if (sourceRef.kind === "user_reference" && sourceRef.contributed_by_person_id !== payload.data.contributed_by_person_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "contributed_by_person_id"],
        message: "reference result contributor must match its user source references",
      });
    }
  }
});

const KNOWN_UNIT_TYPES = new Set(ResponseUnitDiscriminatedUnion.options.map((option) => option.shape.type.value));
const RawResponseEnvelopeSchema = z.object({
  contract_version: z.literal(CONTRACT_VERSION),
  response_id: id,
  trip_id: id,
  conversation_space_id: id,
  in_reply_to_message_id: id,
  units: z.array(z.unknown()),
  context_trace_id: id,
  created_at: isoDateTime,
}).strict();

export const ResponseEnvelopeSchema = RawResponseEnvelopeSchema.transform((envelope, ctx) => {
  const units: Array<z.infer<typeof ResponseUnitSchema>> = [];
  for (const rawUnit of envelope.units) {
    const parsedBase = CompatibleUnitBaseSchema.safeParse(rawUnit);
    if (!parsedBase.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unit has invalid base metadata" });
      return z.NEVER;
    }
    const parsed = ResponseUnitSchema.safeParse(rawUnit);
    if (parsed.success) {
      units.push(parsed.data);
      continue;
    }
    const knownType = KNOWN_UNIT_TYPES.has(parsedBase.data.type);
    const optionalUnknown = !knownType && parsedBase.data.required === false;
    if (!optionalUnknown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: knownType ? "Known unit is incompatible with its schema" : "Unknown required unit",
      });
      return z.NEVER;
    }
  }
  return { ...envelope, units };
});

export type ResponseEnvelope = z.infer<typeof ResponseEnvelopeSchema>;
export type ResponseUnit = z.infer<typeof ResponseUnitSchema>;
export type ActionEnvelope = z.infer<typeof ActionEnvelopeSchema>;

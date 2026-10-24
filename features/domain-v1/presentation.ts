import {
  ResponseEnvelopeSchema,
  type ResponseUnit,
} from "../../contracts/agent-application/v1/schemas.ts";
import type {
  ActionDescriptor,
  KnownUnitType,
  PresentationUnit,
  PresentationUnitFor,
  ResponseViewModel,
  UnitPayloadMap,
} from "./types.ts";

const toActionDescriptors = (
  actions: ResponseUnit["available_actions"],
): readonly ActionDescriptor[] | undefined => actions?.map((action) => ({
  action_type: action.action_type,
  label: action.label,
  requires_confirmation: action.requires_confirmation,
}));

const presentUnit = <Type extends KnownUnitType>(
  unit: ResponseUnit,
  type: Type,
): PresentationUnitFor<Type> => ({
  id: unit.id,
  type,
  schema_version: unit.schema_version,
  visibility: unit.visibility,
  required: unit.required,
  source_refs: unit.source_refs,
  confidence: unit.confidence,
  available_actions: toActionDescriptors(unit.available_actions),
  payload: unit.payload as UnitPayloadMap[Type],
}) as PresentationUnitFor<Type>;

const assertNever = (value: never): never => {
  throw new TypeError(`Unsupported response unit: ${String(value)}`);
};

export const toUnitViewModel = (unit: ResponseUnit): PresentationUnit => {
  const type = unit.type as KnownUnitType;

  switch (type) {
    case "message":
      return presentUnit(unit, type);
    case "structured_question":
      return presentUnit(unit, type);
    case "context_summary":
      return presentUnit(unit, type);
    case "place_collection":
      return presentUnit(unit, type);
    case "comparison":
      return presentUnit(unit, type);
    case "evidence_notice":
      return presentUnit(unit, type);
    case "reference_result":
      return presentUnit(unit, type);
    case "conflict_summary":
      return presentUnit(unit, type);
    case "action_proposal":
      return presentUnit(unit, type);
    case "action_result":
      return presentUnit(unit, type);
    case "orientation":
      return presentUnit(unit, type);
    default:
      return assertNever(type);
  }
};

export const toResponseViewModel = (input: unknown): ResponseViewModel => {
  const envelope = ResponseEnvelopeSchema.parse(input);

  return {
    contract_version: envelope.contract_version,
    response_id: envelope.response_id,
    trip_id: envelope.trip_id,
    conversation_space_id: envelope.conversation_space_id,
    in_reply_to_message_id: envelope.in_reply_to_message_id,
    context_trace_id: envelope.context_trace_id,
    created_at: envelope.created_at,
    units: envelope.units.map(toUnitViewModel),
  };
};

import type {
  ResponseEnvelope,
  ResponseUnit,
} from "../../contracts/agent-application/v1/schemas.ts";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

type AvailableAction = NonNullable<ResponseUnit["available_actions"]>[number];
type SourceRefs = ResponseUnit["source_refs"];
type Payload = ResponseUnit["payload"];

export type KnownUnitType =
  | "message"
  | "structured_question"
  | "context_summary"
  | "place_collection"
  | "comparison"
  | "evidence_notice"
  | "reference_result"
  | "conflict_summary"
  | "action_proposal"
  | "action_result"
  | "orientation";

export type UnitPayloadMap = {
  message: Extract<Payload, { author: "gustave" | "person" }>;
  structured_question: Extract<Payload, { question_id: string }>;
  context_summary: Extract<Payload, { claim_ids: string[] }>;
  place_collection: Extract<Payload, { places: unknown[] }>;
  comparison: Record<string, unknown>;
  evidence_notice: Extract<Payload, { severity: "info" | "warning" | "critical" }>;
  reference_result: Extract<Payload, { reference_id: string }>;
  conflict_summary: Record<string, unknown>;
  action_proposal: Extract<Payload, { proposal: unknown }>;
  action_result: Extract<Payload, { execution: unknown }>;
  orientation: Record<string, unknown>;
};

export type ActionDescriptor = Readonly<{
  action_type: AvailableAction["action_type"];
  label: string;
  requires_confirmation: boolean;
}>;

export type PresentationUnitFor<Type extends KnownUnitType> = Type extends KnownUnitType
  ? Readonly<{
      id: ResponseUnit["id"];
      type: Type;
      schema_version: ResponseUnit["schema_version"];
      visibility: ResponseUnit["visibility"];
      required: ResponseUnit["required"];
      source_refs: DeepReadonly<SourceRefs>;
      confidence: ResponseUnit["confidence"];
      available_actions: readonly ActionDescriptor[] | undefined;
      payload: DeepReadonly<UnitPayloadMap[Type]>;
    }>
  : never;

export type PresentationUnit = PresentationUnitFor<KnownUnitType>;

export type ResponseViewModel = Readonly<{
  contract_version: ResponseEnvelope["contract_version"];
  response_id: ResponseEnvelope["response_id"];
  trip_id: ResponseEnvelope["trip_id"];
  conversation_space_id: ResponseEnvelope["conversation_space_id"];
  in_reply_to_message_id: ResponseEnvelope["in_reply_to_message_id"];
  context_trace_id: ResponseEnvelope["context_trace_id"];
  created_at: ResponseEnvelope["created_at"];
  units: readonly PresentationUnit[];
}>;

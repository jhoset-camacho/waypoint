import { z } from "zod";
import { Count, Id, Instant, ItemRef, RevisionRef, issue, sameRevision } from "./die.ts";

const money = z.object({ minor_units: Count, currency: z.string().regex(/^[A-Z]{3}$/) }).strict();
const bounds = z.object({ active_ms: Count, calls: Count, cost: money }).strict();
const measurement = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unknown"), reason: Id }).strict(),
  z.object({ status: z.enum(["estimated", "observed"]), amount: money, method: Id }).strict(),
]);
export const Capability = z.object({
  id: Id, provider: Id, operation: Id, interface_version: Id, configuration_version: Id,
  scope: Id, modality: Id, permission_ref: Id, owner: Id, fallback: Id,
  freshness_condition: Id, failure_signals: z.array(Id), bounds,
  availability: z.discriminatedUnion("status", [
    z.object({ status: z.literal("unverified"), verification_plan_ref: Id }).strict(),
    z.object({ status: z.literal("available"), real_read_ref: Id, observed_at: Instant, valid_until: Instant }).strict(),
    z.object({ status: z.literal("unavailable"), cause: Id, evidence_ref: Id }).strict(),
  ]),
}).strict().superRefine(({ availability }, ctx) => {
  if (availability.status === "available" && Date.parse(availability.valid_until) <= Date.parse(availability.observed_at)) {
    issue(ctx, ["availability"], "Availability must extend past the observation");
  }
});

export const ToolObservation = z.object({
  attempt_id: Id, call_id: Id, capability_id: Id, configuration_version: Id, interface_version: Id,
  parameter_ref: Id, origin_ref: Id, scope: Id, observed_at: Instant, fact_at: Instant.nullable(),
  freshness_condition: Id, limitations: z.array(Id), revision: RevisionRef,
  access: z.enum(["authorized", "denied", "revoked", "unknown"]),
  outcome: z.enum(["observed", "incomplete", "timeout", "rate_limited", "failed", "denied"]),
  evidence: z.array(ItemRef), claims: z.array(ItemRef), cost: measurement,
}).strict().superRefine((value, ctx) => {
  if ([...value.evidence, ...value.claims].some((ref) => !sameRevision(ref, value.revision)) ||
      (value.evidence.length > 0 && (value.access !== "authorized" || !["observed", "incomplete"].includes(value.outcome)))) {
    issue(ctx, ["evidence"], "Evidence requires authorized observations linked to the exact DIE revision");
  }
});

const reservation = z.discriminatedUnion("kind", [
  z.object({ id: Id, kind: z.literal("local"), active_ms: Count.positive() }).strict(),
  z.object({
    id: Id, kind: z.enum(["tool", "model"]), active_ms: Count.positive(),
    cost_bound: money, dispatched: z.boolean(),
  }).strict(),
]);

export const Budget = z.object({
  version: Id, authorization_ref: Id, deadline: Instant.optional(),
  limit: bounds, consumed: bounds, reservations: z.array(reservation),
}).strict().superRefine(({ limit, consumed, reservations }, ctx) => {
  const currency = limit.cost.currency;
  const calls = reservations.filter((r) => r.kind !== "local");
  const active = reservations.reduce((sum, r) => sum + r.active_ms, consumed.active_ms);
  const cost = calls.reduce((sum, r) => sum + r.cost_bound.minor_units, consumed.cost.minor_units);
  if (new Set(reservations.map(({ id }) => id)).size !== reservations.length ||
      consumed.cost.currency !== currency || calls.some((r) => r.cost_bound.currency !== currency) ||
      active > limit.active_ms || consumed.calls + calls.length > limit.calls || cost > limit.cost.minor_units) {
    issue(ctx, ["reservations"], "Consumed and committed amounts must fit every budget dimension");
  }
});

export const BudgetPair = z.object({ research: Budget, execution: Budget }).strict()
  .superRefine(({ research, execution }, ctx) => {
    if (execution.consumed.active_ms > research.consumed.active_ms ||
        execution.consumed.calls > research.consumed.calls ||
        execution.consumed.cost.minor_units > research.consumed.cost.minor_units ||
        execution.limit.cost.currency !== research.limit.cost.currency ||
        execution.reservations.some((r) => !research.reservations.some((shared) => JSON.stringify(shared) === JSON.stringify(r)))) {
      issue(ctx, ["execution"], "Execution charges and reservations must be accounted for in the research budget");
    }
  });

export const Dependency = z.object({
  id: Id, revision: RevisionRef, version: Id, expires_at: Instant.optional(),
  access: z.enum(["authorized", "revoked", "unknown"]),
}).strict();

export const Checkpoint = z.object({
  hec_version: z.literal("1.0.0"), id: Id, version: Count, configuration_version: Id,
  revision: RevisionRef, attempt_id: Id, scope_ref: Id, authority_ref: Id,
  state_version: Count, paused_at: Instant, reason: Id, cursor_ref: Id.optional(),
  budgets: BudgetPair, pending: z.array(Id), dependencies: z.array(Dependency),
  evidence: z.array(ItemRef), dispositions: z.array(ItemRef),
}).strict().superRefine((value, ctx) => {
  if ([...value.evidence, ...value.dispositions].some((ref) => !sameRevision(ref, value.revision))) {
    issue(ctx, ["revision"], "Checkpoint references must match the exact revision");
  }
});

export const PartialDelivery = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("minimal"),
    message: z.literal("Research ended without enough verified evidence."),
  }).strict(),
  z.object({
    kind: z.literal("partial"), revision: RevisionRef, evidence: z.array(ItemRef).min(1),
    missing: z.array(Id), cause: Id, next_check: Id.optional(),
  }).strict(),
]).superRefine((value, ctx) => {
  if (value.kind === "partial" && value.evidence.some((ref) => !sameRevision(ref, value.revision))) {
    issue(ctx, ["evidence"], "Partial evidence must match the exact revision");
  }
});

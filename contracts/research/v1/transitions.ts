import { z } from "zod";
import { Count, Id, Instant, ItemRef, RevisionRef, sameRevision } from "./die.ts";
import { BudgetPair, Checkpoint, Dependency, PartialDelivery } from "./hec.ts";

const money = z.object({ minor_units: Count, currency: z.string().regex(/^[A-Z]{3}$/) }).strict();
const request = z.discriminatedUnion("kind", [
  z.object({ id: Id, kind: z.literal("local"), active_ms: Count.positive() }).strict(),
  z.object({
    id: Id, kind: z.enum(["tool", "model"]), active_ms: Count.positive(),
    cost_bound: money,
    timeout_ms: Count.positive(), permission_verified: z.literal(true),
  }).strict(),
]);

export function reserveOperation(
  rawBudgets: unknown, rawRequest: unknown, admissionAt: string, allowShorter: boolean,
) {
  const budgets = BudgetPair.parse(rawBudgets);
  const operation = request.parse(rawRequest);
  const now = Date.parse(Instant.parse(admissionAt));
  const { research, execution } = budgets;
  if (execution.reservations.length || research.reservations.some((r) => r.id === operation.id)) return null;
  const capacity = (budget: typeof research) => Math.min(
    budget.limit.active_ms - budget.consumed.active_ms -
      budget.reservations.reduce((sum, r) => sum + r.active_ms, 0),
    budget.deadline ? Date.parse(budget.deadline) - now : Infinity,
  );
  const desired = operation.kind === "local" ? operation.active_ms : Math.min(operation.active_ms, operation.timeout_ms);
  const active_ms = Math.min(desired, capacity(research), capacity(execution));
  if (active_ms <= 0 || (active_ms < desired && !allowShorter)) return null;
  const reserved = operation.kind === "local" ? { id: operation.id, kind: operation.kind, active_ms } :
    { id: operation.id, kind: operation.kind, active_ms, cost_bound: operation.cost_bound, dispatched: false };
  const next = BudgetPair.safeParse({
    research: { ...research, reservations: [...research.reservations, reserved] },
    execution: { ...execution, reservations: [reserved] },
  });
  return next.success ? { budgets: next.data, effective_deadline_ms: now + active_ms } : null;
}

const completion = z.object({
  id: Id, active_ms: Count, cessation_confirmed: z.boolean(),
  cost: money.optional(),
}).strict();

export function markDispatched(rawBudgets: unknown, id: string) {
  const budgets = BudgetPair.parse(rawBudgets);
  const selected = budgets.execution.reservations.find((r) => r.id === id);
  if (!selected || selected.kind === "local" || selected.dispatched) return null;
  const mark = (budget: typeof budgets.execution) => ({
    ...budget,
    reservations: budget.reservations.map((r) => r.id === id ? { ...selected, dispatched: true } : r),
  });
  return BudgetPair.parse({ research: mark(budgets.research), execution: mark(budgets.execution) });
}

export function reconcileOperation(rawBudgets: unknown, rawCompletion: unknown) {
  const budgets = BudgetPair.parse(rawBudgets);
  const result = completion.parse(rawCompletion);
  const reserved = budgets.execution.reservations.find((r) => r.id === result.id);
  if (!reserved) return { status: "missing" as const, budgets };
  const dispatched = reserved.kind !== "local" && reserved.dispatched;
  if (!result.cessation_confirmed || (dispatched && !result.cost)) return { status: "held" as const, budgets };
  const charge = result.cost?.minor_units ?? 0;
  const limitCost = reserved.kind === "local" ? 0 : reserved.cost_bound.minor_units;
  if (result.active_ms > reserved.active_ms || (result.cost && result.cost.currency !== budgets.execution.limit.cost.currency) ||
      (!dispatched && charge > 0) || charge > limitCost) return { status: "incident" as const, budgets };

  const settle = (budget: typeof budgets.execution) => ({
    ...budget,
    consumed: {
      active_ms: budget.consumed.active_ms + result.active_ms,
      calls: budget.consumed.calls + Number(dispatched),
      cost: { ...budget.consumed.cost, minor_units: budget.consumed.cost.minor_units + charge },
    },
    reservations: budget.reservations.filter((r) => r.id !== result.id),
  });
  return { status: "settled" as const, budgets: BudgetPair.parse({
    research: settle(budgets.research), execution: settle(budgets.execution),
  }) };
}

export function dependencyUsable(
  snapshot: z.infer<typeof Dependency>, current: z.infer<typeof Dependency> | undefined, at: number,
) {
  return Boolean(current && Number.isFinite(at) && current.access === "authorized" && snapshot.id === current.id &&
    sameRevision(snapshot.revision, current.revision) && snapshot.version === current.version &&
    (!snapshot.expires_at || Date.parse(snapshot.expires_at) > at) &&
    (!current.expires_at || Date.parse(current.expires_at) > at));
}

export function assessResume(rawCheckpoint: unknown, context: {
  explicit: boolean;
  authorized: boolean;
  version: number;
  configuration_version: string;
  state_version: number;
  revision: z.infer<typeof RevisionRef>;
  dependencies: z.infer<typeof Dependency>[];
  now: string;
}) {
  const checkpoint = Checkpoint.parse(rawCheckpoint);
  const at = Date.parse(Instant.parse(context.now));
  if (!context.explicit || !context.authorized) return "denied";
  if (checkpoint.version !== context.version || checkpoint.configuration_version !== context.configuration_version ||
      !sameRevision(checkpoint.revision, context.revision) || checkpoint.state_version !== context.state_version ||
      checkpoint.dependencies.some((dep) => !dependencyUsable(dep, context.dependencies.find((d) => d.id === dep.id), at))) {
    return "revalidate";
  }
  if ([checkpoint.budgets.research, checkpoint.budgets.execution].some((budget) =>
    (budget.deadline && Date.parse(budget.deadline) <= at) || budget.consumed.active_ms >= budget.limit.active_ms)) {
    return "exhausted";
  }
  if (checkpoint.budgets.execution.reservations.length) return "reconcile";
  return "eligible";
}

const minimalDelivery = Object.freeze(PartialDelivery.parse({
  kind: "minimal", message: "Research ended without enough verified evidence.",
}));

export function closeWithAvailableEvidence(input: {
  revision: z.infer<typeof RevisionRef>;
  projectionAdmitted: boolean;
  authorizedEvidence: z.infer<typeof ItemRef>[];
  missing: string[];
  cause: string;
  nextCheck?: string;
}) {
  if (!input.projectionAdmitted || !input.authorizedEvidence.length) {
    return minimalDelivery;
  }
  return PartialDelivery.parse({
    kind: "partial", revision: input.revision, evidence: input.authorizedEvidence,
    missing: input.missing, cause: input.cause, next_check: input.nextCheck,
  });
}

export function nextSharedStateVersion(previous: number, writes: ("shared_material" | "private" | "checkpoint" | "no_change")[]) {
  return Count.parse(Count.parse(previous) + Number(writes.includes("shared_material")));
}

export function classifyOperation(incoming: { key: string; fingerprint: string }, prior?: typeof incoming) {
  if (!prior || prior.key !== incoming.key) return "new";
  return prior.fingerprint === incoming.fingerprint ? "replay" : "conflict";
}

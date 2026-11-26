import { z } from "zod";
import { Id, ItemRef, RevisionRef, issue, sameRevision } from "../../research/v1/die.ts";
import { ResponseEnvelopeSchema, ResponseUnitSchema, UNIT_SCHEMA_VERSION } from "./schemas.ts";

export const ResearchSidecar = z.object({
  die_version: z.literal("1.0.0"),
  response_id: Id,
  revision: RevisionRef,
  references: z.array(ItemRef),
}).strict().superRefine((data, ctx) => {
  if (data.references.some((ref) => !sameRevision(ref, data.revision))) {
    issue(ctx, ["references"], "Every reference must identify an item of the advertised revision");
  }
});

type ResearchCapability = { version: string; verified: boolean };

type EssentialBlock = {
  noticeId: string;
  text: string;
  visibility: z.infer<typeof ResponseUnitSchema>["visibility"];
  affectedActionUnitIds: readonly string[];
  affectedActionTypes: readonly string[];
};

export function projectResearchResponse(input: {
  envelope: unknown;
  capability?: ResearchCapability;
  evidenceNoticeSupported: boolean;
  block?: EssentialBlock;
  sidecar?: unknown;
  canReadRevision: (revision: z.infer<typeof RevisionRef>) => boolean;
  canReadItem: (reference: z.infer<typeof ItemRef>) => boolean;
}) {
  const parsed = ResponseEnvelopeSchema.parse(input.envelope);
  const { block } = input;
  let envelope = parsed;
  if (block) {
    const common = { id: block.noticeId, schema_version: UNIT_SCHEMA_VERSION, visibility: block.visibility, required: true };
    const notice = input.evidenceNoticeSupported
      ? { ...common, type: "evidence_notice", payload: { text: block.text, severity: "critical" } }
      : { ...common, type: "message", payload: { text: block.text, author: "gustave" } };
    const safeUnits = parsed.units
      .filter((unit) => unit.type !== "action_proposal" || !block.affectedActionUnitIds.includes(unit.id))
      .map((unit) => unit.available_actions
        ? { ...unit, available_actions: unit.available_actions.filter((action) => !block.affectedActionTypes.includes(action.action_type)) }
        : unit);
    envelope = ResponseEnvelopeSchema.parse({
      ...parsed, units: input.evidenceNoticeSupported ? [notice, ...safeUnits] : [notice],
    });
  }

  if (!input.capability?.verified || input.capability.version !== "1.0.0") return { envelope };
  const sidecar = ResearchSidecar.safeParse(input.sidecar);
  if (!sidecar.success || sidecar.data.response_id !== envelope.response_id ||
      !input.canReadRevision(sidecar.data.revision)) return { envelope };
  return { envelope, research: { ...sidecar.data, references: sidecar.data.references.filter(input.canReadItem) } };
}

export function readResearchSidecar(
  envelope: unknown, sidecar: unknown,
  canReadRevision: (revision: z.infer<typeof RevisionRef>) => boolean,
  canReadItem: (reference: z.infer<typeof ItemRef>) => boolean,
) {
  const response = ResponseEnvelopeSchema.parse(envelope);
  const research = ResearchSidecar.safeParse(sidecar);
  if (!research.success || research.data.response_id !== response.response_id || !canReadRevision(research.data.revision)) {
    return { response };
  }
  return { response, research: { ...research.data, references: research.data.references.filter(canReadItem) } };
}

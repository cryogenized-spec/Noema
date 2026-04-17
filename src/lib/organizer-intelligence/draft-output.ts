import type {
  OrganizerDraftEnvelope,
  OrganizerDraftPayload,
  OrganizerDraftReviewState,
  OrganizerDraftType,
  OrganizerIntelligenceContext,
  OrganizerSourceContext,
} from "@/lib/organizer-intelligence/types";

const makeDraftId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
};

interface CreateOrganizerDraftEnvelopeInput {
  draftType: OrganizerDraftType;
  context: OrganizerIntelligenceContext;
  source: OrganizerSourceContext;
  payload: OrganizerDraftPayload;
}

export const createOrganizerDraftEnvelope = ({
  draftType,
  context,
  source,
  payload,
}: CreateOrganizerDraftEnvelopeInput): OrganizerDraftEnvelope => {
  const now = new Date().toISOString();

  return {
    id: makeDraftId(),
    draftType,
    context,
    source,
    payload,
    reviewState: "proposed",
    createdAt: now,
    updatedAt: now,
  };
};

export const transitionOrganizerDraftReviewState = (
  draft: OrganizerDraftEnvelope,
  nextState: OrganizerDraftReviewState,
): OrganizerDraftEnvelope => ({
  ...draft,
  reviewState: nextState,
  updatedAt: new Date().toISOString(),
});

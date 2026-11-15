import { NEW_WORKSHOP_PROFILE, type WorkshopProfile } from "../../types/profile";

/** Preserve existing Dexie v10 profiles while adding fields introduced in later UI passes. */
export function normalizeWorkshopProfile(stored: Partial<WorkshopProfile> | undefined | null): WorkshopProfile {
  if (!stored) return { ...NEW_WORKSHOP_PROFILE };
  const asArray = <T>(value: T[] | undefined): T[] => Array.isArray(value) ? value : [];
  return {
    ...NEW_WORKSHOP_PROFILE,
    ...stored,
    id: "self",
    disciplines: asArray(stored.disciplines),
    tools: asArray(stored.tools),
    proficiencies: asArray(stored.proficiencies),
    inventory: asArray(stored.inventory),
    builds: asArray(stored.builds),
    contributions: asArray(stored.contributions),
    gallery: asArray(stored.gallery),
    links: asArray(stored.links),
  };
}

export { verifiedHttpsUrl, splitWorkshopTags } from "./validators";

export function activeBuildCount(profile: WorkshopProfile): number {
  return profile.builds.filter((build) => !build.archived).length;
}

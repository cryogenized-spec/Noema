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

/** Never turn user-provided proof links into javascript:, data: or HTTP navigation. */
export function verifiedHttpsUrl(raw: string): string {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:" || !parsed.hostname) return "";
    return parsed.toString();
  } catch { return ""; }
}

/** Retains usable tags, bounded for lightweight local indexing and display. */
export function splitWorkshopTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((tag) => tag.trim()).filter(Boolean))]
    .slice(0, 24).map((tag) => tag.slice(0, 48));
}

export function activeBuildCount(profile: WorkshopProfile): number {
  return profile.builds.filter((build) => !build.archived).length;
}

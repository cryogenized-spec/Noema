/** RADIX-inspired, local-only identity for makers and collaborators.
 * Public publishing, verification, and remote search are intentionally absent.
 */
export type CollaborationStatus = "open" | "selective" | "unavailable";
export type BuildStatus = "designing" | "prototyping" | "testing" | "released";
export interface WorkshopBuild {
  id: string;
  title: string;
  summary: string;
  status: BuildStatus;
  tags: string[];
  url?: string;
  updatedAt: string;
}
export interface WorkshopLink { id: string; label: string; url: string; }
export interface WorkshopProfile {
  id: "self";
  alias: string;
  handle: string;
  tagline: string;
  about: string;
  region: string;
  avatarImage: string;
  bannerImage: string;
  collaboration: CollaborationStatus;
  disciplines: string[];
  tools: string[];
  builds: WorkshopBuild[];
  links: WorkshopLink[];
  updatedAt: string;
}
export const NEW_WORKSHOP_PROFILE: WorkshopProfile = {
  id: "self",
  alias: "",
  handle: "",
  tagline: "",
  about: "",
  region: "",
  avatarImage: "",
  bannerImage: "",
  collaboration: "selective",
  disciplines: [],
  tools: [],
  builds: [],
  links: [],
  updatedAt: "",
};

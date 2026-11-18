/** RADIX-inspired workshop identity. Private until explicit profile publishing exists. */
export type CollaborationStatus = "open" | "selective" | "unavailable";
export type BuildStatus = "designing" | "prototyping" | "testing" | "released";
export type ProficiencyLevel = "novice" | "intermediate" | "advanced" | "expert";
export type ProfileIdentityType = "human" | "ai";

export interface WorkshopBuild {
  id: string;
  title: string;
  summary: string;
  status: BuildStatus;
  tags: string[];
  url?: string;
  imageData?: string;
  openToCollaborate?: boolean;
  archived?: boolean;
  updatedAt: string;
}
export interface WorkshopProficiency {
  id: string;
  field: string;
  level: ProficiencyLevel;
  details: string;
}
export interface WorkshopInventory {
  id: string;
  name: string;
  category: string;
  specifications: string;
}
export interface WorkshopContribution {
  id: string;
  title: string;
  summary: string;
  date: string;
  url?: string;
}
export interface WorkshopMedia {
  id: string;
  imageData: string;
  caption: string;
  addedAt: string;
}
export interface WorkshopLink { id: string; label: string; url: string; }

export interface WorkshopProfile {
  id: "self";
  alias: string;
  handle: string;
  tagline: string;
  about: string;
  region: string;
  primaryDomain: string;
  yearsActive: string;
  identityType: ProfileIdentityType;
  avatarImage: string;
  bannerImage: string;
  collaboration: CollaborationStatus;
  disciplines: string[];
  tools: string[];
  proficiencies: WorkshopProficiency[];
  inventory: WorkshopInventory[];
  builds: WorkshopBuild[];
  contributions: WorkshopContribution[];
  gallery: WorkshopMedia[];
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
  primaryDomain: "",
  yearsActive: "",
  identityType: "human",
  avatarImage: "",
  bannerImage: "",
  collaboration: "selective",
  disciplines: [],
  tools: [],
  proficiencies: [],
  inventory: [],
  builds: [],
  contributions: [],
  gallery: [],
  links: [],
  updatedAt: "",
};

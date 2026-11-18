"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { db } from "@/lib/db/client";
import { optimiseWorkshopImage } from "@/lib/profile/image";
import { WorkshopImageCropper, type CropTarget } from "@/components/profile/workshop-image-cropper";
import { normalizeWorkshopProfile, splitWorkshopTags, verifiedHttpsUrl, activeBuildCount } from "@/lib/profile/workshop";
import {
  type BuildStatus,
  type ProficiencyLevel,
  type WorkshopBuild,
  type WorkshopProfile,
} from "@/types/profile";

type ProfileTab = "wall" | "bench" | "skills" | "media" | "links";
type SkillTab = "proficiencies" | "inventory" | "tools";
type BuildDraft = {
  id: string;
  title: string;
  summary: string;
  status: BuildStatus;
  tags: string;
  url: string;
  imageData: string;
  openToCollaborate: boolean;
  archived: boolean;
};
const EMPTY_BUILD: BuildDraft = { id: "", title: "", summary: "", status: "prototyping", tags: "",
  url: "", imageData: "", openToCollaborate: false, archived: false };
const navigation: Array<{ id: ProfileTab; label: string }> = [
  { id: "wall", label: "Wall" },
  { id: "bench", label: "Bench" },
  { id: "skills", label: "Skills" },
  { id: "media", label: "Media" },
  { id: "links", label: "Links" },
];
const inputClass = "w-full min-w-0 rounded-lg border border-noema-border bg-black/70 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-noema-lime focus:outline-none";
const panelClass = "rounded-xl border border-noema-border bg-[#111113] p-3.5 sm:p-5";
const primaryButton = "min-h-10 rounded-lg bg-noema-lime px-3 py-2 text-xs font-semibold text-black hover:bg-[#d2ffa1]";
const outlineButton = "min-h-10 rounded-lg border border-noema-border bg-black/30 px-3 py-2 text-xs font-medium text-neutral-300 hover:border-noema-lime/60";

function TabButtons<T extends string>({ items, value, onChange, label }: {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex min-w-0 gap-1 rounded-lg border border-noema-border bg-[#111113] p-1">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)}
          aria-current={value === item.id ? "page" : undefined}
          className={"min-h-9 min-w-0 flex-1 rounded-md px-1 text-[11px] font-semibold transition " +
            (value === item.id ? "bg-noema-lime text-black" : "text-neutral-400 hover:bg-white/5 hover:text-white")}>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-noema-border p-4 text-sm leading-relaxed text-neutral-400">{children}</p>;
}
function TaggedItems({ items }: { items: string[] }) {
  return <div className="flex flex-wrap gap-2">{items.map((item) =>
    <span key={item} className="rounded-lg border border-noema-border bg-black/40 px-2.5 py-1.5 text-xs text-neutral-300">{item}</span>)}</div>;
}

export function WorkshopProfileScreen() {
  const [profile, setProfile] = useState<WorkshopProfile>(() => normalizeWorkshopProfile(null));
  const [saved, setSaved] = useState<WorkshopProfile>(() => normalizeWorkshopProfile(null));
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("wall");
  const [skillTab, setSkillTab] = useState<SkillTab>("proficiencies");
  const [archivedView, setArchivedView] = useState(false);
  const [notice, setNotice] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [cropRequest, setCropRequest] = useState<{ target: CropTarget; file: File } | null>(null);

  const [disciplinesText, setDisciplinesText] = useState("");
  const [toolsText, setToolsText] = useState("");
  const [buildDraft, setBuildDraft] = useState<BuildDraft>({ ...EMPTY_BUILD });
  const [proficiencyDraft, setProficiencyDraft] = useState({ field: "", level: "intermediate" as ProficiencyLevel, details: "" });
  const [inventoryDraft, setInventoryDraft] = useState({ name: "", category: "", specifications: "" });
  const [contributionDraft, setContributionDraft] = useState({ title: "", summary: "", url: "" });
  const [mediaCaption, setMediaCaption] = useState("");
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });

  useEffect(() => {
    let mounted = true;
    void db.profiles.get("self").then((stored) => {
      if (!mounted) return;
      const next = normalizeWorkshopProfile(stored);
      setSaved(next); setProfile(next);
      setDisciplinesText(next.disciplines.join(", "));
      setToolsText(next.tools.join(", "));
      setReady(true);
    }).catch(() => {
      if (mounted) { setNotice("Local storage is unavailable. This profile cannot be saved in this browser."); setReady(true); }
    });
    return () => { mounted = false; };
  }, []);

  const patch = (updates: Partial<WorkshopProfile>) => setProfile((current) => ({ ...current, ...updates }));
  const showNotice = (message: string) => setNotice(message);
  const startEditing = () => {
    setDisciplinesText(profile.disciplines.join(", "));
    setToolsText(profile.tools.join(", "));
    setEditing(true);
    setNotice("Editing a private draft. Use Save to retain changes.");
  };
  const cancel = () => {
    setProfile(saved);
    setDisciplinesText(saved.disciplines.join(", "));
    setToolsText(saved.tools.join(", "));
    setBuildDraft({ ...EMPTY_BUILD });
    setEditing(false); setNotice("Unsaved edits discarded.");
  };
  const save = async () => {
    const next: WorkshopProfile = {
      ...profile, id: "self",
      alias: profile.alias.trim().slice(0, 50),
      handle: profile.handle.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30),
      tagline: profile.tagline.trim().slice(0, 120),
      about: profile.about.trim().slice(0, 1600),
      region: profile.region.trim().slice(0, 80),
      primaryDomain: profile.primaryDomain.trim().slice(0, 80),
      yearsActive: profile.yearsActive.trim().slice(0, 20),
      disciplines: splitWorkshopTags(disciplinesText),
      tools: splitWorkshopTags(toolsText),
      updatedAt: new Date().toISOString(),
    };
    try {
      await db.profiles.put(next);
      setProfile(next); setSaved(next); setEditing(false); setNotice("Profile saved privately in this browser.");
      window.dispatchEvent(new Event("noema:profile-updated"));
    } catch {
      setNotice("Could not save profile. Check IndexedDB storage and available space.");
    }
  };
  const exportSaved = () => {
    try {
      const data = JSON.stringify({ format: "noema-workshop-v1", exportedAt: new Date().toISOString(), profile: saved }, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "noema-workshop-backup.json";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      showNotice("Exported saved profile as a local JSON backup. Keep it private.");
    } catch { showNotice("Could not export the workshop backup."); }
  };
  // Image confirmations persist ONLY the selected media field, never unrelated
  // unsaved identity fields. A user can therefore cancel other profile edits without
  // accidentally rolling back an already saved photo.
  const saveConfirmedCrop = async (data: string) => {
    if (!cropRequest) throw new Error("No image is selected.");
    const key = cropRequest.target === "avatar" ? "avatarImage" : "bannerImage";
    let persisted: WorkshopProfile | null = null;
    await db.transaction("rw", db.profiles, async () => {
      const current = normalizeWorkshopProfile(await db.profiles.get("self"));
      const next = { ...current, [key]: data, updatedAt: new Date().toISOString() };
      await db.profiles.put(next);
      persisted = next;
    });
    if (!persisted) throw new Error("Failed to persist image.");
    const savedImage = persisted as WorkshopProfile;
    setSaved(savedImage);
    setProfile((current) => ({ ...current, [key]: data }));
    setCropRequest(null);
    showNotice(cropRequest.target === "avatar" ? "Profile photo saved automatically." : "Banner saved automatically.");
    window.dispatchEvent(new Event("noema:profile-updated"));
  };
  const uploadGallery = async (file?: File) => {
    if (!file || imageBusy) return;
    setImageBusy(true);
    try {
      const imageData = await optimiseWorkshopImage(file, "gallery");
      let persisted: WorkshopProfile | null = null;
      await db.transaction("rw", db.profiles, async () => {
        const current = normalizeWorkshopProfile(await db.profiles.get("self"));
        if (current.gallery.length >= 12) throw new Error("Gallery has reached its 12-image limit.");
        const next: WorkshopProfile = {
          ...current,
          gallery: [{
            id: crypto.randomUUID(), imageData,
            caption: mediaCaption.trim().slice(0, 120), addedAt: new Date().toISOString(),
          }, ...current.gallery],
          updatedAt: new Date().toISOString(),
        };
        await db.profiles.put(next);
        persisted = next;
      });
      if (!persisted) throw new Error("Image could not be stored.");
      const updated = persisted as WorkshopProfile;
      setSaved(updated);
      setProfile((current) => ({ ...current, gallery: updated.gallery }));
      setMediaCaption("");
      showNotice("Gallery image saved automatically.");
      window.dispatchEvent(new Event("noema:profile-updated"));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Image could not be saved.");
    } finally { setImageBusy(false); }
  };
  const uploadBuildImage = async (file?: File) => {
    if (!file || imageBusy) return;
    setImageBusy(true);
    try {
      const imageData = await optimiseWorkshopImage(file, "gallery");
      if (buildDraft.id) {
        let persisted: WorkshopProfile | null = null;
        await db.transaction("rw", db.profiles, async () => {
          const current = normalizeWorkshopProfile(await db.profiles.get("self"));
          if (!current.builds.some((build) => build.id === buildDraft.id)) throw new Error("Project was not saved yet.");
          const next: WorkshopProfile = {
            ...current,
            builds: current.builds.map((build) => build.id === buildDraft.id
              ? { ...build, imageData, updatedAt: new Date().toISOString() } : build),
            updatedAt: new Date().toISOString(),
          };
          await db.profiles.put(next);
          persisted = next;
        });
        if (!persisted) throw new Error("Project image could not be saved.");
        const updated = persisted as WorkshopProfile;
        setSaved(updated);
        setProfile((current) => ({ ...current,
          builds: current.builds.map((build) => build.id === buildDraft.id ? { ...build, imageData } : build),
        }));
        showNotice("Existing project photo saved automatically.");
      } else {
        showNotice("Project photo prepared. Add the new project to save it with its title and details.");
      }
      setBuildDraft((current) => ({ ...current, imageData }));
    } catch (error) { showNotice(error instanceof Error ? error.message : "Image could not be processed."); }
    finally { setImageBusy(false); }
  };
  const editBuild = (build: WorkshopBuild) => {
    setBuildDraft({
      id: build.id, title: build.title, summary: build.summary, status: build.status,
      tags: build.tags.join(", "), url: build.url ?? "", imageData: build.imageData ?? "",
      openToCollaborate: Boolean(build.openToCollaborate), archived: Boolean(build.archived),
    });
    setArchivedView(Boolean(build.archived));
    showNotice("Editing project draft; confirm changes using Update project.");
  };
  const addOrUpdateBuild = () => {
    if (!buildDraft.title.trim()) return showNotice("Give the project a title first.");
    if (buildDraft.url.trim() && !verifiedHttpsUrl(buildDraft.url)) return showNotice("Project links must use valid HTTPS URLs.");
    const entry: WorkshopBuild = {
      id: buildDraft.id || crypto.randomUUID(), title: buildDraft.title.trim().slice(0, 100),
      summary: buildDraft.summary.trim().slice(0, 700), status: buildDraft.status,
      tags: splitWorkshopTags(buildDraft.tags), url: verifiedHttpsUrl(buildDraft.url),
      imageData: buildDraft.imageData || undefined,
      openToCollaborate: buildDraft.openToCollaborate, archived: buildDraft.archived,
      updatedAt: new Date().toISOString(),
    };
    patch({ builds: buildDraft.id
      ? profile.builds.map((item) => item.id === buildDraft.id ? entry : item)
      : [entry, ...profile.builds] });
    setBuildDraft({ ...EMPTY_BUILD });
    showNotice("Project updated in draft. Save the profile to retain changes.");
  };
  const addProficiency = () => {
    if (!proficiencyDraft.field.trim()) return showNotice("Enter a field of proficiency.");
    patch({ proficiencies: [...profile.proficiencies, {
      id: crypto.randomUUID(), field: proficiencyDraft.field.trim().slice(0, 80),
      level: proficiencyDraft.level, details: proficiencyDraft.details.trim().slice(0, 280),
    }] });
    setProficiencyDraft({ field: "", level: "intermediate", details: "" });
    showNotice("Proficiency added to draft.");
  };
  const addInventory = () => {
    if (!inventoryDraft.name.trim()) return showNotice("Enter an item name.");
    patch({ inventory: [...profile.inventory, {
      id: crypto.randomUUID(), name: inventoryDraft.name.trim().slice(0, 80),
      category: inventoryDraft.category.trim().slice(0, 60),
      specifications: inventoryDraft.specifications.trim().slice(0, 240),
    }] });
    setInventoryDraft({ name: "", category: "", specifications: "" });
    showNotice("Hardware item added to draft.");
  };
  const addContribution = () => {
    if (!contributionDraft.title.trim()) return showNotice("Enter a contribution title.");
    const url = verifiedHttpsUrl(contributionDraft.url);
    if (contributionDraft.url.trim() && !url) return showNotice("Evidence links must use HTTPS.");
    patch({ contributions: [{
      id: crypto.randomUUID(), title: contributionDraft.title.trim().slice(0, 100),
      summary: contributionDraft.summary.trim().slice(0, 500),
      date: new Date().toISOString(), url,
    }, ...profile.contributions] });
    setContributionDraft({ title: "", summary: "", url: "" });
    showNotice("Contribution added to draft.");
  };
  const addLink = () => {
    const url = verifiedHttpsUrl(linkDraft.url);
    if (!linkDraft.label.trim() || !url) return showNotice("Enter a label and valid HTTPS URL.");
    patch({ links: [...profile.links, {
      id: crypto.randomUUID(), label: linkDraft.label.trim().slice(0, 60), url,
    }] });
    setLinkDraft({ label: "", url: "" });
    showNotice("External presence added to draft.");
  };
  const setArchived = (id: string, archived: boolean) => {
    patch({ builds: profile.builds.map((build) => build.id === id ? { ...build, archived } : build) });
    showNotice(archived ? "Moved to archive in draft." : "Restored to active work in draft.");
  };
  const filteredBuilds = profile.builds.filter((build) => Boolean(build.archived) === archivedView);
  const activeCount = activeBuildCount(profile);
  const publicLabel = profile.identityType === "ai" ? "AI identity · self-declared" : "Human maker · self-declared";

  return (
    <main className="h-dvh min-w-0 overflow-hidden bg-noema-midnight text-white">
      <div className="mx-auto flex h-full min-h-0 min-w-0 max-w-[720px] flex-col border-x border-noema-border bg-[#09090b]">
        <header className="flex min-h-[60px] shrink-0 items-center justify-between gap-2 border-b border-noema-border px-3 sm:px-5">
          <Link href="/" aria-label="Return to NOEMA" className="flex min-w-0 items-center gap-2">
            <Icon icon="solar:arrow-left-linear" className="shrink-0 text-lg text-neutral-400" aria-hidden="true" />
            <Image src="/brand/noema-wordmark.svg" width={282} height={56} alt="NOEMA"
              className="h-9 w-auto max-w-[125px] object-contain" unoptimized />
          </Link>
          <span className="min-w-0 truncate text-sm font-semibold tracking-wide text-white">Workshop</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {editing ? (
              <>
                <button type="button" className={outlineButton + " px-2.5"} onClick={cancel}>Cancel</button>
                <button type="button" className={primaryButton + " px-3"} onClick={() => void save()}>Save</button>
              </>
            ) : (
              <button type="button" className={outlineButton} disabled={!ready} onClick={startEditing}>
                <Icon icon="solar:pen-bold" className="mr-1 inline" aria-hidden="true" /> Edit
              </button>
            )}
          </div>
        </header>
        {notice && <p role="status" className="shrink-0 border-b border-noema-border bg-[#141618] px-3 py-2 text-xs leading-5 text-noema-lime">{notice}</p>}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          {!ready ? <p className="p-4 text-sm text-neutral-400">Loading the local workshop…</p> : (
            <>
              <div className="relative h-[116px] w-full overflow-hidden bg-gradient-to-tr from-[#241522] via-[#1d2220] to-[#262116] sm:h-[165px]">
                {profile.bannerImage &&
                  <Image src={profile.bannerImage} alt="Workshop banner" fill sizes="(max-width: 720px) 100vw, 720px"
                    className="object-cover" unoptimized />}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                {editing && <label className="absolute right-3 top-2 cursor-pointer rounded-lg border border-white/25 bg-black/80 px-3 py-2 text-[11px] text-white">
                  {imageBusy ? "Processing…" : "Choose banner crop"}
                  <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp"
                    disabled={imageBusy} onChange={(e) => { const file = e.target.files?.[0]; if (file) setCropRequest({ target: "banner", file }); e.target.value = ""; }} />
                </label>}
              </div>
              <div className="relative border-b border-noema-border px-4 pb-4 sm:px-6">
                <div className="-mt-9 flex items-end justify-between gap-2">
                  <div className="relative flex h-[82px] w-[82px] shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-[#09090b] bg-[#202124] text-3xl font-bold text-noema-lime">
                    {profile.avatarImage
                      ? <Image src={profile.avatarImage} alt="Workshop avatar" fill sizes="82px" className="object-cover" unoptimized />
                      : (profile.alias.trim().slice(0, 1).toUpperCase() || "?")}
                  </div>
                  <span className={"max-w-[60%] rounded-full border px-2.5 py-1 text-[10px] text-right " +
                    (profile.collaboration === "open" ? "border-noema-lime/40 text-noema-lime" : "border-noema-border text-neutral-400")}>
                    {profile.collaboration === "open" ? "Open to collaborate" : profile.collaboration === "selective"
                      ? "Selective collaborations" : "Not taking collaborations"}
                  </span>
                </div>
                {editing && <label className="mt-2 block text-[11px] text-neutral-400">
                  Change avatar (opens crop editor)
                  <input className="mt-1 block w-full text-xs" type="file" accept="image/png,image/jpeg,image/webp"
                    disabled={imageBusy} onChange={(e) => { const file = e.target.files?.[0]; if (file) setCropRequest({ target: "avatar", file }); e.target.value = ""; }} />
                </label>}
                <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{profile.alias || "Your workshop"}</h1>
                <p className="mt-0.5 break-words text-xs text-neutral-400">
                  {profile.handle ? "@" + profile.handle : "@choose-a-handle"}
                  {profile.region ? " · " + profile.region : ""}
                </p>
                {profile.tagline && <p className="mt-2 text-sm leading-5 text-neutral-200">{profile.tagline}</p>}
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-neutral-500">
                  <span>{publicLabel}</span>
                  {profile.primaryDomain && <span>· {profile.primaryDomain}</span>}
                  {profile.yearsActive && <span>· {profile.yearsActive} years active</span>}
                </div>
              </div>

              <div className="px-3 pt-3 sm:px-5">
                <p className="mb-3 rounded-lg border border-noema-gold/20 bg-[#171411] p-2.5 text-[11px] leading-4 text-neutral-400">
                  <strong className="font-semibold text-noema-gold">Private preview.</strong> Stored in this browser only.
                  No public profile, identity verification, contact discovery or automatic sharing is enabled.
                </p>
                <TabButtons items={navigation} value={activeTab} onChange={setActiveTab} label="Workshop areas" />
              </div>

              <div className="min-w-0 space-y-3 px-3 pb-10 pt-3 sm:px-5">
                {activeTab === "wall" && <>
                  <section className={panelClass + " space-y-3"}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-noema-lime">Profile wall</h2>
                      <span className="text-[10px] text-neutral-500">About the maker</span>
                    </div>
                    {editing ? <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-xs text-neutral-400">Display name
                          <input className={inputClass + " mt-1"} maxLength={50} value={profile.alias}
                            onChange={(e) => patch({ alias: e.target.value })} /></label>
                        <label className="text-xs text-neutral-400">Handle
                          <input className={inputClass + " mt-1"} maxLength={30} value={profile.handle}
                            onChange={(e) => patch({ handle: e.target.value })} /></label>
                        <label className="text-xs text-neutral-400">Identity
                          <select className={inputClass + " mt-1"} value={profile.identityType}
                            onChange={(e) => patch({ identityType: e.target.value as WorkshopProfile["identityType"] })}>
                            <option value="human">Human</option><option value="ai">AI</option>
                          </select></label>
                        <label className="text-xs text-neutral-400">Collaboration availability
                          <select className={inputClass + " mt-1"} value={profile.collaboration}
                            onChange={(e) => patch({ collaboration: e.target.value as WorkshopProfile["collaboration"] })}>
                            <option value="open">Open to collaborate</option>
                            <option value="selective">Selective</option>
                            <option value="unavailable">Unavailable</option>
                          </select></label>
                        <label className="text-xs text-neutral-400">Region (optional)
                          <input className={inputClass + " mt-1"} maxLength={80} value={profile.region}
                            onChange={(e) => patch({ region: e.target.value })} /></label>
                        <label className="text-xs text-neutral-400">Primary domain
                          <input className={inputClass + " mt-1"} maxLength={80} value={profile.primaryDomain}
                            onChange={(e) => patch({ primaryDomain: e.target.value })} /></label>
                        <label className="text-xs text-neutral-400">Years active
                          <input className={inputClass + " mt-1"} maxLength={20} value={profile.yearsActive}
                            onChange={(e) => patch({ yearsActive: e.target.value })} /></label>
                      </div>
                      <label className="block text-xs text-neutral-400">Tagline
                        <input className={inputClass + " mt-1"} maxLength={120} value={profile.tagline}
                          onChange={(e) => patch({ tagline: e.target.value })} /></label>
                      <label className="block text-xs text-neutral-400">About your work
                        <textarea className={inputClass + " mt-1"} rows={5} maxLength={1600} value={profile.about}
                          onChange={(e) => patch({ about: e.target.value })} /></label>
                    </> : profile.about
                      ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">{profile.about}</p>
                      : <EmptySection>Tell collaborators what you build, how you work, and what you would like to make next.</EmptySection>}
                  </section>
                  <section className={panelClass + " space-y-3"}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-noema-lime">Contributions</h2>
                      <span className="text-[10px] text-neutral-500">{profile.contributions.length} entries</span>
                    </div>
                    {profile.contributions.length === 0 && <EmptySection>Document releases, repairs, research, community contributions and milestones here.</EmptySection>}
                    {profile.contributions.map((entry) => <article key={entry.id} className="relative border-l-2 border-noema-lime/45 pl-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white">{entry.title}</h3>
                        {editing && <button type="button" className="text-xs text-rose-300" onClick={() => patch({
                          contributions: profile.contributions.filter((item) => item.id !== entry.id) })}>Remove</button>}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-neutral-400">{entry.summary}</p>
                      <p className="mt-1 text-[10px] text-neutral-500">{new Date(entry.date).toLocaleDateString()}</p>
                      {entry.url && verifiedHttpsUrl(entry.url) &&
                        <a href={verifiedHttpsUrl(entry.url)} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-noema-lime underline">Evidence</a>}
                    </article>)}
                    {editing && <div className="space-y-2 border-t border-noema-border pt-3">
                      <h3 className="text-xs font-semibold text-neutral-300">Record a contribution</h3>
                      <input className={inputClass} placeholder="Milestone or contribution" value={contributionDraft.title}
                        maxLength={100} onChange={(e) => setContributionDraft((v) => ({ ...v, title: e.target.value }))} />
                      <textarea className={inputClass} rows={2} placeholder="What changed? What did you learn?" maxLength={500}
                        value={contributionDraft.summary} onChange={(e) => setContributionDraft((v) => ({ ...v, summary: e.target.value }))} />
                      <input className={inputClass} placeholder="Optional HTTPS evidence" value={contributionDraft.url}
                        onChange={(e) => setContributionDraft((v) => ({ ...v, url: e.target.value }))} />
                      <button type="button" onClick={addContribution} className={outlineButton}>Add contribution to draft</button>
                    </div>}
                  </section>
                  <section className={panelClass + " space-y-2"}>
                    <h2 className="text-sm font-semibold text-noema-lime">Contact & data ownership</h2>
                    <div className="flex flex-wrap gap-2">
                      <Link href="/identity" className={primaryButton + " inline-flex items-center gap-2"}>
                        <Icon icon="solar:devices-linear" aria-hidden="true" />
                        Identity & Devices
                      </Link>
                      <Link href="/connect" className={outlineButton + " inline-flex items-center gap-2"}>
                        <Icon icon="solar:link-round-linear" aria-hidden="true" />
                        Contact inbox
                      </Link>
                    </div>
                    <p className="text-[11px] leading-5 text-neutral-500">
                      Your profile is currently stored on this browser only. Identity & Devices prepares independent
                      registration and account pairing but does not publish or synchronise profile data.
                    </p>
                    <p className="text-xs leading-5 text-neutral-400">
                      The local-first approach from RADIX is preserved. Your profile is not public or encrypted by the API Lockbox.
                      It can be lost when browser data is cleared. Export a JSON backup to retain a private copy.
                    </p>
                    <button type="button" className={outlineButton} onClick={exportSaved}>
                      <Icon icon="solar:download-minimalistic-linear" className="mr-1 inline" aria-hidden="true" /> Export saved profile
                    </button>
                  </section>
                </>}

                {activeTab === "bench" && <>
                  <TabButtons label="Build status" value={archivedView ? "archive" : "active"}
                    onChange={(v) => setArchivedView(v === "archive")}
                    items={[{ id: "active", label: "On the bench (" + activeCount + ")" },
                      { id: "archive", label: "Archive (" + (profile.builds.length - activeCount) + ")" }]} />
                  {filteredBuilds.length === 0 && <EmptySection>
                    {archivedView ? "No archived projects yet." : "This is your working bench. Add an experiment, prototype or released project."}
                  </EmptySection>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {filteredBuilds.map((build) => <article key={build.id} className={panelClass + " min-w-0 space-y-2"}>
                      {build.imageData && <div className="relative h-36 overflow-hidden rounded-lg bg-[#171719]">
                        <Image src={build.imageData} alt={"Project image: " + build.title} fill sizes="(max-width: 640px) 100vw, 350px"
                          className="object-cover" unoptimized />
                      </div>}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] uppercase tracking-widest text-noema-gold">{build.status}</span>
                        {build.openToCollaborate && <span className="text-[10px] text-noema-lime">Collaborators welcome</span>}
                      </div>
                      <h2 className="break-words text-sm font-semibold text-white">{build.title}</h2>
                      <p className="whitespace-pre-wrap break-words text-xs leading-5 text-neutral-400">{build.summary}</p>
                      <TaggedItems items={build.tags} />
                      {build.url && verifiedHttpsUrl(build.url) &&
                        <a href={verifiedHttpsUrl(build.url)} target="_blank" rel="noopener noreferrer"
                          className="inline-block break-all text-xs text-noema-lime underline">View work</a>}
                      {editing && <div className="flex flex-wrap gap-2 border-t border-noema-border pt-2">
                        <button type="button" className={outlineButton} onClick={() => editBuild(build)}>Edit</button>
                        <button type="button" className={outlineButton}
                          onClick={() => setArchived(build.id, !Boolean(build.archived))}>
                          {build.archived ? "Restore" : "Archive"}
                        </button>
                        <button type="button" className={outlineButton + " text-rose-300"}
                          onClick={() => patch({ builds: profile.builds.filter((item) => item.id !== build.id) })}>Remove</button>
                      </div>}
                    </article>)}
                  </div>
                  {editing && <section className={panelClass + " space-y-2"}>
                    <h2 className="text-sm font-semibold text-noema-lime">{buildDraft.id ? "Edit project" : "Add a project"}</h2>
                    <input className={inputClass} placeholder="Project title" value={buildDraft.title} maxLength={100}
                      onChange={(e) => setBuildDraft((v) => ({ ...v, title: e.target.value }))} />
                    <textarea className={inputClass} rows={3} maxLength={700} placeholder="What are you building or testing?"
                      value={buildDraft.summary} onChange={(e) => setBuildDraft((v) => ({ ...v, summary: e.target.value }))} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-neutral-400">Stage
                        <select className={inputClass + " mt-1"} value={buildDraft.status}
                          onChange={(e) => setBuildDraft((v) => ({ ...v, status: e.target.value as BuildStatus }))}>
                          <option value="designing">Designing</option><option value="prototyping">Prototyping</option>
                          <option value="testing">Testing</option><option value="released">Released</option>
                        </select></label>
                      <label className="text-xs text-neutral-400">Topics (comma-separated)
                        <input className={inputClass + " mt-1"} value={buildDraft.tags}
                          onChange={(e) => setBuildDraft((v) => ({ ...v, tags: e.target.value }))} /></label>
                    </div>
                    <input className={inputClass} type="url" placeholder="Optional HTTPS repository or demo URL"
                      value={buildDraft.url} onChange={(e) => setBuildDraft((v) => ({ ...v, url: e.target.value }))} />
                    <label className="block text-xs text-neutral-400">Project thumbnail (optional, optimised locally)
                      <input className="mt-1 block w-full text-xs" type="file" accept="image/png,image/jpeg,image/webp"
                        disabled={imageBusy} onChange={(e) => { void uploadBuildImage(e.target.files?.[0]); e.target.value = ""; }} /></label>
                    <div className="flex flex-wrap gap-4 text-xs text-neutral-300">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={buildDraft.openToCollaborate}
                          onChange={(e) => setBuildDraft((v) => ({ ...v, openToCollaborate: e.target.checked }))} />
                        Open to collaboration
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={buildDraft.archived}
                          onChange={(e) => setBuildDraft((v) => ({ ...v, archived: e.target.checked }))} />
                        Archived
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={primaryButton} onClick={addOrUpdateBuild}>
                        {buildDraft.id ? "Update project" : "Add project to draft"}
                      </button>
                      {buildDraft.id && <button type="button" className={outlineButton}
                        onClick={() => setBuildDraft({ ...EMPTY_BUILD })}>Cancel project edit</button>}
                    </div>
                  </section>}
                </>}

                {activeTab === "skills" && <>
                  <TabButtons value={skillTab} onChange={setSkillTab} label="Capabilities"
                    items={[{ id: "proficiencies", label: "Proficiency" },
                      { id: "inventory", label: "Inventory" }, { id: "tools", label: "Domains" }]} />
                  {skillTab === "proficiencies" && <section className={panelClass + " space-y-3"}>
                    <h2 className="text-sm font-semibold text-noema-lime">Technical proficiency</h2>
                    <p className="text-xs text-neutral-500">Self-described skill levels, not verified credentials.</p>
                    {profile.proficiencies.length === 0 && <EmptySection>List the disciplines you work in and your current proficiency.</EmptySection>}
                    {profile.proficiencies.map((item) => <div key={item.id} className="rounded-lg border border-noema-border bg-black/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{item.field}</span>
                        <span className="text-[10px] uppercase tracking-wide text-noema-gold">{item.level}</span>
                      </div>
                      {item.details && <p className="mt-2 text-xs leading-5 text-neutral-400">{item.details}</p>}
                      {editing && <button type="button" className="mt-2 text-xs text-rose-300" onClick={() => patch({
                        proficiencies: profile.proficiencies.filter((entry) => entry.id !== item.id) })}>Remove</button>}
                    </div>)}
                    {editing && <div className="space-y-2 border-t border-noema-border pt-3">
                      <input className={inputClass} placeholder="Skill or field" value={proficiencyDraft.field}
                        onChange={(e) => setProficiencyDraft((v) => ({ ...v, field: e.target.value }))} />
                      <select className={inputClass} value={proficiencyDraft.level}
                        onChange={(e) => setProficiencyDraft((v) => ({ ...v, level: e.target.value as ProficiencyLevel }))}>
                        <option value="novice">Novice</option><option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option><option value="expert">Expert</option>
                      </select>
                      <input className={inputClass} placeholder="Optional notes" value={proficiencyDraft.details}
                        onChange={(e) => setProficiencyDraft((v) => ({ ...v, details: e.target.value }))} />
                      <button type="button" className={outlineButton} onClick={addProficiency}>Add proficiency to draft</button>
                    </div>}
                  </section>}
                  {skillTab === "inventory" && <section className={panelClass + " space-y-3"}>
                    <h2 className="text-sm font-semibold text-noema-lime">Lab & hardware inventory</h2>
                    <p className="text-xs text-neutral-500">Only list equipment you choose to disclose. No automatic device discovery.</p>
                    {profile.inventory.length === 0 && <EmptySection>Showcase the tools, workstations or machines available for collaboration.</EmptySection>}
                    {profile.inventory.map((item) => <div key={item.id} className="rounded-lg border border-noema-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold">{item.name}</h3>
                        <span className="text-[10px] text-noema-gold">{item.category}</span>
                      </div>
                      {item.specifications && <p className="mt-1 text-xs text-neutral-400">{item.specifications}</p>}
                      {editing && <button type="button" className="mt-2 text-xs text-rose-300"
                        onClick={() => patch({ inventory: profile.inventory.filter((entry) => entry.id !== item.id) })}>Remove</button>}
                    </div>)}
                    {editing && <div className="space-y-2 border-t border-noema-border pt-3">
                      <input className={inputClass} placeholder="Equipment name" value={inventoryDraft.name}
                        onChange={(e) => setInventoryDraft((v) => ({ ...v, name: e.target.value }))} />
                      <input className={inputClass} placeholder="Category (e.g. electronics)" value={inventoryDraft.category}
                        onChange={(e) => setInventoryDraft((v) => ({ ...v, category: e.target.value }))} />
                      <textarea className={inputClass} rows={2} placeholder="Specifications / capability" value={inventoryDraft.specifications}
                        onChange={(e) => setInventoryDraft((v) => ({ ...v, specifications: e.target.value }))} />
                      <button type="button" className={outlineButton} onClick={addInventory}>Add equipment to draft</button>
                    </div>}
                  </section>}
                  {skillTab === "tools" && <section className={panelClass + " space-y-4"}>
                    <div>
                      <h2 className="mb-2 text-sm font-semibold text-noema-lime">Domains</h2>
                      {profile.disciplines.length > 0 ? <TaggedItems items={profile.disciplines} />
                        : <EmptySection>Your technical domains will appear here.</EmptySection>}
                      {editing && <label className="mt-3 block text-xs text-neutral-400">Comma-separated fields
                        <textarea rows={2} className={inputClass + " mt-1"} value={disciplinesText}
                          onChange={(e) => { setDisciplinesText(e.target.value); patch({ disciplines: splitWorkshopTags(e.target.value) }); }} /></label>}
                    </div>
                    <div>
                      <h2 className="mb-2 text-sm font-semibold text-noema-lime">Tools & technologies</h2>
                      {profile.tools.length > 0 ? <TaggedItems items={profile.tools} />
                        : <EmptySection>List the software, instruments and tools you use.</EmptySection>}
                      {editing && <label className="mt-3 block text-xs text-neutral-400">Comma-separated tools
                        <textarea rows={2} className={inputClass + " mt-1"} value={toolsText}
                          onChange={(e) => { setToolsText(e.target.value); patch({ tools: splitWorkshopTags(e.target.value) }); }} /></label>}
                    </div>
                  </section>}
                </>}

                {activeTab === "media" && <section className={panelClass + " space-y-3"}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-noema-lime">Media gallery</h2>
                    <span className="text-[10px] text-neutral-500">{profile.gallery.length} / 12</span>
                  </div>
                  <p className="text-xs leading-5 text-neutral-400">
                    Lightweight image-only gallery. NOEMA resizes photos in the browser and strips camera metadata.
                    No 3D viewer, WebGL or background image-processing packages.
                  </p>
                  {profile.gallery.length === 0 && <EmptySection>Photographs of prototypes, equipment and progress will appear here.</EmptySection>}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {profile.gallery.map((item) => <figure key={item.id} className="min-w-0 overflow-hidden rounded-lg border border-noema-border bg-black/40">
                      <div className="relative aspect-square">
                        <Image src={item.imageData} fill alt={item.caption || "Workshop photo"}
                          sizes="(max-width: 640px) 45vw, 220px" className="object-cover" unoptimized />
                      </div>
                      <figcaption className="break-words p-2 text-[11px] text-neutral-300">{item.caption || "Untitled image"}</figcaption>
                      {editing && <button type="button" className="px-2 pb-2 text-xs text-rose-300" onClick={() => patch({
                        gallery: profile.gallery.filter((photo) => photo.id !== item.id) })}>Remove</button>}
                    </figure>)}
                  </div>
                  {editing && <div className="space-y-2 border-t border-noema-border pt-3">
                    <input className={inputClass} placeholder="Optional photo caption" value={mediaCaption}
                      maxLength={120} onChange={(e) => setMediaCaption(e.target.value)} />
                    <label className="block text-xs text-neutral-400">Add photo (JPEG, PNG or WebP, max 4 MB input)
                      <input className="mt-2 block w-full text-xs" type="file" accept="image/jpeg,image/png,image/webp"
                        disabled={imageBusy || profile.gallery.length >= 12}
                        onChange={(e) => { void uploadGallery(e.target.files?.[0]); e.target.value = ""; }} /></label>
                  </div>}
                </section>}

                {activeTab === "links" && <section className={panelClass + " space-y-3"}>
                  <h2 className="text-sm font-semibold text-noema-lime">Active in & external presence</h2>
                  <p className="text-xs leading-5 text-neutral-400">
                    Repositories, published documentation, maker communities, technical articles and demos.
                    External accounts are self-declared, not verified.
                  </p>
                  {profile.links.length === 0 && <EmptySection>No external work links yet.</EmptySection>}
                  {profile.links.map((entry) => <div key={entry.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-noema-border bg-black/35 p-3">
                    <a href={verifiedHttpsUrl(entry.url)} target="_blank" rel="noopener noreferrer"
                      className="min-w-0 truncate text-sm text-neutral-200 underline underline-offset-2">{entry.label}</a>
                    <div className="flex shrink-0 items-center gap-3">
                      <Icon icon="solar:arrow-right-up-linear" className="text-noema-lime" aria-hidden="true" />
                      {editing && <button type="button" className="text-xs text-rose-300"
                        onClick={() => patch({ links: profile.links.filter((item) => item.id !== entry.id) })}>Remove</button>}
                    </div>
                  </div>)}
                  {editing && <div className="space-y-2 border-t border-noema-border pt-3">
                    <input className={inputClass} placeholder="Platform or link label" maxLength={60}
                      value={linkDraft.label} onChange={(e) => setLinkDraft((v) => ({ ...v, label: e.target.value }))} />
                    <input className={inputClass} type="url" placeholder="https://..." value={linkDraft.url}
                      onChange={(e) => setLinkDraft((v) => ({ ...v, url: e.target.value }))} />
                    <button type="button" className={outlineButton} onClick={addLink}>Add external link</button>
                  </div>}
                  <p className="text-[11px] leading-5 text-neutral-500">
                    Collaboration requests, social feeds, public search and verified endorsements are deferred until secure identity and publishing permissions exist.
                  </p>
                </section>}
                {editing && <p className="text-center text-[11px] text-noema-gold">Draft changes are private and are not retained until you press Save above.</p>}
              </div>
            </>
          )}
        </div>
      </div>
      {cropRequest && <WorkshopImageCropper
        key={cropRequest.file.name + cropRequest.file.lastModified + cropRequest.target}
        file={cropRequest.file} target={cropRequest.target}
        onSave={saveConfirmedCrop} onCancel={() => setCropRequest(null)}
      />}
    </main>
  );
}

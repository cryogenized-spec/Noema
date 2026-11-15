"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { NEW_WORKSHOP_PROFILE, type BuildStatus, type WorkshopProfile } from "@/types/profile";

type ProfileTab = "workbench" | "expertise" | "connections";
type DraftBuild = { title: string; summary: string; status: BuildStatus; tags: string; url: string };

const EMPTY_BUILD: DraftBuild = { title: "", summary: "", status: "prototyping", tags: "", url: "" };
const splitTags = (raw: string) => [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))].slice(0, 24);
const cleanHttps = (raw: string): string => {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch { return ""; }
};
const fallbackName = (alias: string) => (alias.trim() ? alias.trim().slice(0, 1).toUpperCase() : "?");

export function WorkshopProfileScreen() {
  const [profile, setProfile] = useState<WorkshopProfile>({ ...NEW_WORKSHOP_PROFILE });
  const [saved, setSaved] = useState<WorkshopProfile>({ ...NEW_WORKSHOP_PROFILE });
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("workbench");
  const [newBuild, setNewBuild] = useState<DraftBuild>(EMPTY_BUILD);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    void db.profiles.get("self")
      .then((stored) => {
        if (!mounted) return;
        const initial = stored ? { ...NEW_WORKSHOP_PROFILE, ...stored } : { ...NEW_WORKSHOP_PROFILE };
        setProfile(initial); setSaved(initial); setReady(true);
      })
      .catch(() => { if (mounted) { setNotice("Local storage is unavailable; changes cannot be saved."); setReady(true); } });
    return () => { mounted = false; };
  }, []);

  const patch = (change: Partial<WorkshopProfile>) => setProfile((current) => ({ ...current, ...change }));
  const save = async () => {
    try {
      const next = { ...profile, alias: profile.alias.trim().slice(0, 50),
        handle: profile.handle.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30),
        updatedAt: new Date().toISOString() };
      await db.profiles.put(next);
      setProfile(next); setSaved(next); setEditing(false); setNotice("Saved privately on this device.");
    } catch { setNotice("Save failed. Check the browser's storage settings."); }
  };
  const upload = (type: "avatarImage" | "bannerImage", file?: File) => {
    if (!file) return;
    const maxBytes = type === "avatarImage" ? 250_000 : 500_000;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > maxBytes) {
      setNotice(`Use PNG, JPEG or WebP below ${Math.floor(maxBytes / 1000)} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") patch({ [type]: reader.result }); };
    reader.onerror = () => setNotice("Could not read the selected image.");
    reader.readAsDataURL(file);
  };
  const addBuild = () => {
    if (!newBuild.title.trim()) { setNotice("Give the build a title."); return; }
    if (newBuild.url && !cleanHttps(newBuild.url)) { setNotice("Build links must be valid HTTPS URLs."); return; }
    const entry = { id: crypto.randomUUID(), title: newBuild.title.trim().slice(0, 100),
      summary: newBuild.summary.trim().slice(0, 500), status: newBuild.status,
      tags: splitTags(newBuild.tags), url: cleanHttps(newBuild.url), updatedAt: new Date().toISOString() };
    patch({ builds: [entry, ...profile.builds] });
    setNewBuild(EMPTY_BUILD); setNotice("Build added to draft. Save profile to retain it.");
  };
  const addLink = () => {
    const url = cleanHttps(linkUrl);
    if (!linkLabel.trim() || !url) { setNotice("Enter a label and a valid HTTPS URL."); return; }
    patch({ links: [...profile.links, { id: crypto.randomUUID(), label: linkLabel.trim().slice(0, 50), url }] });
    setLinkLabel(""); setLinkUrl(""); setNotice("Link added to draft. Save to retain it.");
  };
  const field = "w-full rounded-lg border border-noema-border bg-black/70 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-noema-lime focus:outline-none";
  const section = "rounded-xl border border-noema-border bg-[#111113] p-4 sm:p-5";
  const isOpen = profile.collaboration === "open";

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 pb-12 pt-5 text-white sm:px-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 text-sm text-neutral-300 hover:text-noema-lime">
          <Icon icon="solar:arrow-left-linear" aria-hidden="true" /> NOEMA / Workshop
        </Link>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button type="button" className="rounded-lg border border-noema-border px-4 py-2 text-xs text-neutral-300"
                onClick={() => { setProfile(saved); setEditing(false); setNotice(""); }}>Cancel</button>
              <button type="button" className="rounded-lg bg-noema-lime px-4 py-2 text-xs font-semibold text-black"
                onClick={() => void save()}>Save profile</button>
            </>
          ) : <button type="button" onClick={() => setEditing(true)}
              className="rounded-lg border border-noema-border px-4 py-2 text-xs text-white hover:border-noema-lime">
              <Icon icon="solar:pen-bold" className="mr-1 inline" aria-hidden="true" /> Edit profile
            </button>}
        </div>
      </header>
      <p className="mb-4 rounded-lg border border-noema-gold/25 bg-[#1c1610] px-4 py-3 text-xs leading-5 text-neutral-300">
        <span className="font-semibold text-noema-gold">Private workshop draft.</span> This profile is saved only in this browser. It is not published, searchable, verified, or shared with contacts yet.
      </p>
      {notice && <p role="status" className="mb-3 text-xs text-noema-lime">{notice}</p>}
      {!ready ? <p className="text-sm text-neutral-400">Loading your local workshop...</p> : (
        <>
          <div className="overflow-hidden rounded-xl border border-noema-border bg-[#111113]">
            <div className="relative h-36 overflow-hidden bg-gradient-to-tr from-[#18121d] via-[#1c2020] to-[#292316] sm:h-52">
              {profile.bannerImage && <Image src={profile.bannerImage} alt="Workshop banner" fill sizes="(max-width: 640px) 100vw, 960px" className="object-cover" unoptimized />}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-black/50"/>
              {editing && <label className="absolute right-3 top-3 cursor-pointer rounded-lg border border-white/25 bg-black/80 px-3 py-2 text-xs">
                Replace banner <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => upload("bannerImage", event.target.files?.[0])}/>
              </label>}
            </div>
            <div className="relative px-5 pb-5 sm:px-7">
              <div className="-mt-10 flex items-end justify-between gap-3">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-[#111113] bg-[#252326] text-4xl font-bold text-noema-lime sm:h-28 sm:w-28">
                  {profile.avatarImage ? <Image src={profile.avatarImage} alt="Your profile avatar" fill sizes="112px" unoptimized className="object-cover"/> : fallbackName(profile.alias)}
                </div>
                <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isOpen ? "border-noema-lime/40 text-noema-lime" : "border-noema-border text-neutral-400"}`}>
                  {profile.collaboration === "open" ? "Open to collaborate" : profile.collaboration === "selective" ? "Selective collaborations" : "Not taking collaborations"}
                </span>
              </div>
              {editing && <label className="mt-2 block text-xs text-neutral-400">Circle avatar (max 250 KB)
                <input type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full text-xs text-neutral-300"
                  onChange={(event) => upload("avatarImage", event.target.files?.[0])}/>
              </label>}
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{profile.alias || "Your workshop identity"}</h1>
              <p className="mt-1 text-sm text-neutral-400">{profile.handle ? `@${profile.handle}` : "@your-handle"} {profile.region && `· ${profile.region}`}</p>
              {profile.tagline && <p className="mt-3 text-sm text-neutral-200">{profile.tagline}</p>}
              {profile.about && <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-neutral-300">{profile.about}</p>}
            </div>
          </div>
          {editing && (
            <section className={`${section} mt-4 space-y-3`}>
              <h2 className="text-sm font-semibold text-noema-lime">Identity & collaboration</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-neutral-400">Display name<input className={`${field} mt-1`} maxLength={50} value={profile.alias} onChange={(e) => patch({ alias: e.target.value })}/></label>
                <label className="text-xs text-neutral-400">Handle<input className={`${field} mt-1`} maxLength={30} value={profile.handle} onChange={(e) => patch({ handle: e.target.value })}/></label>
                <label className="text-xs text-neutral-400">Region (optional)<input className={`${field} mt-1`} maxLength={80} value={profile.region} onChange={(e) => patch({ region: e.target.value })}/></label>
                <label className="text-xs text-neutral-400">Collaboration availability
                  <select className={`${field} mt-1`} value={profile.collaboration} onChange={(e) => patch({ collaboration: e.target.value as WorkshopProfile["collaboration"] })}>
                    <option value="open">Open to collaborate</option><option value="selective">Selective</option><option value="unavailable">Not taking collaborations</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs text-neutral-400">Tagline<input className={`${field} mt-1`} maxLength={120} value={profile.tagline} onChange={(e) => patch({ tagline: e.target.value })}/></label>
              <label className="block text-xs text-neutral-400">About your work<textarea className={`${field} mt-1`} rows={4} maxLength={1200} value={profile.about} onChange={(e) => patch({ about: e.target.value })}/></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-neutral-400">Disciplines (comma-separated)<input className={`${field} mt-1`} value={profile.disciplines.join(", ")} onChange={(e) => patch({ disciplines: splitTags(e.target.value) })}/></label>
                <label className="text-xs text-neutral-400">Tools & technologies<input className={`${field} mt-1`} value={profile.tools.join(", ")} onChange={(e) => patch({ tools: splitTags(e.target.value) })}/></label>
              </div>
            </section>
          )}
          <nav className="mt-5 flex gap-2 border-b border-noema-border pb-3" aria-label="Workshop sections">
            {([["workbench","On the bench"],["expertise","Capabilities"],["connections","Connections"]] as const).map(([key,label]) => (
              <button key={key} type="button" aria-current={tab === key ? "page" : undefined}
                className={`rounded-lg px-4 py-2 text-xs transition ${tab === key ? "bg-noema-lime text-black" : "bg-[#141416] text-neutral-400 hover:text-white"}`}
                onClick={() => setTab(key)}>{label}</button>
            ))}
          </nav>
          {tab === "workbench" && <section className="mt-4 space-y-3">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold tracking-wide text-neutral-200">Projects and working prototypes</h2><span className="text-xs text-neutral-500">{profile.builds.length} builds</span></div>
            {profile.builds.length === 0 && <div className={section}><p className="text-sm text-neutral-400">Your workshop is empty. Add something in progress, a tested prototype, or a released build. Progress matters more than polished announcements.</p></div>}
            <div className="grid gap-3 sm:grid-cols-2">
              {profile.builds.map((build) => <article key={build.id} className={section}>
                <div className="mb-3 flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-widest text-noema-gold">{build.status}</span>
                  {editing && <button type="button" className="text-xs text-rose-300" onClick={() => patch({ builds: profile.builds.filter((item) => item.id !== build.id) })}>Remove</button>}
                </div>
                <h3 className="text-base font-semibold">{build.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-400">{build.summary || "No summary yet."}</p>
                <div className="mt-4 flex flex-wrap gap-1">{build.tags.map((tag) => <span key={tag} className="rounded border border-noema-border px-2 py-1 text-[10px] text-neutral-300">{tag}</span>)}</div>
                {build.url && <a href={cleanHttps(build.url)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs text-noema-lime underline">View build evidence</a>}
              </article>)}
            </div>
            {editing && <div className={`${section} space-y-3`}>
              <h3 className="text-sm font-semibold text-noema-lime">Add a build</h3>
              <input className={field} placeholder="Project title" maxLength={100} value={newBuild.title} onChange={(e) => setNewBuild((v) => ({...v,title:e.target.value}))}/>
              <textarea className={field} rows={3} maxLength={500} placeholder="What did you build, test or learn?" value={newBuild.summary} onChange={(e) => setNewBuild((v) => ({...v,summary:e.target.value}))}/>
              <div className="grid gap-2 sm:grid-cols-2">
                <select className={field} value={newBuild.status} onChange={(e) => setNewBuild((v) => ({...v,status:e.target.value as BuildStatus}))}>
                  <option value="designing">Designing</option><option value="prototyping">Prototyping</option><option value="testing">Testing</option><option value="released">Released</option>
                </select>
                <input className={field} placeholder="Tags, separated by commas" value={newBuild.tags} onChange={(e) => setNewBuild((v) => ({...v,tags:e.target.value}))}/>
              </div>
              <input className={field} type="url" placeholder="Optional HTTPS repository / build URL" value={newBuild.url} onChange={(e) => setNewBuild((v) => ({...v,url:e.target.value}))}/>
              <button type="button" className="rounded-lg border border-noema-lime/40 px-4 py-2 text-xs text-noema-lime" onClick={addBuild}>Add to draft</button>
            </div>}
          </section>}
          {tab === "expertise" && <section className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={section}><h2 className="mb-3 text-sm font-semibold text-noema-lime">Disciplines & proficiencies</h2><div className="flex flex-wrap gap-2">{profile.disciplines.map((item) => <span key={item} className="rounded-lg border border-noema-border px-3 py-2 text-xs">{item}</span>)}{profile.disciplines.length===0 && <p className="text-xs text-neutral-500">Add your fields of expertise while editing.</p>}</div></div>
            <div className={section}><h2 className="mb-3 text-sm font-semibold text-noema-lime">Tools & technologies</h2><div className="flex flex-wrap gap-2">{profile.tools.map((item) => <span key={item} className="rounded-lg border border-noema-border px-3 py-2 text-xs">{item}</span>)}{profile.tools.length===0 && <p className="text-xs text-neutral-500">Your tools and technical stack will appear here.</p>}</div></div>
          </section>}
          {tab === "connections" && <section className="mt-4 space-y-3">
            <div className={section}><h2 className="text-sm font-semibold text-noema-lime">Proof of work & links</h2><p className="mt-2 text-xs text-neutral-400">Connect work repositories, technical write-ups and public demonstrations. No follower counts, badges or unverified reputation claims.</p>
              <div className="mt-4 space-y-2">{profile.links.map((link) => <div key={link.id} className="flex items-center justify-between gap-2 rounded-lg border border-noema-border bg-black/30 p-3">
                <a href={cleanHttps(link.url)} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm text-neutral-200 underline underline-offset-4">{link.label}</a>
                {editing && <button type="button" className="text-xs text-rose-300" onClick={() => patch({ links: profile.links.filter((item) => item.id !== link.id) })}>Remove</button>}
              </div>)}{profile.links.length === 0 && <p className="text-sm text-neutral-500">No links added.</p>}</div>
              {editing && <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <input className={field} placeholder="Link label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)}/>
                <input className={field} placeholder="https://..." type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}/>
                <button type="button" className="rounded-lg border border-noema-lime/40 px-4 py-2 text-xs text-noema-lime" onClick={addLink}>Add link to draft</button>
              </div>}
            </div>
            <p className="text-xs text-neutral-500">Discoverability, direct collaboration requests, public project feeds, selective sharing and account verification remain future milestones.</p>
          </section>}
        </>
      )}
    </main>
  );
}

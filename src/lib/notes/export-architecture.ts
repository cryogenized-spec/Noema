import { buildNoteFilename } from "@/lib/notes/conversion";
import { renderNoteWithFrontmatter } from "@/lib/notes/frontmatter";
import type { CanonicalMarkdownNote, RenderedMarkdownNote } from "@/types/notes";

export interface VaultLayoutConfig {
  notesDir: string;
  assetsDir: string;
}

export interface PlannedExportFile {
  path: string;
  content: string;
}

export const DEFAULT_VAULT_LAYOUT: VaultLayoutConfig = {
  notesDir: "Notes",
  assetsDir: "Assets",
};

export function renderCanonicalNote(note: CanonicalMarkdownNote): RenderedMarkdownNote {
  return {
    filename: buildNoteFilename(note),
    markdown: renderNoteWithFrontmatter(note),
  };
}

export function planVaultExport(
  notes: CanonicalMarkdownNote[],
  layout: VaultLayoutConfig = DEFAULT_VAULT_LAYOUT,
): { layout: VaultLayoutConfig; files: PlannedExportFile[] } {
  return {
    layout,
    files: notes.map((note) => {
      const rendered = renderCanonicalNote(note);
      return {
        path: `${layout.notesDir}/${rendered.filename}`,
        content: rendered.markdown,
      };
    }),
  };
}

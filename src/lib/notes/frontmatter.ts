import type { CanonicalMarkdownNote, CanonicalNoteFrontmatter } from "@/types/notes";

const sanitizeYamlString = (value: string) => value.replace(/"/g, '\\"');

const formatYamlValue = (value: string | string[]) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => `"${sanitizeYamlString(item)}"`).join(", ")}]`;
  }

  return `"${sanitizeYamlString(value)}"`;
};

export function buildDefaultFrontmatter(note: CanonicalMarkdownNote): CanonicalNoteFrontmatter {
  return {
    title: note.title,
    created: note.createdAt,
    updated: note.updatedAt,
    tags: note.tags,
    ...note.frontmatter,
  };
}

export function serializeFrontmatter(frontmatter: CanonicalNoteFrontmatter): string {
  const entries = Object.entries(frontmatter).filter(([, value]) => {
    if (value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    return value.length > 0;
  });

  if (entries.length === 0) return "";

  const body = entries
    .map(([key, value]) => `${key}: ${formatYamlValue(value as string | string[])}`)
    .join("\n");

  return `---\n${body}\n---\n`;
}

export function renderNoteWithFrontmatter(note: CanonicalMarkdownNote): string {
  const frontmatter = serializeFrontmatter(buildDefaultFrontmatter(note));
  const body = note.body.trim();
  return `${frontmatter}${frontmatter ? "\n" : ""}${body}\n`;
}

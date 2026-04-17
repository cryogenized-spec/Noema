export const MARKDOWN_STORAGE_CONTRACT = {
  canonicalFormat: "markdown",
  allowRawHtml: false,
} as const;

export const normalizeMarkdownSource = (input: string) => input.replace(/\r\n/g, "\n").trim();

export const transformObsidianTokens = (input: string): string => {
  return input
    .replace(/!\[\[([^\]]+)\]\]/g, (_match, target) => `![Embedded: ${target}](noema://embed/${encodeURIComponent(target)})`)
    .replace(/\[\[([^\]]+)\]\]/g, (_match, target) => {
      const label = String(target).split("|")[0].trim();
      return `[${label}](noema://wikilink/${encodeURIComponent(label)})`;
    });
};

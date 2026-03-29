export interface CanonicalNoteFrontmatter {
  title?: string;
  created?: string;
  updated?: string;
  tags?: string[];
  [key: string]: string | string[] | undefined;
}

export interface CanonicalMarkdownNote {
  id?: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  frontmatter?: CanonicalNoteFrontmatter;
  source?: {
    type: "single_message" | "message_selection" | "manual";
    messageIds?: number[];
  };
}

export interface RenderedMarkdownNote {
  filename: string;
  markdown: string;
}

export type MarkdownHelperAction =
  | "heading"
  | "bold"
  | "italic"
  | "bullet"
  | "checklist"
  | "blockquote"
  | "codeblock"
  | "link"
  | "hr";

interface InsertInput {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  action: MarkdownHelperAction;
}

interface InsertOutput {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const selectedText = (value: string, start: number, end: number) => value.slice(start, end);

const wrap = (value: string, start: number, end: number, prefix: string, suffix: string): InsertOutput => {
  const selected = selectedText(value, start, end);
  const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
  const cursorStart = start + prefix.length;
  const cursorEnd = cursorStart + selected.length;

  return {
    value: next,
    selectionStart: selected.length > 0 ? cursorStart : cursorStart,
    selectionEnd: selected.length > 0 ? cursorEnd : cursorStart,
  };
};

export const applyMarkdownInsertion = ({ value, selectionStart, selectionEnd, action }: InsertInput): InsertOutput => {
  const selected = selectedText(value, selectionStart, selectionEnd);
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);

  switch (action) {
    case "heading": {
      const token = "## ";
      const insertion = selected || "Heading";
      const next = `${before}${token}${insertion}${after}`;
      return {
        value: next,
        selectionStart: before.length + token.length,
        selectionEnd: before.length + token.length + insertion.length,
      };
    }
    case "bold":
      return wrap(value, selectionStart, selectionEnd, "**", "**");
    case "italic":
      return wrap(value, selectionStart, selectionEnd, "*", "*");
    case "bullet": {
      const insertion = selected || "List item";
      const next = `${before}- ${insertion}${after}`;
      return {
        value: next,
        selectionStart: before.length + 2,
        selectionEnd: before.length + 2 + insertion.length,
      };
    }
    case "checklist": {
      const insertion = selected || "Task";
      const next = `${before}- [ ] ${insertion}${after}`;
      return {
        value: next,
        selectionStart: before.length + 6,
        selectionEnd: before.length + 6 + insertion.length,
      };
    }
    case "blockquote": {
      const insertion = selected || "Quote";
      const next = `${before}> ${insertion}${after}`;
      return {
        value: next,
        selectionStart: before.length + 2,
        selectionEnd: before.length + 2 + insertion.length,
      };
    }
    case "codeblock": {
      const insertion = selected || "code";
      const block = `\n\n\`\`\`txt\n${insertion}\n\`\`\`\n\n`;
      const next = `${before}${block}${after}`;
      const start = before.length + 8;
      return {
        value: next,
        selectionStart: start,
        selectionEnd: start + insertion.length,
      };
    }
    case "link": {
      const label = selected || "link text";
      const insertion = `[${label}](https://)`;
      const next = `${before}${insertion}${after}`;
      const urlStart = before.length + label.length + 3;
      return {
        value: next,
        selectionStart: urlStart,
        selectionEnd: urlStart + 8,
      };
    }
    case "hr": {
      const insertion = "\n\n---\n\n";
      const next = `${before}${insertion}${after}`;
      const cursor = before.length + insertion.length;
      return { value: next, selectionStart: cursor, selectionEnd: cursor };
    }
    default:
      return { value, selectionStart, selectionEnd };
  }
};

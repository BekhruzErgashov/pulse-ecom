import * as React from "react";

// Ссылки вида http(s)://... и www.... — этого достаточно для описаний/комментариев в задачах.
const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+)/gi;
const TRAILING_PUNCTUATION = /[.,!?;:]+$/;

/**
 * Рендерит текст, превращая встречающиеся в нём ссылки в кликабельные <a>.
 * Остальной текст остаётся как есть (перенос строк — забота вызывающего
 * компонента, например через `whitespace-pre-wrap`).
 */
export function linkifyText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  const regex = new RegExp(URL_REGEX);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    let url = match[0];
    const trailing = url.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    if (trailing) url = url.slice(0, -trailing.length);

    const href = url.startsWith("www.") ? `https://${url}` : url;
    nodes.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-[var(--color-signal)] underline underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80"
      >
        {url}
      </a>,
    );
    if (trailing) nodes.push(trailing);

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

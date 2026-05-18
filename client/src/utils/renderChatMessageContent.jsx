import { Fragment } from 'react';

const CODE_CLASS =
  'rounded bg-black/20 px-1 py-0.5 font-mono text-[0.92em] dark:bg-white/10';
const LINK_CLASS = 'text-cyan-300 underline underline-offset-2 hover:text-cyan-200';

function pushText(nodes, text, keyBase) {
  if (!text) return;
  nodes.push(<Fragment key={`${keyBase}-t`}>{text}</Fragment>);
}

function renderInline(str, keyBase = 'i') {
  const nodes = [];
  let rest = String(str ?? '');
  let idx = 0;

  const tryPatterns = () => {
    const patterns = [
      {
        re: /^`([^`\n]+)`/,
        fn: (m) => (
          <code key={`${keyBase}-${idx++}`} className={CODE_CLASS}>
            {m[1]}
          </code>
        ),
      },
      {
        re: /^\*\*([^*\n]+)\*\*/,
        fn: (m) => <strong key={`${keyBase}-${idx++}`}>{m[1]}</strong>,
      },
      {
        re: /^\*([^*\n]+)\*/,
        fn: (m) => <em key={`${keyBase}-${idx++}`}>{m[1]}</em>,
      },
      {
        re: /^\[([^\]]+)\]\(([^)\s]+)\)/,
        fn: (m) => (
          <a
            key={`${keyBase}-${idx++}`}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {m[1]}
          </a>
        ),
      },
      {
        re: /^(https?:\/\/[^\s<]+[^\s<.,;:!?)])/i,
        fn: (m) => (
          <a
            key={`${keyBase}-${idx++}`}
            href={m[1]}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {m[1]}
          </a>
        ),
      },
      {
        re: /^@([^\s@]+)/,
        fn: (m) => (
          <span key={`${keyBase}-${idx++}`} className="font-semibold text-cyan-300">
            @{m[1]}
          </span>
        ),
      },
    ];

    for (const { re, fn } of patterns) {
      const m = rest.match(re);
      if (m) {
        nodes.push(fn(m));
        rest = rest.slice(m[0].length);
        return true;
      }
    }
    return false;
  };

  while (rest.length > 0) {
    if (tryPatterns()) continue;
    const next = rest.search(/[`*\[@]|https?:\/\//i);
    const cut = next === -1 ? rest.length : next;
    pushText(nodes, rest.slice(0, cut), `${keyBase}-${idx++}`);
    rest = rest.slice(cut);
  }

  return nodes;
}

/**
 * Hiển thị nội dung chat: **đậm**, *nghiêng*, `mã`, [nhãn](url), @mention, URL thô.
 */
export function ChatMessageTextContent({ text, className = '' }) {
  const raw = String(text ?? '');
  if (!raw) return null;

  return (
    <div className={`whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {renderInline(raw, 'root')}
    </div>
  );
}

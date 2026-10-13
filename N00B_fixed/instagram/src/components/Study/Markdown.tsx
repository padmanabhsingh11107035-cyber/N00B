import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { parseInline, parseMarkdown, type Block, type Inline } from '../../utils/studyMarkdown';

// Draws the tutor's answer. It is built from the parsed structure (never from HTML): text stays text, links are only web addresses, and maths is
// handed to KaTeX as text to draw (KaTeX is fetched the first time a formula appears). Code is shown as code, never run.

const Maths: React.FC<{ tex: string; block?: boolean }> = ({ tex, block }) => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([k]) => {
      const katex = (k as any).default || k;
      if (!alive || !ref.current) return;
      try { katex.render(tex, ref.current, { displayMode: !!block, throwOnError: false, trust: false, strict: 'ignore', maxSize: 12, maxExpand: 600 }); }
      catch { if (ref.current) ref.current.textContent = tex; }
    }).catch(() => { /* the formula stays readable as plain text */ });
    return () => { alive = false; };
  }, [tex, block]);
  return <span ref={ref} style={block ? { display: 'block', overflowX: 'auto', padding: '6px 0', textAlign: 'center' } : undefined} aria-label={tex}>{tex}</span>;
};

const Inl: React.FC<{ nodes: Inline[] }> = ({ nodes }) => (
  <>{nodes.map((n, i) => {
    switch (n.t) {
      case 'text': return <React.Fragment key={i}>{n.v}</React.Fragment>;
      case 'b': return <strong key={i}><Inl nodes={n.c} /></strong>;
      case 'i': return <em key={i}><Inl nodes={n.c} /></em>;
      case 'code': return <code key={i} style={{ background: 'var(--st-surface2)', padding: '1px 6px', borderRadius: 7, fontSize: '0.92em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{n.v}</code>;
      case 'math': return <Maths key={i} tex={n.v} />;
      case 'link': return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--st-accent)', textDecoration: 'underline', overflowWrap: 'anywhere' }}><Inl nodes={n.c} /></a>;
      case 'br': return <br key={i} />;
    }
  })}</>
);

const CodeBlock: React.FC<{ lang: string; v: string }> = ({ lang, v }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ background: 'var(--st-surface2)', border: '1px solid var(--st-border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderBottom: '1px solid var(--st-border)' }}>
        <span className="st-tiny st-faint">{lang || 'code'}</span>
        <button className="st-btn st-btn-sm st-btn-ghost" style={{ minHeight: 26, padding: '0 8px' }} onClick={async () => { try { await navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* the code can still be selected by hand */ } }} aria-label="Copy the code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre style={{ margin: 0, padding: 12, overflowX: 'auto', fontSize: 13, lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}><code>{v}</code></pre>
    </div>
  );
};

const BlockView: React.FC<{ b: Block }> = ({ b }) => {
  switch (b.t) {
    case 'p': return <p style={{ lineHeight: 1.6, overflowWrap: 'anywhere' }}><Inl nodes={b.c} /></p>;
    case 'h': return <p className="st-title" style={{ fontSize: b.level <= 2 ? 17 : 15, marginTop: 4 }}><Inl nodes={b.c} /></p>;
    case 'list': {
      const Tag: any = b.ordered ? 'ol' : 'ul';
      return <Tag start={b.ordered ? b.start : undefined} style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 5, lineHeight: 1.55, listStyle: b.ordered ? 'decimal' : 'disc' }}>{b.items.map((it, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}><Inl nodes={it} /></li>)}</Tag>;
    }
    case 'quote': return <blockquote style={{ margin: 0, padding: '2px 0 2px 12px', borderLeft: '3px solid var(--st-accent)', color: 'var(--st-muted)', lineHeight: 1.55 }}><Inl nodes={b.c} /></blockquote>;
    case 'code': return <CodeBlock lang={b.lang} v={b.v} />;
    case 'math': return <Maths tex={b.v} block />;
    case 'hr': return <hr style={{ border: 0, borderTop: '1px solid var(--st-border)', width: '100%' }} />;
    case 'table': return (
      <div style={{ overflowX: 'auto', border: '1px solid var(--st-border)', borderRadius: 14 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13.5 }}>
          <thead><tr>{b.head.map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '8px 10px', background: 'var(--st-surface2)', whiteSpace: 'nowrap' }}><Inl nodes={h} /></th>)}</tr></thead>
          <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: '7px 10px', borderTop: '1px solid var(--st-border)' }}><Inl nodes={c} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
};

export const Markdown: React.FC<{ text: string }> = React.memo(({ text }) => {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>{blocks.map((b, i) => <BlockView key={i} b={b} />)}</div>;
});
Markdown.displayName = 'Markdown';

// one line of text with maths and bold/italic in it (for a short option or a label), without any block spacing around it
export const InlineText: React.FC<{ text: string }> = React.memo(({ text }) => {
  const nodes = useMemo(() => parseInline(text), [text]);
  return <Inl nodes={nodes} />;
});
InlineText.displayName = 'InlineText';

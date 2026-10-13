import React, { useState } from 'react';
import { BadgeCheck, BookmarkPlus, ExternalLink, Globe2, Search } from 'lucide-react';
import { research, type ResearchSource } from '../../../services/studyAi';
import { saveMaterial } from '../../../services/studyLibrary';
import { chunkText } from '../../../utils/studyChunks';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Markdown } from '../Markdown';
import { Btn, Card, Chip, ErrorBox, Page } from '../ui';

// Official sources. Two honest parts: links to the official websites themselves (the best place to check a syllabus or a paper), and a research helper that
// reads a few public pages and answers ONLY from them, with numbered sources, a mark for official ones, and the date they were read. Never made-up papers.
const OFFICIAL: Array<{ name: string; text: string; url: string }> = [
  { name: 'NCERT', text: 'Textbooks and syllabus (Classes 1 to 12)', url: 'https://ncert.nic.in' },
  { name: 'CBSE Academic', text: 'Curriculum, sample papers, marking schemes', url: 'https://cbseacademic.nic.in' },
  { name: 'CBSE', text: 'Notices, results, dates', url: 'https://www.cbse.gov.in' },
  { name: 'CISCE', text: 'ICSE and ISC syllabus and papers', url: 'https://www.cisce.org' },
  { name: 'NIOS', text: 'Open schooling, study material', url: 'https://www.nios.ac.in' },
  { name: 'NTA', text: 'JEE Main, NEET, CUET: information bulletins', url: 'https://nta.ac.in' },
  { name: 'DIKSHA', text: 'Lessons and textbooks, many languages', url: 'https://diksha.gov.in' },
  { name: 'SWAYAM', text: 'Free online courses from universities', url: 'https://swayam.gov.in' }
];
const IDEAS = ['The latest syllabus for my class', 'The exam pattern and marking scheme', 'How to apply for the exam', 'Important dates for the exam this year'];

const Research: React.FC<PageProps> = () => {
  const { me, user, toast } = useStudy();
  const board = me?.profile?.board || '';
  const level = me?.profile?.level ? String(me.profile.level).replace(/_/g, ' ') : '';
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ query: string; answer: string; sources: ResearchSource[]; note?: string; partial?: boolean; notConfigured?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = !!user.isAdmin || user.username?.toLowerCase() === 'noob';

  const run = async (text?: string) => {
    const query = (text ?? q).trim();
    if (query.length < 3 || busy) return;
    setBusy(true); setError(null); setRes(null);
    const r = await research({ query, board: board || undefined, level: level || undefined });
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'not_configured') setRes({ query, answer: '', sources: [], notConfigured: true, note: r.error });
      else setError(r.error);
      return;
    }
    setRes({ query, answer: r.data.answer, sources: r.data.sources || [], note: r.data.note, partial: r.data.partial });
  };
  const save = async () => {
    if (!res || !res.answer || saving) return;
    setSaving(true);
    const lines = res.sources.map((s) => '[' + s.n + '] ' + s.title + ' ' + s.url + (s.official ? ' (official)' : '') + ', read ' + s.retrievedAt.slice(0, 10)).join('\n');
    const chunks = chunkText(res.answer + '\n\nSources:\n' + lines);
    const r = await saveMaterial({ title: ('Research: ' + res.query).slice(0, 140), subjectId: null, kind: 'research', prepared: { kind: 'research', sourceName: '', pages: null, chunks, note: 'From public web pages, read on ' + new Date().toISOString().slice(0, 10) + '. Please check the linked sources.', suggestedTitle: res.query } }, () => undefined);
    setSaving(false);
    if (!r.ok) { toast(r.error); return; }
    toast('Saved to your library.');
  };

  return (
    <Page title="Official sources" subtitle="Check things at the source">
      <div style={{ display: 'grid', gap: 16 }}>
        <Card tint>
          <p className="st-title st-h3" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><BadgeCheck size={18} style={{ color: 'var(--st-accent)' }} /> Start at the official website</p>
          <p className="st-small st-muted" style={{ marginTop: 6 }}>Syllabus and exam rules change. The official site is always the one to trust, so check the date on the page.</p>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {OFFICIAL.map((o) => (
              <a key={o.url} href={o.url} target="_blank" rel="noopener noreferrer" className="st-row-btn" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="st-title st-h3" style={{ display: 'block' }}>{o.name}</span>
                  <span className="st-tiny st-muted">{o.text}</span>
                </span>
                <ExternalLink size={16} style={{ flex: 'none', color: 'var(--st-faint)' }} aria-label="Opens the official website" />
              </a>
            ))}
          </div>
        </Card>

        <Card>
          <p className="st-title st-h3" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Globe2 size={18} style={{ color: 'var(--st-accent)' }} /> Ask about it</p>
          <p className="st-small st-muted" style={{ marginTop: 6 }}>I read a few public web pages and answer only from them, with the sources numbered so you can open each one.{board ? ' I will keep in mind that you study ' + board + '.' : ''}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input className="st-input" value={q} maxLength={220} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run(); }} placeholder="e.g. NEET exam pattern" aria-label="What do you want to look up?" />
            <Btn kind="primary" busy={busy} disabled={q.trim().length < 3} onClick={() => void run()} aria-label="Search"><Search size={17} /></Btn>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{IDEAS.map((i) => <Chip key={i} onClick={() => setQ(i + (board ? ' ' + board : ''))}>{i}</Chip>)}</div>
        </Card>

        {error && <ErrorBox text={error} />}
        {busy && <div className="st-notice" role="status"><p className="st-small">Reading the pages. This can take about half a minute…</p></div>}

        {res?.notConfigured && (
          <div className="st-notice st-notice-warn">
            <p className="st-small"><b>Web research is not switched on yet.</b> You can still open the official websites above, or add the document to your library.</p>
            {isAdmin && <p className="st-tiny" style={{ marginTop: 6 }}>For the administrator: add TAVILY_API_KEY (or BRAVE_API_KEY, or SERPER_API_KEY) as a secret for the study-ai function.</p>}
            {hasRoute('library') && <div style={{ marginTop: 10 }}><Btn small onClick={() => goStudy('library')}>Open my library</Btn></div>}
          </div>
        )}

        {res && !res.notConfigured && (
          <>
            {res.answer ? (
              <Card>
                <p className="st-label">What the sources say</p>
                <div style={{ marginTop: 8 }}><Markdown text={res.answer} /></div>
                {res.note && <p className="st-tiny st-faint" style={{ marginTop: 10 }}>{res.note}</p>}
                <div style={{ marginTop: 12 }}><Btn small busy={saving} onClick={() => void save()}><BookmarkPlus size={15} /> Save to my library</Btn></div>
              </Card>
            ) : (
              <div className="st-notice"><p className="st-small">{res.note || 'Nothing could be found for that.'}</p></div>
            )}
            {res.sources.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <p className="st-label">Sources</p>
                {res.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="st-row-btn" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
                    <span className="st-pill" style={{ flex: 'none' }}>{s.n}</span>
                    <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                      <span className="st-small" style={{ display: 'block', fontWeight: 700, overflowWrap: 'anywhere' }}>{s.title || s.url}</span>
                      <span className="st-tiny st-muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>{hostOf(s.url)}</span>
                      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        {s.official && <span className="st-pill" style={{ color: 'var(--st-ok)' }}>official site</span>}
                        <span className="st-pill">{s.read ? 'read on ' + s.retrievedAt.slice(0, 10) : 'only the search summary'}</span>
                      </span>
                    </span>
                    <ExternalLink size={15} style={{ flex: 'none', color: 'var(--st-faint)' }} />
                  </a>
                ))}
              </div>
            )}
          </>
        )}
        <p className="st-tiny st-faint" style={{ textAlign: 'center' }}>This helper reads public pages and can make mistakes. It is a study aid, not an official statement.</p>
      </div>
    </Page>
  );
};
const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export default Research;

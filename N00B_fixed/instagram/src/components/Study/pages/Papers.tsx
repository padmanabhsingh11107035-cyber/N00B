import React, { useCallback, useEffect, useState } from 'react';
import { FilePlus2, FileSearch, MessageCircle, Target } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { analyzePapers, type PaperTopic } from '../../../services/studyAi';
import type { StudyMaterial } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Btn, Card, Empty, ErrorBox, Loading, Page, SubjectTag } from '../ui';

// Past papers: the student adds the question papers they really have (to the library, marked "past paper"), and NOOB STUDY finds topics that come up
// again in THOSE papers. It never says what a board usually asks, never invents a paper, and shows for each topic which papers it was seen in, and a
// quoted question only when that question is really in the paper.
const Papers: React.FC<PageProps> = () => {
  const { me, subjectName, colorOf } = useStudy();
  const lang = me?.profile?.tutor?.language || me?.profile?.language || 'en';
  const [papers, setPapers] = useState<StudyMaterial[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ topics: PaperTopic[]; papers: Array<{ n: number; title: string }>; note: string; subjectId: string | null } | null>(null);

  const load = useCallback(async () => {
    const r = await studyApi.materials(null);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    const list = r.data.materials.filter((m) => m.kind === 'pyq' && m.status === 'ready');
    setPapers(list);
    setPicked((p) => p.filter((id) => list.some((m) => m.id === id)));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 8 ? p : [...p, id]));
  const run = async () => {
    if (!picked.length || busy) return;
    setBusy(true); setError(null); setOut(null);
    const r = await analyzePapers({ materialIds: picked, language: lang });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    const subjects = new Set((papers || []).filter((m) => picked.includes(m.id)).map((m) => m.subjectId));
    setOut({ topics: r.data.topics, papers: r.data.papers, note: r.data.note, subjectId: subjects.size === 1 ? [...subjects][0] : null });
  };

  return (
    <Page title="Past papers" subtitle="Patterns in papers you added">
      <div style={{ display: 'grid', gap: 16 }}>
        <Card tint>
          <p className="st-title st-h3" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><FileSearch size={18} style={{ color: 'var(--st-accent)' }} /> How this works</p>
          <p className="st-small st-muted" style={{ marginTop: 6 }}>Add question papers you really have (a PDF, or photos). Then choose them here, and I will find the topics that come up again in those papers. I never guess what an exam board usually asks.</p>
          {hasRoute('library') && <div style={{ marginTop: 12 }}><Btn small onClick={() => goStudy('library', { add: 'pyq' })}><FilePlus2 size={15} /> Add a past paper</Btn></div>}
        </Card>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!papers && !error && <Loading rows={2} />}
        {papers && papers.length === 0 && <Empty icon={<FileSearch size={26} />} title="No past papers yet" text="Add a question paper to your library and mark it as a past paper. The more papers (three or more is best), the clearer the patterns." />}
        {papers && papers.length > 0 && (
          <>
            <div style={{ display: 'grid', gap: 8 }}>
              <p className="st-label">Choose the papers ({picked.length} of up to 8)</p>
              {papers.map((m) => {
                const on = picked.includes(m.id);
                return (
                  <button key={m.id} role="checkbox" aria-checked={on} onClick={() => toggle(m.id)} className="st-row-btn" style={{ borderColor: on ? 'var(--st-accent)' : undefined }}>
                    <span className="st-check" data-on={on ? 'true' : 'false'} aria-hidden="true" style={{ flex: 'none' }} />
                    <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                      <span className="st-title st-h3" style={{ display: 'block', overflowWrap: 'anywhere' }}>{m.title}</span>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>{m.subjectId && <SubjectTag name={subjectName(m.subjectId)} color={colorOf(m.subjectId)} />}<span className="st-tiny st-muted">{m.pages ? m.pages + ' pages' : ''}</span></span>
                    </span>
                  </button>
                );
              })}
            </div>
            {picked.length === 1 && <p className="st-tiny st-faint">With only one paper the patterns are weak. Add more papers for a clearer picture.</p>}
            <Btn kind="primary" busy={busy} disabled={!picked.length} onClick={() => void run()}><FileSearch size={17} /> Find the patterns</Btn>
          </>
        )}
        {busy && <div className="st-notice" role="status"><p className="st-small">Reading your papers…</p></div>}

        {out && (
          <div style={{ display: 'grid', gap: 10 }}>
            <p className="st-label">Topics seen in your papers</p>
            {out.topics.length === 0 && <div className="st-notice"><p className="st-small">No topic clearly repeated in these papers. That can be true, or the papers may be hard to read. Try adding more papers.</p></div>}
            {out.topics.map((t, i) => (
              <Card key={i}>
                <p className="st-title st-h3" style={{ overflowWrap: 'anywhere' }}>{t.topic}</p>
                <p className="st-small st-muted" style={{ marginTop: 4 }}>In {t.papers.length} of {out.papers.length} {out.papers.length === 1 ? 'paper' : 'papers'}{t.count > t.papers.length ? ', about ' + t.count + ' questions' : ''}</p>
                <div className="st-progress" style={{ marginTop: 8 }} role="img" aria-label={'Seen in ' + t.papers.length + ' of ' + out.papers.length + ' papers'}><i style={{ width: Math.round((t.papers.length / out.papers.length) * 100) + '%' }} /></div>
                <p className="st-tiny st-faint" style={{ marginTop: 6 }}>Papers: {t.papers.map((n) => out.papers.find((p) => p.n === n)?.title || 'paper ' + n).join(', ')}</p>
                {t.verified && t.example && <p className="st-small" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>"{t.example}" <span className="st-tiny st-faint">(from the paper)</span></p>}
                {!t.verified && <p className="st-tiny st-faint" style={{ marginTop: 8 }}>I could not match a quoted question to the paper, so please check this one yourself.</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {hasRoute('chat') && <Btn small kind="ghost" onClick={() => goStudy('chat', { seed: 'Explain ' + t.topic + ' simply, with one worked example.', subject: out.subjectId || undefined })}><MessageCircle size={14} /> Learn it</Btn>}
                  {hasRoute('practice') && <Btn small kind="ghost" onClick={() => goStudy('practice', { topic: t.topic, subject: out.subjectId || undefined })}><Target size={14} /> Quiz me</Btn>}
                </div>
              </Card>
            ))}
            <p className="st-tiny st-faint">{out.note}</p>
          </div>
        )}
      </div>
    </Page>
  );
};
export default Papers;

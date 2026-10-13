import React, { useCallback, useEffect, useState } from 'react';
import { Layers, Plus, Sparkles } from 'lucide-react';
import { newRef, studyApi } from '../../../services/studyApi';
import { generateCards } from '../../../services/studyAi';
import type { StudyDeck, StudyMaterial } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Btn, Card, Chip, Empty, ErrorBox, Field, Loading, Page, Sheet, SubjectTag } from '../ui';

// Flashcards. A deck can be made empty, by pasting lines, or by the AI from a topic or from the student's own notes. Cards come back at the right time,
// worked out by the SM-2 method in the database (the same one the buttons predict).
const Decks: React.FC<PageProps> = ({ params }) => {
  const { subjects, subjectName, colorOf } = useStudy();
  const [subject, setSubject] = useState<string>(typeof params.subject === 'string' ? params.subject : '');
  const [data, setData] = useState<{ decks: StudyDeck[]; dueTotal: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(typeof params.material === 'string' || params.new === true);

  const load = useCallback(async () => {
    const r = await studyApi.decks(subject || null);
    if (r.ok) { setData(r.data); setError(null); } else setError(r.error);
  }, [subject]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Page title="Flashcards" subtitle="Revise at the right time" right={<Btn small kind="primary" onClick={() => setMaking(true)}><Plus size={15} /> New deck</Btn>}>
      <div style={{ display: 'grid', gap: 14 }}>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {data && data.dueTotal > 0 && hasRoute('review') && (
          <Card tint>
            <p className="st-title st-h3">{data.dueTotal === 1 ? '1 card is ready' : data.dueTotal + ' cards are ready'}</p>
            <p className="st-small st-muted" style={{ marginTop: 4 }}>A few minutes now keeps it in your memory for weeks.</p>
            <div style={{ marginTop: 12 }}><Btn kind="primary" onClick={() => goStudy('review')}><Layers size={16} /> Review now</Btn></div>
          </Card>
        )}
        {subjects.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            <Chip on={!subject} onClick={() => setSubject('')}>All</Chip>
            {subjects.map((s) => <Chip key={s.id} on={subject === s.id} onClick={() => setSubject(s.id)}>{s.name}</Chip>)}
          </div>
        )}
        {!data && !error && <Loading rows={3} />}
        {data && data.decks.length === 0 && (
          <Empty icon={<Layers size={28} />} title="No flashcard decks yet" text="Make a deck for something you need to remember: formulas, dates, definitions. Short cards, a few at a time, work best."
            action={<Btn kind="primary" small onClick={() => setMaking(true)}><Plus size={15} /> Make a deck</Btn>} />
        )}
        {data?.decks.map((d) => (
          <button key={d.id} className="st-row-btn" onClick={() => goStudy('deck', { id: d.id })} style={{ alignItems: 'flex-start' }}>
            <span style={{ width: 40, height: 40, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'var(--st-surface2)', color: 'var(--st-accent)', flex: 'none' }}><Layers size={19} /></span>
            <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <span className="st-title st-h3" style={{ display: 'block', overflowWrap: 'anywhere' }}>{d.title}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 5 }}>
                {d.subjectId && <SubjectTag name={subjectName(d.subjectId)} color={colorOf(d.subjectId)} />}
                <span className="st-tiny st-muted">{d.total} {d.total === 1 ? 'card' : 'cards'}</span>
                {d.due > 0 && <span className="st-pill" style={{ color: 'var(--st-accent)' }}>{d.due} ready</span>}
              </span>
            </span>
          </button>
        ))}
      </div>
      {making && <NewDeck defaultSubject={subject} material={typeof params.material === 'string' ? params.material : ''} materialTitle={typeof params.materialTitle === 'string' ? params.materialTitle : ''} onClose={() => setMaking(false)} onMade={(d) => { setMaking(false); void load(); goStudy('deck', { id: d.id }); }} />}
    </Page>
  );
};

const NewDeck: React.FC<{ defaultSubject: string; material: string; materialTitle: string; onClose: () => void; onMade: (d: StudyDeck) => void }> = ({ defaultSubject, material, materialTitle, onClose, onMade }) => {
  const { me, subjects, subjectName, toast } = useStudy();
  const lang = me?.profile?.tutor?.language || me?.profile?.language || 'en';
  const [title, setTitle] = useState(materialTitle);
  const [subjectId, setSubjectId] = useState(defaultSubject);
  const [topic, setTopic] = useState('');
  const [mat, setMat] = useState(material);
  const [mats, setMats] = useState<StudyMaterial[]>([]);
  const [count, setCount] = useState(15);
  const [useAi, setUseAi] = useState(!!material);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void studyApi.materials(null).then((r) => { if (r.ok) setMats(r.data.materials.filter((m) => m.status === 'ready')); }); }, []);

  const make = async () => {
    if (busy) return;
    const name = (title || topic).trim();
    if (!name) { setError('Please give the deck a name.'); return; }
    if (useAi && !topic.trim() && !mat) { setError('Please write a topic, or choose your notes, for the AI to use.'); return; }
    setBusy(true); setError(null);
    let cards: Array<{ front: string; back: string }> = [];
    if (useAi) {
      const g = await generateCards({ subject: subjectId ? subjectName(subjectId) : undefined, topic: topic.trim() || materialTitle || undefined, count, materialId: mat || null, language: lang });
      if (!g.ok) { setBusy(false); setError(g.error); return; }
      cards = g.data.cards;
    }
    const d = await studyApi.saveDeck({ clientRef: newRef(), title: name.slice(0, 100), subjectId: subjectId || null, materialId: mat || null });
    if (!d.ok) { setBusy(false); setError(d.error); return; }
    let deck = d.data;
    if (cards.length) {
      const a = await studyApi.addCards(deck.id, cards);
      if (a.ok) deck = a.data.deck; else { setBusy(false); setError(a.error); return; }
      toast(cards.length + ' cards made. Please read them: the AI can make mistakes.');
    }
    setBusy(false);
    onMade(deck);
  };

  return (
    <Sheet title="New flashcard deck" onClose={busy ? () => undefined : onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Name"><input className="st-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Physics formulas" /></Field>
        {subjects.length > 0 && <Field label="Subject"><select className="st-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">No subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <Chip on={useAi} onClick={() => setUseAi((v) => !v)}><Sparkles size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Let the AI write the cards</Chip>
        {useAi && (
          <>
            <Field label="Topic"><input className="st-input" value={topic} maxLength={140} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Laws of motion" /></Field>
            {mats.length > 0 && <Field label="From my notes (optional)"><select className="st-input" value={mat} onChange={(e) => setMat(e.target.value)}><option value="">Not from my notes</option>{mats.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></Field>}
            <Field label="How many cards"><div style={{ display: 'flex', gap: 8 }}>{[10, 15, 20, 30].map((n) => <Chip key={n} on={count === n} onClick={() => setCount(n)}>{n}</Chip>)}</div></Field>
          </>
        )}
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
        <Btn kind="primary" busy={busy} onClick={() => void make()}>{useAi ? 'Make the deck' : 'Create an empty deck'}</Btn>
      </div>
    </Sheet>
  );
};
export default Decks;

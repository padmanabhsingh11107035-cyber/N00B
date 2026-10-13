import React, { useCallback, useEffect, useState } from 'react';
import { Layers, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { generateCards } from '../../../services/studyAi';
import { parseCardLines } from '../../../utils/studyQuiz';
import type { StudyCard, StudyDeck } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { backStudy, goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { InlineText } from '../Markdown';
import { waitLabel } from '../../../utils/studyQuiz';
import { Btn, Card, Chip, ErrorBox, Field, Loading, Page, Sheet, SubjectTag } from '../ui';

// One deck: its cards (add by hand, paste many, or let the AI write more), a button to review what is ready, and rename or delete.
const Deck: React.FC<PageProps> = ({ params }) => {
  const { subjects, subjectName, colorOf, toast } = useStudy();
  const id = String(params.id || '');
  const [deck, setDeck] = useState<StudyDeck | null>(null);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'add' | 'rename' | 'delete' | null>(null);
  const [editing, setEditing] = useState<StudyCard | null>(null);

  const load = useCallback(async () => {
    const r = await studyApi.cards(id, 200, 0);
    if (r.ok) { setDeck(r.data.deck); setCards(r.data.cards); setError(null); } else setError(r.error);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Page title={deck?.title || 'Deck'} subtitle={deck ? deck.total + (deck.total === 1 ? ' card' : ' cards') : undefined}
      right={deck && <button className="st-icon-btn" onClick={() => setMenu((v) => !v)} aria-label="More"><MoreHorizontal size={18} /></button>}>
      <div style={{ display: 'grid', gap: 14 }}>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!deck && !error && <Loading rows={3} />}
        {menu && deck && (
          <Card><div style={{ display: 'grid', gap: 8 }}>
            <Btn onClick={() => { setMenu(false); setSheet('rename'); }}><Pencil size={16} /> Rename or change subject</Btn>
            <Btn kind="warn" onClick={() => { setMenu(false); setSheet('delete'); }}><Trash2 size={16} /> Delete this deck</Btn>
          </div></Card>
        )}
        {deck && (
          <>
            <Card tint>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {deck.subjectId && <SubjectTag name={subjectName(deck.subjectId)} color={colorOf(deck.subjectId)} />}
                <span className="st-small st-muted">{deck.due > 0 ? deck.due + ' ready to review' : deck.total > 0 ? 'Nothing is due right now' : 'No cards yet'}</span>
              </div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: deck.due > 0 ? '1fr 1fr' : '1fr', marginTop: 12 }}>
                {deck.due > 0 && hasRoute('review') && <Btn kind="primary" onClick={() => goStudy('review', { deck: deck.id })}><Layers size={16} /> Review {deck.due}</Btn>}
                <Btn onClick={() => setSheet('add')}><Plus size={16} /> Add cards</Btn>
              </div>
            </Card>
            {cards.length === 0 && <div className="st-notice"><p className="st-small">This deck is empty. Add a few short cards: one idea on each is best.</p></div>}
            <div style={{ display: 'grid', gap: 8 }}>
              {cards.map((c) => (
                <button key={c.id} className="st-row-btn" onClick={() => setEditing(c)} style={{ alignItems: 'flex-start' }}>
                  <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                    <span className="st-small" style={{ display: 'block', fontWeight: 700, overflowWrap: 'anywhere' }}><InlineText text={c.front} /></span>
                    <span className="st-small st-muted" style={{ display: 'block', marginTop: 3, overflowWrap: 'anywhere' }}><InlineText text={c.back} /></span>
                    <span className="st-tiny st-faint" style={{ display: 'block', marginTop: 4 }}>{c.fresh ? 'New' : c.dueAt && new Date(c.dueAt).getTime() <= Date.now() ? 'Ready now' : 'Comes back in ' + waitLabel(Math.max(1, Math.round((new Date(c.dueAt).getTime() - Date.now()) / 60000)))}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {sheet === 'add' && deck && <AddCards deck={deck} onClose={() => setSheet(null)} onDone={() => { setSheet(null); void load(); }} />}
      {sheet === 'rename' && deck && <RenameDeck deck={deck} onClose={() => setSheet(null)} onDone={(d) => { setDeck(d); setSheet(null); toast('Saved.'); }} />}
      {sheet === 'delete' && deck && (
        <Sheet title="Delete this deck?" onClose={() => setSheet(null)}>
          <p className="st-small st-muted">"{deck.title}" and its {deck.total} {deck.total === 1 ? 'card' : 'cards'} will be removed for good.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn kind="ghost" onClick={() => setSheet(null)}>Keep it</Btn>
            <Btn kind="primary" style={{ flex: 1 }} onClick={async () => { const r = await studyApi.deleteDeck(deck.id); if (r.ok) { toast('Deleted.'); backStudy(); } else toast(r.error); }}>Delete</Btn>
          </div>
        </Sheet>
      )}
      {editing && <EditCard card={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />}
    </Page>
  );
};

const AddCards: React.FC<{ deck: StudyDeck; onClose: () => void; onDone: () => void }> = ({ deck, onClose, onDone }) => {
  const { me, subjectName, toast } = useStudy();
  const lang = me?.profile?.tutor?.language || me?.profile?.language || 'en';
  const [mode, setMode] = useState<'one' | 'paste' | 'ai'>('one');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (cards: Array<{ front: string; back: string }>) => {
    const a = await studyApi.addCards(deck.id, cards);
    if (!a.ok) { setError(a.error); return false; }
    toast(a.data.added + (a.data.added === 1 ? ' card added.' : ' cards added.') + (a.data.skipped ? ' ' + a.data.skipped + ' skipped (blank or already there).' : ''));
    return a.data.added > 0;
  };
  const go = async () => {
    if (busy) return;
    setError(null);
    if (mode === 'one') {
      if (!front.trim() || !back.trim()) { setError('A card needs a front and a back.'); return; }
      setBusy(true); const ok = await add([{ front: front.trim(), back: back.trim() }]); setBusy(false);
      if (ok) { setFront(''); setBack(''); onDone(); }
    } else if (mode === 'paste') {
      const cards = parseCardLines(text);
      if (!cards.length) { setError('I could not find any cards. Write one on each line, like: Force - A push or a pull'); return; }
      setBusy(true); const ok = await add(cards); setBusy(false);
      if (ok) onDone();
    } else {
      if (!topic.trim() && !deck.materialId) { setError('Please write a topic for the AI to use.'); return; }
      setBusy(true);
      const g = await generateCards({ subject: deck.subjectId ? subjectName(deck.subjectId) : undefined, topic: topic.trim() || deck.title, count, materialId: deck.materialId, language: lang });
      if (!g.ok) { setBusy(false); setError(g.error); return; }
      const ok = await add(g.data.cards);
      setBusy(false);
      if (ok) { toast('Please read the new cards. The AI can make mistakes.'); onDone(); }
    }
  };

  return (
    <Sheet title="Add cards" onClose={busy ? () => undefined : onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip on={mode === 'one'} onClick={() => setMode('one')}>One card</Chip>
          <Chip on={mode === 'paste'} onClick={() => setMode('paste')}>Paste many</Chip>
          <Chip on={mode === 'ai'} onClick={() => setMode('ai')}><Sparkles size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> AI</Chip>
        </div>
        {mode === 'one' && (
          <>
            <Field label="Front (the question or term)"><textarea className="st-input" value={front} maxLength={300} onChange={(e) => setFront(e.target.value)} style={{ minHeight: 70 }} /></Field>
            <Field label="Back (the answer)"><textarea className="st-input" value={back} maxLength={600} onChange={(e) => setBack(e.target.value)} style={{ minHeight: 90 }} /></Field>
          </>
        )}
        {mode === 'paste' && (
          <Field label="One card on each line" hint="Write the front, then a dash or a colon, then the back.">
            <textarea className="st-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Force - A push or a pull\nMass: The amount of matter\nUnit of force = newton'} style={{ minHeight: 150 }} />
          </Field>
        )}
        {mode === 'ai' && (
          <>
            <Field label="Topic"><input className="st-input" value={topic} maxLength={140} onChange={(e) => setTopic(e.target.value)} placeholder={deck.title} /></Field>
            <Field label="How many"><div style={{ display: 'flex', gap: 8 }}>{[5, 10, 15, 20].map((n) => <Chip key={n} on={count === n} onClick={() => setCount(n)}>{n}</Chip>)}</div></Field>
            <p className="st-tiny st-faint">{deck.materialId ? 'The cards are written from your notes.' : 'The cards come from the AI\'s general knowledge, not from your syllabus.'} Please read them: the AI can make mistakes.</p>
          </>
        )}
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
        <Btn kind="primary" busy={busy} onClick={() => void go()}>{mode === 'ai' ? 'Make cards' : 'Add'}</Btn>
      </div>
    </Sheet>
  );
};

const EditCard: React.FC<{ card: StudyCard; onClose: () => void; onDone: () => void }> = ({ card, onClose, onDone }) => {
  const { toast } = useStudy();
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await studyApi.saveCard({ id: card.id, front, back });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast('Saved.'); onDone();
  };
  const remove = async () => {
    setBusy(true);
    const r = await studyApi.deleteCard(card.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast('Removed.'); onDone();
  };
  return (
    <Sheet title="Edit card" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Front"><textarea className="st-input" value={front} maxLength={300} onChange={(e) => setFront(e.target.value)} style={{ minHeight: 70 }} /></Field>
        <Field label="Back"><textarea className="st-input" value={back} maxLength={600} onChange={(e) => setBack(e.target.value)} style={{ minHeight: 90 }} /></Field>
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn kind="ghost" disabled={busy} onClick={() => void remove()} aria-label="Delete this card"><Trash2 size={16} /></Btn>
          <Btn kind="primary" style={{ flex: 1 }} busy={busy} onClick={() => void save()}>Save</Btn>
        </div>
      </div>
    </Sheet>
  );
};

const RenameDeck: React.FC<{ deck: StudyDeck; onClose: () => void; onDone: (d: StudyDeck) => void }> = ({ deck, onClose, onDone }) => {
  const { subjects } = useStudy();
  const [title, setTitle] = useState(deck.title);
  const [subjectId, setSubjectId] = useState(deck.subjectId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await studyApi.saveDeck({ id: deck.id, title, subjectId: subjectId || null });
    setBusy(false);
    if (r.ok) onDone(r.data); else setError(r.error);
  };
  return (
    <Sheet title="Rename" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Name"><input className="st-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></Field>
        {subjects.length > 0 && <Field label="Subject"><select className="st-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">No subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
        <Btn kind="primary" busy={busy} disabled={!title.trim()} onClick={() => void save()}>Save</Btn>
      </div>
    </Sheet>
  );
};
export default Deck;

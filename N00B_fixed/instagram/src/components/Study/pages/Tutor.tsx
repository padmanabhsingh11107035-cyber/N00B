import React, { useCallback, useEffect, useState } from 'react';
import { Camera, MessageCircle, Mic, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { aiHealth, type AiHealth } from '../../../services/studyAi';
import type { StudyConversation } from '../../../utils/studyTypes';
import { dueLabel } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { STARTERS } from './Chat';
import { Btn, Chip, Empty, ErrorBox, Field, Loading, Orb, Page, Sheet, SubjectTag } from '../ui';

// The tutor's front door: ask something, start from an idea, or pick up an old chat. Chats are saved, can be renamed and deleted, and are private.
const Tutor: React.FC<PageProps> = () => {
  const { me, user, subjects, subjectName, colorOf, tz, toast } = useStudy();
  const tutorName = me?.profile?.tutor?.name?.trim() || 'your AI tutor';
  const [subject, setSubject] = useState<string>('');
  const [q, setQ] = useState('');
  const [teach, setTeach] = useState(!!me?.profile?.tutor?.teachMode);
  const [list, setList] = useState<StudyConversation[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [menu, setMenu] = useState<StudyConversation | null>(null);
  const [renaming, setRenaming] = useState<StudyConversation | null>(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const isAdmin = !!user.isAdmin || user.username?.toLowerCase() === 'noob';

  const load = useCallback(async (append = false) => {
    const before = append && list && list.length ? list[list.length - 1].lastMessageAt : null;
    const r = await studyApi.convs(subject || null, 20, before);
    if (!r.ok) { setError(r.error); return; }
    setError(null); setMore(r.data.more);
    setList((cur) => (append && cur ? [...cur, ...r.data.conversations] : r.data.conversations));
  }, [subject, list]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setList(null); void load(); }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void aiHealth().then((r) => { if (r.ok) setHealth(r.data); }); }, []);

  const ask = (text: string, send = true) => goStudy('chat', { seed: text, send, subject: subject || undefined, mode: teach ? 'teach' : undefined });

  return (
    <Page title={tutorName === 'your AI tutor' ? 'My AI tutor' : tutorName} subtitle="Ask anything, any language" hideBack>
      <div style={{ display: 'grid', gap: 16 }}>
        {health && !health.configured && (
          <div className="st-notice st-notice-warn">
            {isAdmin
              ? 'The tutor has no AI key yet. Add GROQ_API_KEY (and more keys if you like) under Supabase, Edge Functions, Secrets, and deploy the "study-ai" function. The rest of NOOB STUDY already works.'
              : 'Your tutor is still getting ready. The rest of NOOB STUDY works in the meantime.'}
          </div>
        )}
        <div className="st-card-tint st-in" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Orb size={48} float /><div><p className="st-title st-h3">What are you stuck on?</p><p className="st-small st-muted">I explain step by step, in simple words.</p></div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="st-input" value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} placeholder="Type your question…" aria-label="Your question"
              onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) ask(q.trim()); }} />
            <Btn kind="primary" onClick={() => q.trim() && ask(q.trim())} disabled={!q.trim()} aria-label="Ask"><Send size={17} /></Btn>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasRoute('photo') && <Btn small onClick={() => goStudy('photo', { subject: subject || undefined })}><Camera size={15} /> Photo</Btn>}
            {hasRoute('voice') && <Btn small onClick={() => goStudy('voice', { subject: subject || undefined })}><Mic size={15} /> Talk</Btn>}
            <Btn small onClick={() => goStudy('chat', { subject: subject || undefined, mode: teach ? 'teach' : undefined })}><MessageCircle size={15} /> Open a blank chat</Btn>
            <Chip on={teach} onClick={() => setTeach((v) => !v)} title="The tutor asks you first and guides you, instead of telling you straight away">Teach me</Chip>
          </div>
        </div>

        {subjects.length > 0 && (
          <div>
            <p className="st-eyebrow" style={{ marginBottom: 8 }}>About a subject</p>
            <div className="st-hscroll"><Chip on={!subject} onClick={() => setSubject('')}>All</Chip>{subjects.map((s) => <Chip key={s.id} on={subject === s.id} onClick={() => setSubject(s.id)}>{s.name}</Chip>)}</div>
          </div>
        )}

        <div>
          <p className="st-eyebrow" style={{ marginBottom: 8 }}>Ideas to start with</p>
          <div className="st-grid2 st-grid2-lg">
            {STARTERS.map((s) => <button key={s.label} className="st-row-btn" onClick={() => ask(s.text, false)}><span className="st-small" style={{ fontWeight: 700 }}>{s.label}</span></button>)}
          </div>
        </div>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="st-title st-h2">Your chats</h2>
          {error && <ErrorBox text={error} onRetry={() => void load()} />}
          {!list && !error && <Loading rows={2} />}
          {list && list.length === 0 && <Empty icon={<MessageCircle size={26} />} title="No chats yet" text="Your questions and the tutor's answers are saved here, only for you." />}
          {list?.map((c) => (
            <div key={c.id} className="st-row-btn" style={{ padding: 0, alignItems: 'stretch' }}>
              <button onClick={() => goStudy('chat', { conversation: c.id })} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: '12px 4px 12px 14px' }}>
                <span className="st-title st-h3" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'New chat'}</span>
                <span className="st-tiny st-muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{c.preview || 'No messages yet'}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>{c.subjectId && <SubjectTag name={subjectName(c.subjectId)} color={colorOf(c.subjectId)} />}<span className="st-tiny st-faint">{dueLabel(c.lastMessageAt, tz).replace(/, \d.*$/, '')}</span></span>
              </button>
              <button className="st-icon-btn" style={{ margin: 8, alignSelf: 'center' }} onClick={() => { setMenu(c); setConfirm(false); }} aria-label={`Options for ${c.title || 'this chat'}`}><MoreHorizontal size={18} /></button>
            </div>
          ))}
          {more && <Btn kind="ghost" onClick={() => void load(true)}>Show more</Btn>}
        </section>
      </div>

      {menu && (
        <Sheet title={menu.title || 'New chat'} onClose={() => setMenu(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <Btn onClick={() => { setRenaming(menu); setName(menu.title); setMenu(null); }}><Pencil size={16} /> Rename</Btn>
            {confirm
              ? <Btn kind="primary" busy={busy} onClick={async () => { setBusy(true); const r = await studyApi.deleteConv(menu.id); setBusy(false); if (r.ok) { toast('Chat deleted.'); setList((l) => (l ? l.filter((x) => x.id !== menu.id) : l)); setMenu(null); } else toast(r.error); }}>Yes, delete it for good</Btn>
              : <Btn kind="warn" onClick={() => setConfirm(true)}><Trash2 size={16} /> Delete</Btn>}
          </div>
        </Sheet>
      )}
      {renaming && (
        <Sheet title="Rename chat" onClose={() => setRenaming(null)}>
          <Field label="Name"><input className="st-input" value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} /></Field>
          <div style={{ marginTop: 14 }}><Btn kind="primary" block busy={busy} onClick={async () => { setBusy(true); const r = await studyApi.renameConv(renaming.id, name); setBusy(false); if (r.ok) { setList((l) => (l ? l.map((x) => (x.id === r.data.id ? { ...x, title: r.data.title } : x)) : l)); setRenaming(null); } else toast(r.error); }}>Save</Btn></div>
        </Sheet>
      )}
    </Page>
  );
};
export default Tutor;

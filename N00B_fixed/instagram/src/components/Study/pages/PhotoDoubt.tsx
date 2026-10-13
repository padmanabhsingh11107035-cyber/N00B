import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Lightbulb, X } from 'lucide-react';
import { MAX_PICTURES, prepareFiles } from '../../../services/studyAi';
import { aiHealth, type AiHealth } from '../../../services/studyAi';
import { useStudy } from '../StudyContext';
import { goStudy, replaceStudy } from '../studyStore';
import { Btn, Card, Field, Page } from '../ui';
import type { PageProps } from '../StudyApp';

// Send a picture of a question, a page of notes, an equation or your own written answer. The pictures go to the student's own private folder,
// and the tutor reads them: if something is unclear it says so instead of guessing.
interface Pic { key: string; url: string }
const TIPS = ['Good light, no shadow over the writing.', 'One question at a time reads best.', 'Keep the page flat and fill the picture with it.', 'Add a few words if you want a hint, not the full answer.'];

const PhotoDoubt: React.FC<PageProps> = ({ params }) => {
  const { user, subjects, toast } = useStudy();
  const [pics, setPics] = useState<Pic[]>([]);
  const [uploading, setUploading] = useState(0);
  const [note, setNote] = useState('');
  const [subject, setSubject] = useState<string>(typeof params.subject === 'string' ? params.subject : '');
  const [mode, setMode] = useState<'full' | 'hint'>('full');
  const [health, setHealth] = useState<AiHealth | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  React.useEffect(() => { void aiHealth().then((r) => { if (r.ok) setHealth(r.data); }); }, []);

  const add = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const room = MAX_PICTURES - pics.length - uploading;
    if (room <= 0) { toast(`You can send up to ${MAX_PICTURES} pictures at once.`); return; }
    const list = Array.from(files).slice(0, room);
    setUploading((n) => n + list.length);
    const r = await prepareFiles(list, room, () => setUploading((n) => Math.max(0, n - 1)));
    setUploading(0);
    if (r.pics.length) setPics((p) => [...p, ...r.pics].slice(0, MAX_PICTURES));
    if (r.framed) toast('A few pictures from your video were taken. The video itself is not sent.');
    if (r.errors[0]) toast(r.errors[0]);
  };
  const ask = () => {
    if (!pics.length || uploading) return;
    const seed = (note.trim() || 'Please help me with this.') + (mode === 'hint' ? '\n\n(Please give me only a hint to get started, not the full solution. I will ask if I need more.)' : '');
    replaceStudy('chat', { images: pics.map((p) => p.data).join('|'), seed, subject: subject || undefined, mode: 'photo' });
  };
  const off = !!health && !health.vision;

  return (
    <Page title="Photo doubts" subtitle="Send a picture, get it explained">
      <div style={{ display: 'grid', gap: 16 }}>
        {off && <div className="st-notice st-notice-warn">Photo questions are not switched on yet. You can type the question to your tutor instead.</div>}
        <input ref={file} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
        <div className="st-grid2">
          <button className="st-card-tint" disabled={off} onClick={() => cam.current?.click()} style={{ textAlign: 'center', cursor: 'pointer', color: 'inherit', display: 'grid', gap: 8, justifyItems: 'center', padding: '22px 10px', opacity: off ? 0.5 : 1 }}><Camera size={30} style={{ color: 'var(--st-accent)' }} /><span className="st-title st-h3">Take a photo</span></button>
          <button className="st-card-tint" disabled={off} onClick={() => file.current?.click()} style={{ textAlign: 'center', cursor: 'pointer', color: 'inherit', display: 'grid', gap: 8, justifyItems: 'center', padding: '22px 10px', opacity: off ? 0.5 : 1 }}><ImagePlus size={30} style={{ color: 'var(--st-accent)' }} /><span className="st-title st-h3">Choose pictures</span></button>
        </div>
        {(pics.length > 0 || uploading > 0) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {pics.map((p) => (
              <div key={p.key} style={{ position: 'relative' }}>
                <img src={p.url} alt="A picture to send" style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 16 }} />
                <button className="st-icon-btn" style={{ position: 'absolute', top: -7, right: -7, width: 26, height: 26, borderRadius: 99 }} aria-label="Remove this picture" onClick={() => setPics((x) => x.filter((y) => y.key !== p.key))}><X size={13} /></button>
              </div>
            ))}
            {Array.from({ length: uploading }, (_, i) => <div key={i} className="st-skel" style={{ width: 92, height: 92 }} />)}
          </div>
        )}
        <Field label="Anything to add? (optional)"><textarea className="st-input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I do not understand step 2" style={{ minHeight: 70 }} /></Field>
        {subjects.length > 0 && <Field label="Subject (optional)"><select className="st-input" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">Not sure</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <Field label="What help do you want?">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="st-chip" data-on={mode === 'full'} onClick={() => setMode('full')}>The full solution, step by step</button>
            <button className="st-chip" data-on={mode === 'hint'} onClick={() => setMode('hint')}>Just a hint to start</button>
          </div>
        </Field>
        <Btn kind="primary" block disabled={!pics.length || uploading > 0 || off} onClick={ask}>Ask my tutor</Btn>
        <Card>
          <p className="st-title st-h3" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Lightbulb size={16} style={{ color: 'var(--st-accent)' }} /> For a clear answer</p>
          <ul className="st-small st-muted" style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>{TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="st-tiny st-faint" style={{ marginTop: 10 }}>Your pictures are private. Only you and your tutor can open them, and you can delete them any time.</p>
        </Card>
        <Btn kind="ghost" onClick={() => goStudy('tutor')}>Back to my tutor</Btn>
      </div>
    </Page>
  );
};
export default PhotoDoubt;

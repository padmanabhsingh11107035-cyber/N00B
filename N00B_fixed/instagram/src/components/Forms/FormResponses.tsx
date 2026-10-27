import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Trash2, X } from 'lucide-react';
import { allResponses, clearResponses, deleteResponse, getForm, listResponses, type FormRow } from '../../services/formsApi';
import { answerText, countChoices, evalFormula, gridCounts, hasOptions, isAnswerable, npsOf, numericStats, perDay, rankingAverages, toCsv, toExcelXml, toJson, wordFrequency, type FormQuestion, type ResponseRow } from '../../utils/forms';

// The answers of a form: totals and charts made from the real stored answers (nothing is invented; a chart only appears when its question has answers), every answer one by one
// (25 at a time from the database), and the export. Only the owner can open this (the database refuses everybody else).

type Tab = 'summary' | 'questions' | 'responses';
const RANGES: Array<[string, number]> = [['Last 7 days', 7], ['Last 30 days', 30], ['Last 90 days', 90], ['All time', 0]];
const PAGE = 25;
const download = (name: string, text: string, type: string) => { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); };
const fileName = (t: string) => (t.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'form');

export const FormResponses: React.FC<{ formId: string; onBack: () => void }> = ({ formId, onBack }) => {
  const [form, setForm] = useState<FormRow | null>(null);
  const [rows, setRows] = useState<ResponseRow[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('summary');
  const [range, setRange] = useState(0);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { const [f, r] = await Promise.all([getForm(formId), allResponses(formId, 5000)]); setForm(f); setRows(r); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the responses.'); }
  }, [formId]);
  useEffect(() => { void load(); }, [load]);

  const qs = useMemo<FormQuestion[]>(() => (form?.published?.questions ?? form?.draft.questions ?? []), [form]);
  const filtered = useMemo(() => (rows ?? []).filter((r) => !range || Date.now() - new Date(r.created_at).getTime() <= range * 86400000), [rows, range]);

  if (error) return <div className="p-8 text-center"><p role="alert" className="text-red-400 mb-3">{error}</p><button type="button" onClick={() => void load()} className="px-4 py-2 rounded-full bg-white text-black font-bold cursor-pointer mr-2">Try again</button><button type="button" onClick={onBack} className="px-4 py-2 rounded-full bg-zinc-800 cursor-pointer">Back</button></div>;
  if (!form || !rows) return <div className="p-10 text-center text-zinc-400" role="status">Loading the answers…</div>;

  const quiz = !!(form.published ?? form.draft).settings?.quiz?.enabled;
  const exportAs = (kind: 'csv' | 'json' | 'xls') => {
    if (kind === 'csv') download(`${fileName(form.title)}-responses.csv`, toCsv(qs, rows, quiz), 'text/csv;charset=utf-8');
    else if (kind === 'xls') download(`${fileName(form.title)}-responses.xls`, toExcelXml(qs, rows, quiz), 'application/vnd.ms-excel');
    else download(`${fileName(form.title)}-responses.json`, toJson(form.title, qs, rows), 'application/json');
  };
  const clearAll = async () => {
    const typed = window.prompt(`This deletes all ${form.response_count} answers for good. Type DELETE to confirm.`);
    if (typed !== 'DELETE') return;
    try { await clearResponses(formId); setMsg('All answers were deleted.'); await load(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not delete.'); }
  };

  return (
    <div className="min-h-full text-white" data-testid="form-responses">
      <div className="sticky top-0 z-30 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-3 pt-2.5 pb-2 flex items-center gap-2">
          <button type="button" onClick={onBack} aria-label="Back" className="w-9 h-9 shrink-0 rounded-full border border-zinc-700 flex items-center justify-center cursor-pointer"><ArrowLeft className="w-4 h-4" /></button>
          <div className="min-w-0 flex-1"><h1 className="font-bold truncate">{form.title}</h1><p className="text-[11px] text-zinc-400">{form.response_count} {form.response_count === 1 ? 'response' : 'responses'}</p></div>
          <button type="button" onClick={() => exportAs('csv')} disabled={!rows.length} className="px-3 h-9 rounded-full border border-zinc-700 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer" data-testid="export-csv"><Download className="w-3.5 h-3.5" />CSV</button>
          <button type="button" onClick={() => exportAs('xls')} disabled={!rows.length} className="px-3 h-9 rounded-full border border-zinc-700 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer" data-testid="export-xls"><Download className="w-3.5 h-3.5" />Excel</button>
          <button type="button" onClick={() => exportAs('json')} disabled={!rows.length} className="px-3 h-9 rounded-full border border-zinc-700 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"><Download className="w-3.5 h-3.5" />JSON</button>
          <button type="button" onClick={() => window.print()} disabled={!rows.length} className="px-3 h-9 rounded-full border border-zinc-700 text-xs font-bold disabled:opacity-40 cursor-pointer">Print / PDF</button>
        </div>
        <div className="max-w-3xl mx-auto px-3 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist">
          {(['summary', 'questions', 'responses'] as Tab[]).map((id) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-8 px-3.5 rounded-full text-xs font-bold capitalize whitespace-nowrap cursor-pointer ${tab === id ? 'bg-white text-black' : 'border border-zinc-700 text-zinc-300'}`}>{id === 'responses' ? 'Individual' : id}</button>)}
          {tab !== 'responses' && <select aria-label="Date range" value={range} onChange={(e) => setRange(Number(e.target.value))} className="h-8 rounded-full bg-zinc-800 border border-zinc-700 text-xs px-3 ml-auto">{RANGES.map(([l, d]) => <option key={l} value={d}>{l}</option>)}</select>}
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-3 py-4 pb-24 space-y-3">
        {msg && <p role="status" className="p-3 rounded-xl bg-zinc-800 text-sm">{msg}</p>}
        {tab === 'summary' && <Summary rows={filtered} all={rows} qs={qs} />}
        {tab === 'questions' && <Questions rows={filtered} qs={qs} />}
        {tab === 'responses' && <Individual formId={formId} qs={qs} total={form.response_count} onChanged={load} />}
        {rows.length > 0 && <button type="button" onClick={() => void clearAll()} className="text-xs text-red-300 underline cursor-pointer">Delete all answers…</button>}
      </div>
    </div>
  );
};

const Card: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">{title && <h2 className="font-bold mb-2 break-words">{title}</h2>}{children}</section>;
const Bar: React.FC<{ label: string; count: number; pct: number; max: number }> = ({ label, count, pct, max }) => (
  <div className="mb-2"><div className="flex justify-between gap-2 text-sm"><span className="break-words min-w-0">{label}</span><span className="text-zinc-300 shrink-0">{count} · {pct}%</span></div><div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${max ? (count / max) * 100 : 0}%` }} /></div></div>
);

const QuizStats: React.FC<{ rows: ResponseRow[] }> = ({ rows }) => {
  const sc = rows.filter((r) => r.score != null && r.max_score);
  if (!sc.length) return null;
  const pct = sc.map((r) => Math.round((Number(r.score) / Number(r.max_score)) * 100)).sort((a, b) => a - b);
  const avg = Math.round(pct.reduce((x, y) => x + y, 0) / pct.length), mid = pct.length % 2 ? pct[pct.length >> 1] : Math.round((pct[pct.length / 2 - 1] + pct[pct.length / 2]) / 2);
  const buckets = Array.from({ length: 5 }, (_, i) => ({ label: `${i * 20}-${i === 4 ? 100 : i * 20 + 19}%`, count: pct.filter((v) => (i === 4 ? v >= 80 : v >= i * 20 && v < i * 20 + 20)).length }));
  const top = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <Card title="Quiz scores">
      <p className="text-sm mb-2">Average <b>{avg}%</b> · middle <b>{mid}%</b> · {sc.length} {sc.length === 1 ? 'person' : 'people'}</p>
      {buckets.map((b) => <Bar key={b.label} label={b.label} count={b.count} pct={Math.round((b.count / pct.length) * 1000) / 10} max={top} />)}
    </Card>
  );
};

const Summary: React.FC<{ rows: ResponseRow[]; all: ResponseRow[]; qs: FormQuestion[] }> = ({ rows, all, qs }) => {
  const days = 14, series = perDay(all, days), top = Math.max(1, ...series.map((d) => d.count));
  const today = all.filter((r) => r.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  const week = all.filter((r) => Date.now() - new Date(r.created_at).getTime() <= 7 * 86400000).length;
  const stat = (label: string, v: string | number) => <div className="rounded-xl bg-zinc-800/60 p-3"><p className="text-[11px] text-zinc-400">{label}</p><p className="text-2xl font-extrabold">{v}</p></div>;
  const nps = qs.filter((q) => q.type === 'nps').map((q) => ({ q, r: npsOf(q, rows) })).filter((x) => x.r);
  if (!all.length) return <Card><p className="text-center text-zinc-400 py-6">No answers yet. Share the link and they will appear here.</p></Card>;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{stat('Responses', rows.length)}{stat('Today', today)}{stat('Last 7 days', week)}{stat('Last answer', all[0] ? new Date(all[0].created_at).toLocaleDateString() : '-')}</div>
      <Card title="Answers per day (last 14 days)">
        <div className="flex items-end gap-1 h-32" role="img" aria-label={`Answers per day: ${series.map((d) => `${d.day} ${d.count}`).join(', ')}`}>
          {series.map((d) => <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full"><span className="text-[10px] text-zinc-400">{d.count || ''}</span><div className="w-full rounded-t bg-emerald-400" style={{ height: `${(d.count / top) * 85}%`, minHeight: d.count ? 4 : 1, opacity: d.count ? 1 : 0.25 }} /></div>)}
        </div>
        <div className="flex justify-between text-[10px] text-zinc-500 mt-1"><span>{series[0].day.slice(5)}</span><span>{series[series.length - 1].day.slice(5)}</span></div>
      </Card>
      <QuizStats rows={rows} />
      {nps.map(({ q, r }) => r && (
        <Card key={q.id} title={`NPS: ${q.title}`}>
          <p className="text-4xl font-extrabold">{r.nps > 0 ? '+' : ''}{r.nps}</p><p className="text-xs text-zinc-400 mb-2">from -100 to +100, {r.n} answers</p>
          <Bar label="Promoters (9-10)" count={r.promoters} pct={Math.round((r.promoters / r.n) * 100)} max={r.n} /><Bar label="Passives (7-8)" count={r.passives} pct={Math.round((r.passives / r.n) * 100)} max={r.n} /><Bar label="Detractors (0-6)" count={r.detractors} pct={Math.round((r.detractors / r.n) * 100)} max={r.n} />
        </Card>))}
    </>
  );
};

const PALETTE = ['#34d399', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171'];
/** The answers of a choice question as bars, a donut or a pie (the person picks); a table of the numbers is always there for screen readers. */
const ChoiceChart: React.FC<{ items: Array<{ label: string; count: number; pct: number }>; max: number }> = ({ items, max }) => {
  const [kind, setKind] = useState<'bars' | 'donut' | 'pie'>('bars');
  const total = items.reduce((x, i) => x + i.count, 0);
  let acc = 0;
  const stops = items.map((it, i) => { const from = (acc / (total || 1)) * 360; acc += it.count; return `${PALETTE[i % PALETTE.length]} ${from}deg ${(acc / (total || 1)) * 360}deg`; }).join(', ');
  return (
    <div>
      <div className="flex gap-1 mb-2" role="group" aria-label="Chart type">{(['bars', 'donut', 'pie'] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`px-2.5 h-7 rounded-full text-[11px] font-bold capitalize cursor-pointer ${kind === k ? 'bg-white text-black' : 'border border-zinc-700 text-zinc-300'}`}>{k}</button>)}</div>
      {kind === 'bars' ? items.map((x) => <Bar key={x.label} {...x} max={max} />) : (
        <div className="flex items-center gap-4 flex-wrap">
          <div role="img" aria-label={items.map((x) => `${x.label} ${x.pct}%`).join(', ')} className="w-36 h-36 rounded-full shrink-0 relative" style={{ background: total ? `conic-gradient(${stops})` : '#27272a' }}>{kind === 'donut' && <span className="absolute inset-[22%] rounded-full bg-zinc-900 flex items-center justify-center text-sm font-bold">{total}</span>}</div>
          <ul className="space-y-1 text-sm min-w-0">{items.map((x, i) => <li key={x.label} className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="break-words min-w-0">{x.label}</span><span className="text-zinc-400 shrink-0">{x.count} · {x.pct}%</span></li>)}</ul>
        </div>)}
    </div>
  );
};

const Questions: React.FC<{ rows: ResponseRow[]; qs: FormQuestion[] }> = ({ rows, qs }) => {
  const [q2, setQ2] = useState('');
  return (
    <>
      {qs.filter((q) => q.type === 'calculated' && q.formula).map((q) => { const v = rows.map((r) => evalFormula(q.formula ?? '', r.answers, qs)).filter((x): x is number => x != null); return <Card key={q.id} title={q.title}><p className="text-sm">{v.length ? `Average ${Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100} · from ${v.length} answers` : 'No values yet.'}</p></Card>; })}
      {qs.filter((q) => isAnswerable(q.type)).map((q) => {
        const answered = rows.filter((r) => r.answers[q.id] != null && r.answers[q.id] !== '').length;
        let body: React.ReactNode;
        if (!answered) body = <p className="text-sm text-zinc-500">No answers to this question yet.</p>;
        else if (q.type === 'ranking') { const r = rankingAverages(q, rows); body = <><p className="text-xs text-zinc-400 mb-2">Average place (1 is first). The lower, the more people want it.</p>{r.map((x) => <Bar key={x.label} label={`${x.label} (average place ${x.avg || '-'})`} count={x.n} pct={Math.round((x.n / answered) * 1000) / 10} max={answered} />)}</>; }
        else if (q.type === 'grid') { const g = gridCounts(q, rows); const mx = Math.max(1, ...g.flatMap((r) => r.cells.map((c) => c.count))); body = <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th />{g[0]?.cells.map((c) => <th key={c.col} className="px-2 py-1 font-semibold">{c.col}</th>)}</tr></thead><tbody>{g.map((r) => <tr key={r.row}><th scope="row" className="text-left pr-3 py-1 font-medium">{r.row}</th>{r.cells.map((c) => <td key={c.col} className="text-center p-1"><span className="block rounded-md py-1.5 font-bold" style={{ background: `rgba(52,211,153,${0.08 + (c.count / mx) * 0.7})` }}>{c.count}</span></td>)}</tr>)}</tbody></table></div>; }
        else if (q.type === 'thumbs') { const up = rows.filter((r) => r.answers[q.id] === 'up').length, down = rows.filter((r) => r.answers[q.id] === 'down').length; body = <><Bar label="Thumbs up" count={up} pct={Math.round((up / answered) * 1000) / 10} max={answered} /><Bar label="Thumbs down" count={down} pct={Math.round((down / answered) * 1000) / 10} max={answered} /></>; }
        else if (q.type === 'signature') body = <p className="text-sm">{answered} signed. Open "Individual" to see each signature.</p>;
        else if (hasOptions(q.type)) { const c = countChoices(q, rows); const m = Math.max(...c.map((x) => x.count)); body = <><ChoiceChart items={c} max={m} />{q.type === 'checkboxes' && <p className="text-[11px] text-zinc-500">People can pick several options, so the percentages can add up to more than 100%.</p>}</>; }
        else if (q.type === 'nps') { const r = npsOf(q, rows); body = r ? <p className="text-sm">NPS <b>{r.nps}</b> from {r.n} answers: {r.promoters} promoters, {r.passives} passives, {r.detractors} detractors.</p> : null; }
        else if (['scale', 'rating', 'heart', 'number'].includes(q.type)) { const s = numericStats(q, rows); body = s && <><p className="text-sm mb-2">Average <b>{s.mean}</b> · middle <b>{s.median}</b> · lowest {s.min} · highest {s.max} · {s.n} answers</p>{s.dist.map(([v, n]) => <Bar key={v} label={String(v)} count={n} pct={Math.round((n / s.n) * 1000) / 10} max={Math.max(...s.dist.map((d) => d[1]))} />)}</>; }
        else if (q.type === 'consent') body = <p className="text-sm">{answered} {answered === 1 ? 'person' : 'people'} agreed.</p>;
        else {
          const texts = rows.map((r) => answerText(q, r.answers[q.id])).filter(Boolean);
          const shown = (q2 ? texts.filter((t) => t.toLowerCase().includes(q2.toLowerCase())) : texts).slice(0, 30);
          const words = q.type === 'paragraph' || q.type === 'short' ? wordFrequency(texts) : [];
          body = <>{words.length > 2 && <p className="text-xs text-zinc-400 mb-2">Common words: {words.map((w) => `${w.word} (${w.count})`).join(', ')}</p>}<input value={q2} onChange={(e) => setQ2(e.target.value)} placeholder="Search the answers" aria-label="Search the answers" className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm mb-2" /><ul className="space-y-1 max-h-64 overflow-auto">{shown.map((t, i) => <li key={i} className="text-sm bg-zinc-800/50 rounded-lg px-3 py-1.5 break-words whitespace-pre-wrap">{t}</li>)}</ul>{texts.length > 30 && !q2 && <p className="text-[11px] text-zinc-500 mt-1">The first 30 of {texts.length}. Search, or open "Individual".</p>}</>;
        }
        return <Card key={q.id} title={q.title}><p className="text-[11px] text-zinc-400 -mt-1 mb-2">{answered} {answered === 1 ? 'answer' : 'answers'}</p>{body}</Card>;
      })}
    </>
  );
};

const Individual: React.FC<{ formId: string; qs: FormQuestion[]; total: number; onChanged: () => void }> = ({ formId, qs, total, onChanged }) => {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: ResponseRow[]; total: number } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [find, setFind] = useState('');
  useEffect(() => { let alive = true; setErr(''); listResponses(formId, page, PAGE).then((d) => alive && setData(d)).catch((e) => alive && setErr(e instanceof Error ? e.message : 'Could not load.')); return () => { alive = false; }; }, [formId, page, total]);
  const cols = qs.filter((q) => isAnswerable(q.type)).slice(0, 3);
  const rows = (data?.rows ?? []).filter((r) => !find || qs.some((q) => answerText(q, r.answers[q.id]).toLowerCase().includes(find.toLowerCase())));
  const cur = open != null ? data?.rows[open] : null;
  const remove = async (id: string) => { if (!window.confirm('Delete this answer for good?')) return; try { await deleteResponse(id); setOpen(null); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete.'); } };
  if (err) return <p role="alert" className="text-red-400">{err}</p>;
  if (!data) return <p className="text-zinc-400" role="status">Loading…</p>;
  if (!data.total) return <Card><p className="text-center text-zinc-400 py-6">No answers yet.</p></Card>;
  return (
    <>
      <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search this page of answers" aria-label="Search this page" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
      <div className="rounded-2xl border border-zinc-800 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-zinc-900 text-zinc-400 text-xs"><tr><th className="text-left p-2.5 font-semibold">When</th>{cols.map((c) => <th key={c.id} className="text-left p-2.5 font-semibold max-w-[10rem] truncate">{c.title}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} onClick={() => setOpen(data.rows.indexOf(r))} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(data.rows.indexOf(r)); }} tabIndex={0} className="border-t border-zinc-800 hover:bg-zinc-900 cursor-pointer"><td className="p-2.5 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>{cols.map((c) => <td key={c.id} className="p-2.5 max-w-[10rem] truncate">{answerText(c, r.answers[c.id])}</td>)}</tr>)}</tbody></table></div>
      <div className="flex items-center justify-between text-sm"><span className="text-zinc-400">{page * PAGE + 1}-{Math.min(data.total, page * PAGE + PAGE)} of {data.total}</span><span className="flex gap-2"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="px-3 h-8 rounded-full border border-zinc-700 disabled:opacity-40 cursor-pointer">Previous</button><button type="button" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)} className="px-3 h-8 rounded-full border border-zinc-700 disabled:opacity-40 cursor-pointer">Next</button></span></div>
      {cur && (
        <div className="fixed inset-0 z-[130] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="One response">
          <div className="w-full sm:max-w-lg max-h-[90vh] overflow-auto rounded-t-3xl sm:rounded-3xl bg-zinc-900 border border-zinc-800 p-5 space-y-3 text-white">
            <div className="flex items-center justify-between"><p className="text-xs text-zinc-400">{new Date(cur.created_at).toLocaleString()} · {cur.id.slice(0, 8)}</p><button type="button" onClick={() => setOpen(null)} aria-label="Close" className="w-8 h-8 rounded-full border border-zinc-700 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button></div>
            {qs.filter((q) => isAnswerable(q.type)).map((q) => <div key={q.id}><p className="text-xs text-zinc-400">{q.title}</p><p className="break-words whitespace-pre-wrap">{answerText(q, cur.answers[q.id]) || <span className="text-zinc-600">No answer</span>}</p></div>)}
            <div className="flex items-center justify-between pt-2"><span className="flex gap-2"><button type="button" disabled={open === 0} onClick={() => setOpen((open ?? 1) - 1)} aria-label="Previous response" className="w-9 h-9 rounded-full border border-zinc-700 flex items-center justify-center disabled:opacity-40 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button><button type="button" disabled={open === data.rows.length - 1} onClick={() => setOpen((open ?? 0) + 1)} aria-label="Next response" className="w-9 h-9 rounded-full border border-zinc-700 flex items-center justify-center disabled:opacity-40 cursor-pointer"><ChevronRight className="w-4 h-4" /></button></span><span className="flex gap-2"><button type="button" onClick={() => window.print()} className="px-3 h-9 rounded-full border border-zinc-700 text-sm cursor-pointer">Print</button><button type="button" onClick={() => void remove(cur.id)} className="px-3 h-9 rounded-full border border-red-500/50 text-red-300 text-sm inline-flex items-center gap-1.5 cursor-pointer"><Trash2 className="w-4 h-4" />Delete</button></span></div>
          </div>
        </div>)}
    </>
  );
};

export default FormResponses;

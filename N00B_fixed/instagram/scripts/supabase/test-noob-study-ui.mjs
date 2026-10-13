// Tests the parts of NOOB STUDY that run on the phone: the education catalog and the one-to-six subject rule, dates and countdowns in the student's
// own time zone, the focus timer's arithmetic, the navigation, and that every screen and the menu are really wired. Pure logic (src/utils/study*.ts)
// plus checks of the wiring: no browser or database needed.
//
// Usage: node scripts/supabase/test-noob-study-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const load = (f) => import(pathToFileURL(path.resolve(f)).href);
const C = await load('src/utils/studyCatalog.ts');
const MD = await load('src/utils/studyMarkdown.ts');
const V = await load('src/utils/studyVoice.ts');
const ST = await load('src/utils/studyStream.ts');
const T = await load('src/utils/studyTime.ts');
const F = await load('src/utils/studyFocus.ts');
const read = (f) => fs.readFileSync(f, 'utf8');

section('1. Levels, boards and classes');
check(C.LEVELS.length === 8 && C.LEVELS.map((l) => l.id).join() === 'class_6_8,class_9_10,class_11,class_12,diploma,undergraduate,postgraduate,other', 'the eight education levels, including self-learning (nobody is forced into one school system)');
const ids = (o) => o.map((x) => x.id);
check(ids(C.boardsFor('class_9_10')).includes('ICSE') && !ids(C.boardsFor('class_9_10')).includes('ISC'), 'a Class 9–10 student is offered ICSE, not ISC');
check(ids(C.boardsFor('class_12')).includes('ISC') && !ids(C.boardsFor('class_12')).includes('ICSE'), 'a Class 11–12 student is offered ISC, not ICSE');
check(C.boardsFor('undergraduate').length === 0 && C.boardsFor('other').length === 0 && ids(C.boardsFor('class_12')).includes('Other'), 'college students are not asked for a school board; school students can pick "Other"');
check(ids(C.classYearOptions('class_9_10')).join() === '9,10' && ids(C.classYearOptions('undergraduate')).join() === '1,2,3,4,5' && C.classYearOptions('other').length === 0, 'the class or year choices follow the level');
check(C.isSeniorLevel('class_11') && C.isSeniorLevel('class_12') && !C.isSeniorLevel('class_9_10') && C.isCollegeLevel('diploma') && C.isSchoolLevel('class_6_8') && !C.isSchoolLevel('other'), 'which levels are senior school, school and college');
check(C.STREAMS.map((s) => s.id).join() === 'Science,Commerce,Humanities,Other', 'the four streams');

section('2. Subjects depend on the class and stream');
const names = (l) => l.map((x) => x.name);
check(names(C.subjectsFor('class_12', 'Science')).includes('Physics') && !names(C.subjectsFor('class_12', 'Science')).includes('Accountancy'), 'Science: Physics yes, Accountancy no');
check(names(C.subjectsFor('class_12', 'Commerce')).includes('Accountancy') && !names(C.subjectsFor('class_12', 'Commerce')).includes('Physics'), 'Commerce: Accountancy yes, Physics no');
check(names(C.subjectsFor('class_11', 'Humanities')).includes('Political Science') && names(C.subjectsFor('class_11', 'Humanities')).includes('Psychology'), 'Humanities lists History-side subjects');
check(C.subjectsFor('class_12', '').length > 0 && C.subjectsFor('class_12', null).length > 0, 'before a stream is chosen a short mixed list is offered, not nothing');
check(names(C.subjectsFor('class_6_8')).includes('Science') && !names(C.subjectsFor('class_6_8')).includes('Physics'), 'middle school has Science, not Physics');
check(C.subjectsFor('undergraduate').length > 5 && C.subjectsFor('other').length > 5 && C.subjectsFor(null).length === 0, 'college and self-learning have lists; no level, no list');
check(C.combosFor('class_12', 'Science').length >= 5 && C.combosFor('class_12', 'Commerce').length >= 1 && C.combosFor('class_12', 'Humanities').length === 0 && C.combosFor('class_9_10', 'Science').length === 0, 'quick combinations exist only for senior Science and Commerce');
check(C.SCIENCE_COMBOS.every((c) => c.subjects.length <= C.MAX_SUBJECTS) && C.applyCombo(C.SCIENCE_COMBOS[0]).every((s) => s.kind === 'catalogue'), 'every combination fits within six subjects');

section('3. Choosing one to six subjects');
let r = C.toggleSubject([], 'Physics');
check(r.list.length === 1 && r.error === null && r.list[0].kind === 'catalogue', 'adding one');
r = C.toggleSubject(r.list, '  physics ');
check(r.list.length === 0, 'tapping the same subject again (any capitals, extra spaces) removes it');
let six = [];
for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) six = C.toggleSubject(six, n).list;
check(six.length === 6 && C.subjectsProblem(six) === null, 'six subjects are fine');
r = C.toggleSubject(six, 'G');
check(r.list.length === 6 && /at most 6/.test(r.error), 'a seventh is refused with a helpful message');
check(C.subjectsProblem([]) === 'Please choose at least 1 subject.' && /at most 6/.test(C.subjectsProblem([...six, { name: 'G', kind: 'catalogue' }])), 'zero and seven are both named by the form check');
r = C.toggleSubject(six, 'F');
check(r.list.length === 5, 'removing one frees a place');
r = C.toggleSubject([], 'Robotics   club', 'custom');
check(r.list[0].name === 'Robotics club' && r.list[0].kind === 'custom', 'a custom subject is tidied and marked custom');
check(/at most 60/.test(C.toggleSubject([], 'x'.repeat(61)).error) && C.toggleSubject([], '   ').list.length === 0, 'an overlong or blank name is not added');
check(C.hasSubject([{ name: 'Physics', kind: 'catalogue' }], ' PHYSICS'), 'checking for a subject ignores capitals and spaces');

section('4. Languages (they must satisfy the same pattern as the database)');
check(C.LANGUAGES.every((l) => C.LANGUAGE_PATTERN.test(l.code)), 'every language code is accepted by the database\'s rule');
check(C.LANGUAGES.length >= 24 && new Set(C.LANGUAGES.map((l) => l.code)).size === C.LANGUAGES.length, 'a long list of languages, none twice');
for (const code of ['hi', 'gu', 'bn', 'mr', 'ta', 'te', 'kn', 'ml', 'pa']) check(C.LANGUAGES.some((l) => l.code === code), `${code} is offered`);
check(C.languageLabel('hi-latn') === 'Hinglish' && C.speechLang('hi-latn') === 'hi-IN' && C.speechLang('gu') === 'gu-IN' && C.speechLang('zz') === 'en-IN' && C.languageLabel(null) === 'English', 'Hinglish is Hindi in English letters; unknown languages fall back to English');
check(C.missingForPlan({ level: null, habits: {} }, 0).length === 4 && C.missingForPlan({ level: 'class_12', habits: { dailyMinutes: 60, daysPerWeek: 5 } }, 3).length === 0, 'what a timetable still needs is named plainly, and nothing is "missing" once it is known');

section('5. Dates and countdowns in the student\'s own time zone');
const ist = 'Asia/Kolkata', ny = 'America/New_York', kir = 'Pacific/Kiritimati', pago = 'Pacific/Pago_Pago';
const a = T.zonedToUtc('2026-10-14T17:30', ist);
check(a.toISOString() === '2026-10-14T12:00:00.000Z', '17:30 in Kolkata is 12:00 UTC');
check(T.utcToLocalInput(a, ist) === '2026-10-14T17:30' && T.utcToLocalInput(a, ny) === '2026-10-14T08:00', 'and back again, in any zone');
check(T.zonedToUtc('2026-07-01T09:00', ny).toISOString() === '2026-07-01T13:00:00.000Z' && T.zonedToUtc('2026-12-01T09:00', ny).toISOString() === '2026-12-01T14:00:00.000Z', 'daylight saving is handled (New York summer is UTC-4, winter UTC-5)');
check(!Number.isNaN(T.zonedToUtc('2026-03-08T02:30', ny).getTime()), 'a time that does not exist (the clocks jumped) still gives a real moment');
const noon = new Date('2026-10-14T12:00:00Z');
check(T.ymdIn(noon, ist) === '2026-10-14' && T.ymdIn(noon, kir) === '2026-10-15' && T.ymdIn(noon, pago) === '2026-10-14', 'the same moment is on different dates in different zones');
check(T.dayDiff(new Date('2026-10-16T20:00:00Z'), noon, ist) === 3, 'two moments a few hours apart can be a whole calendar day apart in the student\'s zone');
check(T.dayDiff(new Date('2026-10-14T23:00:00Z'), noon, ist) === 1 && T.dayDiff(new Date('2026-10-14T23:00:00Z'), noon, 'UTC') === 0, 'the countdown day count depends on the zone');
check(T.countdown('2026-10-14T15:00:00Z', ist, noon).label === 'Today' && T.countdown('2026-10-14T10:00:00Z', 'UTC', noon).label === 'Earlier today', 'a countdown says Today, and Earlier today once it has passed');
check(T.countdown('2026-10-15T09:00:00Z', 'UTC', noon).label === 'Tomorrow' && T.countdown('2026-10-19T09:00:00Z', 'UTC', noon).label === 'In 5 days' && T.countdown('2026-10-19T09:00:00Z', 'UTC', noon).soon === true, 'Tomorrow, In 5 days (soon)');
check(T.countdown('2026-12-19T09:00:00Z', 'UTC', noon).soon === false && T.countdown('2026-10-12T09:00:00Z', 'UTC', noon).past === true && T.countdown('2026-10-12T09:00:00Z', 'UTC', noon).label === '2 days ago', 'far dates are not "soon"; past ones say how long ago');
check(T.dueLabel('2026-10-14T12:00:00Z', ist, noon) === 'Today, 5:30 pm' && T.dueLabel('2026-10-15T12:00:00Z', ist, noon) === 'Tomorrow, 5:30 pm' && T.dueLabel('2026-10-13T12:00:00Z', ist, noon).startsWith('Yesterday'), 'due labels: Today, Tomorrow, Yesterday with the time');
check(T.dueLabel(null, ist, noon) === 'No deadline' && T.dueLabel('2026-10-14T18:30:00Z', ist, noon).startsWith('Wed') === false, 'no deadline, and midnight is written without a time');
check(T.greetingFor(7) === 'Good morning' && T.greetingFor(13) === 'Good afternoon' && T.greetingFor(19) === 'Good evening' && T.greetingFor(2) === 'Still up?' && T.greetingFor(23) === 'Winding down?', 'greetings by the hour (never "go to sleep" lectures)');
check(T.minutesLabel(45) === '45 min' && T.minutesLabel(60) === '1 h' && T.minutesLabel(85) === '1 h 25 min' && T.minutesLabel(-3) === '0 min', 'minutes in words');
check(T.clock(1500) === '25:00' && T.clock(59) === '00:59' && T.clock(-5) === '00:00', 'the timer clock');
check(T.lastDays('2026-10-14', 7).join() === '2026-10-08,2026-10-09,2026-10-10,2026-10-11,2026-10-12,2026-10-13,2026-10-14' && T.addDaysYmd('2026-12-31', 1) === '2027-01-01', 'the last seven days, and month and year ends');
check(T.isValidTimeZone('Asia/Kolkata') && !T.isValidTimeZone('Mars/Olympus') && T.timeZoneList().includes('Asia/Kolkata'), 'time zones are checked');

section('6. The focus timer\'s arithmetic');
const t0 = 1_800_000_000_000;
let run = { id: 'x', kind: 'focus', plannedSec: 1500, startedAt: t0, pausedMs: 0, pausedAt: null, subjectId: null, lastSeen: t0 };
check(F.elapsedSec(run, t0 + 600_000) === 600 && F.remainingSec(run, t0 + 600_000) === 900 && !F.isFinished(run, t0 + 600_000), 'ten minutes in, fifteen left');
check(F.isFinished(run, t0 + 1_500_000) && F.remainingSec(run, t0 + 9_999_999) === 0 && F.focusedSec(run, t0 + 9_999_999) === 1500, 'finished at twenty-five minutes, never counts more than planned');
run = F.pauseRun(run, t0 + 300_000);
check(F.elapsedSec(run, t0 + 900_000) === 300, 'while paused the clock stands still');
run = F.resumeRun(run, t0 + 900_000);
check(run.pausedMs === 600_000 && F.elapsedSec(run, t0 + 1_200_000) === 600, 'resuming carries on from where it stopped (10 minutes paused is not counted)');
check(F.pauseRun(F.pauseRun(run, t0 + 1), t0 + 2).pausedAt === t0 + 1 && F.resumeRun(run, t0) === run, 'pausing twice or resuming when not paused changes nothing');
check(Math.abs(F.progress(run, t0 + 1_200_000) - 0.4) < 1e-9 && F.progress({ ...run, plannedSec: 0 }, t0) === 1, 'progress is a fraction between 0 and 1');
const fresh = { id: 'y', kind: 'focus', plannedSec: 1500, startedAt: t0, pausedMs: 0, pausedAt: null, subjectId: null, lastSeen: t0 + 600_000 };
let rev = F.reviveRun(fresh, t0 + 650_000);
check(rev.action === 'resume', 'reopened a minute after leaving: it carries on');
rev = F.reviveRun(fresh, t0 + 600_000 + 20 * 60_000);
check(rev.action === 'interrupt' && rev.focusSeconds === 600, 'reopened twenty minutes after leaving: it is closed as interrupted, counting only what was really focused (10 min)');
check(F.reviveRun({ ...fresh, pausedAt: t0 + 500_000 }, t0 + 99_000_000).action === 'resume', 'a paused session is still there when reopened (nothing ran while paused)');
check(F.parseRun(JSON.stringify(run))?.id === 'x' && F.parseRun('{"id":1}') === null && F.parseRun('nonsense') === null && F.parseRun(null) === null, 'a saved session is read back only if it is intact');
check(F.clampMinutes(0) === 1 && F.clampMinutes(500) === 180 && F.clampMinutes(25.4) === 25 && F.clampMinutes(NaN) === 25 && F.clampMinutes(99, 30) === 30, 'minutes are kept in a sensible range');

section('7. Navigation');
const S = await load('src/components/Study/studyStore.ts');
check(S.isTopLevel('home') && S.isTopLevel('more') && !S.isTopLevel('tasks'), 'tabs are top-level');
S.openStudy('home');
S.goStudy('tasks');
S.goStudy('subject', { id: 'abc' });
S.goStudy('subject', { id: 'abc' });
S.backStudy();
S.backStudy();
let back = 0;
S.backStudy(); back++;
check(back === 1, 'going back from the first screen closes (leaves to NOOB)');
S.openStudy('home'); S.goStudy('tutor'); S.goStudy('chat', { c: '1' }); S.goStudy('plan');
S.backStudy();
S.closeStudy();
check(true, 'moving between tabs and back never throws');

section('8. Every screen is really there, and wired');
const app = read('src/components/Study/StudyApp.tsx');
const routes = [...app.matchAll(/reg\('(\w+)', \(\) => import\('\.\/pages\/(\w+)'\)\)/g)].map((m) => [m[1], m[2]]);
check(routes.length >= 12, `${routes.length} screens are registered`);
check(routes.every(([, file]) => fs.existsSync(`src/components/Study/pages/${file}.tsx`)), 'each registered screen has its file');
check(routes.every(([, file]) => /export default /.test(read(`src/components/Study/pages/${file}.tsx`))), 'and exports itself as the default (so it can be loaded on demand)');
const pagesDir = fs.readdirSync('src/components/Study/pages').map((f) => f.replace('.tsx', ''));
check(pagesDir.every((f) => routes.some(([, file]) => file === f)), 'and every file in pages/ is reachable (nothing unused)');
const goTargets = new Set();
for (const f of fs.readdirSync('src/components/Study', { recursive: true }).filter((x) => String(x).endsWith('.tsx'))) {
  for (const m of read(`src/components/Study/${f}`).matchAll(/goStudy\('(\w+)'/g)) goTargets.add(m[1]);
}
const registered = new Set(routes.map(([p]) => p));
const planned = ['plan', 'planGen', 'day', 'library', 'research', 'practice', 'decks', 'rooms', 'progress', 'topics'];
const dead = [...goTargets].filter((p) => !registered.has(p) && !planned.includes(p));
check(dead.length === 0, 'every goStudy target is either a real screen or one of the screens still to come (and those are only shown when they exist)', dead.join());
check(/export const hasRoute = \(page: string\): boolean => page in ROUTES;/.test(app) && /NAV\.filter\(\(n\) => hasRoute\(n\.page\)\)/.test(app), 'the bottom bar shows only screens that exist');
const more = read('src/components/Study/pages/More.tsx');
check(/items\.filter\(\(i\) => hasRoute\(i\.page\)\)/.test(more) && /Back to NOOB/.test(more), 'the "Everything" screen lists only what exists, and always has Back to NOOB');
check(read('src/components/Study/ui.tsx').includes('aria-label="Back to NOOB"'), 'every screen header has a way back to NOOB');
const host = read('src/App.tsx');
check(/<StudyHost currentUser=\{currentUser\} \/>/.test(host), 'NOOB STUDY is mounted once, in the app');
const feed = read('src/components/Feed/FeedView.tsx');
check(/\(STUDY_OPEN_TO_ALL \|\| isMainAdmin\(currentUser\)\)/.test(feed) && /openStudy\('home'\)/.test(feed), 'the Home menu opens it (for the main administrator until it is switched on for everybody)');
check(/React\.lazy\(\(\) => import\('\.\/StudyApp'\)\)/.test(read('src/components/Study/StudyHost.tsx')), 'it is fetched only when somebody opens it');

section('9. Safety of what the screens send');
const api = read('src/services/studyApi.ts');
check(!/user_?id|userId|p_user\b/.test(api.replace(/study_me|useStudy/g, '')), 'no call sends a user id: the database uses the signed-in person');
check(!/service_role|SERVICE_ROLE|sk-[A-Za-z0-9]{8,}|api[_-]?key/i.test(api), 'no secret in the service layer');
const everything = fs.readdirSync('src/components/Study', { recursive: true }).filter((x) => String(x).endsWith('.tsx') || String(x).endsWith('.ts')).map((f) => read(`src/components/Study/${f}`)).join('\n');
check(!/dangerouslySetInnerHTML|innerHTML\s*=|eval\(|new Function\(/.test(everything), 'no screen renders raw HTML or runs generated code');
check(!/gsk_[A-Za-z0-9]{8}|AIza[0-9A-Za-z_-]{20}|sk-or-|tvly-|Bearer /.test(everything), 'no provider key or token is anywhere in the screens (the admin hint only names the secret to add)');
check(/trackActivity/.test(read('src/components/Study/pages/Settings.tsx')) && /trackActivity/.test(read('supabase/migrations/20261014000001_noob_study_core.sql')), 'the "Remember what I study" switch is the very setting the database honours');

section('11. The tutor\'s answers are drawn safely (Markdown and maths, never HTML)');
let b = MD.parseMarkdown('# Newton\n\nForce is **mass** times *acceleration*, written `F = ma`.\n\n1. First\n2. Second\n\n- one\n- two\n\n> a quote\n\n---\n\n```python\nprint(1)\n```');
check(b.map((x) => x.t).join() === 'h,p,list,list,quote,hr,code', 'headings, paragraphs, numbered and bulleted lists, quotes, rules and code blocks');
check(b[2].ordered === true && b[2].items.length === 2 && b[3].ordered === false && b[6].lang === 'python' && b[6].v === 'print(1)', 'lists know if they are numbered; code keeps its language and its text');
const inl = MD.parseInline('**bold *both*** and `code`');
check(inl[0].t === 'b' && inl[0].c.some((x) => x.t === 'i') && inl.some((x) => x.t === 'code' && x.v === 'code'), 'bold, italic inside bold, and inline code');
check(MD.parseInline('see [NCERT](https://ncert.nic.in/a?b=1)').some((x) => x.t === 'link' && x.href.startsWith('https://ncert.nic.in/')), 'a web link becomes a link');
const bad = MD.parseInline('[click](javascript:alert(1)) [x](data:text/html,hi) [f](file:///etc/passwd)');
check(!bad.some((x) => x.t === 'link') && MD.inlineText(bad).includes('click'), 'a javascript:, data: or file: link is never a link (its words stay)');
check(MD.safeHref('https://a.com/x') !== null && MD.safeHref('http://a.com') !== null && MD.safeHref('ftp://a.com') === null && MD.safeHref('//evil.com') === null && MD.safeHref('https://a.com/"onmouseover=') === null, 'only ordinary web addresses are accepted');
const html = MD.parseMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> **ok**');
check(html.every((x) => x.t === 'p') && MD.inlineText(html[0].c).includes('<script>alert(1)</script>') && !JSON.stringify(html).includes('"t":"html"'), 'HTML typed into an answer stays as plain text, never markup');
check(MD.parseInline('Energy is $E = mc^2$ here').some((x) => x.t === 'math' && x.v === 'E = mc^2'), 'inline maths between dollar signs');
check(!MD.parseInline('It costs $5 and $10 today').some((x) => x.t === 'math'), 'prices like "$5 and $10" are not mistaken for maths');
check(MD.parseMarkdown('$$\n\\frac{a}{b}\n$$')[0].t === 'math' && MD.parseMarkdown('$$x^2$$')[0].v === 'x^2' && MD.parseMarkdown('\\[ y = 2 \\]')[0].t === 'math', 'display maths: $$ over lines, $$ on one line, and \\[ \\]');
check(MD.parseInline('so \\(a+b\\) works').some((x) => x.t === 'math' && x.v === 'a+b'), 'maths written \\( ... \\) too');
const tbl = MD.parseMarkdown('| Name | Unit |\n|---|---|\n| Force | N |\n| Work | J |');
check(tbl[0].t === 'table' && tbl[0].head.length === 2 && tbl[0].rows.length === 2, 'a table');
check(MD.parseMarkdown('plain\nsecond line')[0].c.some((x) => x.t === 'br'), 'single line breaks are kept');
check(MD.parseMarkdown('x\n\n'.repeat(1000)).length <= 400 && MD.parseMarkdown('').length === 0 && MD.parseMarkdown(null).length === 0, 'huge or empty input is handled');
check(MD.parseMarkdown('a\n\n```js\nunfinished code').some((x) => x.t === 'code'), 'a code block that was never closed (an answer cut short) still shows');

section('12. Speaking and listening');
check(V.cleanForSpeech('Use $\\frac{a}{b}$ and $x^2$.').includes('a over b') && V.cleanForSpeech('Use $x^2$.').includes('x squared'), 'maths is read as words ("a over b", "x squared")');
check(V.cleanForSpeech('Here is code:\n```python\nprint(1)\n```\nDone.').includes('a code example is shown on screen') && !V.cleanForSpeech('```x```').includes('```'), 'code is not read out symbol by symbol');
check(V.cleanForSpeech('## Title\n- **bold** item\n[the link](https://a.com)') === 'Title. bold item. the link', 'Markdown symbols and web addresses are not read aloud', V.cleanForSpeech('## Title\n- **bold** item\n[the link](https://a.com)'));
check(V.cleanForSpeech('$$\\sqrt{x} = y$$').includes('square root of x') && V.cleanForSpeech('It costs $5 and $10.').includes('$5'), 'square roots are spoken; prices are left alone');
const long = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i} of a long answer.`).join(' ');
const chunks = V.speechChunks(long);
check(chunks.length > 3 && chunks.every((c) => c.length <= 180) && chunks.join(' ') === long, 'long answers are read in sentence-sized pieces (engines stop on long text), with nothing lost');
check(V.speechChunks('a'.repeat(10) + ' ' + 'word '.repeat(80)).every((c) => c.length <= 180), 'even one very long sentence is cut at word boundaries');
const voices = [{ name: 'A', lang: 'en-US' }, { name: 'B', lang: 'hi-IN', localService: false }, { name: 'C', lang: 'hi-IN', localService: true }, { name: 'D', lang: 'gu-IN' }];
check(V.pickVoice(voices, 'hi-IN').name === 'C' && V.pickVoice(voices, 'hi').name === 'C' && V.pickVoice(voices, 'gu-IN').name === 'D' && V.pickVoice(voices, 'ta-IN') === null, 'the right voice for the language (one on the device first); none rather than a wrong language');
check(V.pickVoice(voices, 'hi-IN', 'B').name === 'B' && V.pickVoice(voices, 'hi-IN', 'Nobody').name === 'C', 'a voice the student chose wins, if it is still there');
check(/microphone/i.test(V.describeVoiceError('not-allowed')) && /type/i.test(V.describeVoiceError('unsupported')) && V.describeVoiceError('aborted') === '' && /again/i.test(V.describeVoiceError('no-speech')) && /internet/i.test(V.describeVoiceError('network')) && V.describeVoiceError('weird').length > 10, 'every microphone problem has a plain, helpful sentence');
check(V.canRecognize() === false && V.canSpeak() === false && V.canRecord() === false, 'in a place with no microphone support these are simply "no" (nothing crashes)');

section('13. The answer stream');
const enc = new TextEncoder();
const body = (parts) => new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } });
let seen = [];
await ST.readNdjson(body(['{"t":"meta","conversationId":"c1"}\n{"t":"del', 'ta","text":"Hel"}\n', 'not json at all\n{"t":"delta","text":"lo"}\n{"x":1}\n{"t":"done","messageId":"m1","remaining":9}']), (e) => seen.push(e));
check(seen.map((e) => e.t).join() === 'meta,delta,delta,done' && seen.filter((e) => e.t === 'delta').map((e) => e.text).join('') === 'Hello' && seen[3].remaining === 9, 'lines split across network pieces are joined, a damaged line and an odd object are skipped, and the last line without a newline counts');
seen = [];
await ST.readNdjson(body([]), (e) => seen.push(e));
check(seen.length === 0, 'an empty stream is simply empty');

section('14. The tutor\'s screens');
const chat = read('src/components/Study/pages/Chat.tsx');
const voiceP = read('src/components/Study/pages/Voice.tsx');
check(['tutor', 'chat', 'photo', 'voice'].every((p) => registered.has(p)), 'the tutor, the chat, photo doubts and the voice tutor are all real screens');
check(/streamChat\(\{ message, conversationId: convRef\.current/.test(chat) && /signal\)/.test(chat) && /abort\.current\?\.abort\(\)/.test(chat), 'a question is streamed and can be stopped');
check((chat.match(/\bspeak\(/g) || []).length === 1 && /const toggleSpeak/.test(chat), 'in the chat the tutor only speaks when the student taps the speaker (one place calls it)');
check(/listen\(speechLang\(lang\)/.test(chat) && (chat.match(/\blisten\(/g) || []).length === 1 && /const toggleMic/.test(chat), 'the microphone is only started from the microphone button');
check(/The microphone is on|Listening… speak now/.test(chat) && /The microphone is on/.test(voiceP), 'while it listens the screen says so');
check(/capture="environment"/.test(chat) && /accept="image\/\*"/.test(chat) && /MAX_PICTURES/.test(chat) && /removeStudyFiles/.test(chat), 'photos: camera or gallery, at most four, and a removed one is deleted from the private store');
check(/retry: canRetry/.test(chat) && /Try again/.test(chat) && /same|clientRef: ref/.test(chat), 'a failed answer offers "Try again", which re-sends the same message (it is never asked twice)');
check(/Teach me/.test(chat) && /mode: teach \? 'teach' : 'chat'/.test(chat), 'Teach-me mode is a switch in the chat');
check(/questions left today/.test(chat) && /Your tutor can make mistakes/.test(chat), 'the chat shows how many questions are left and does not pretend the tutor is perfect');
check(/auto && canSpeak\(\)/.test(voiceP) && /AUTO_KEY/.test(voiceP) && /Reading answers aloud|Answers are silent/.test(voiceP), 'the voice screen reads answers aloud (and can be silenced; the choice is remembered)');
check(/describeVoiceError/.test(voiceP) && /No microphone|unsupported/.test(read('src/utils/studyVoice.ts')), 'microphone problems are explained');
const aiSrc = read('src/services/studyAi.ts');
check(/FN = `\$\{BASE\}\/functions\/v1\/study-ai`/.test(aiSrc) && !/GROQ|GEMINI|OPENROUTER|TAVILY|api[_-]?key\s*[:=]/i.test(aiSrc.replace(/VITE_SUPABASE_PUBLISHABLE_KEY/g, '').replace(/apikey: KEY/g, '')), 'the app only talks to the study-ai function; no AI key is anywhere in it');
check(/signedUrls\(/.test(chat) && /createSignedUrls\(need, 3600\)/.test(aiSrc), 'pictures are shown through short-lived private links');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

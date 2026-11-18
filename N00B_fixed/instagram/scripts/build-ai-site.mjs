// Builds the public NOOB AI website (https://ai.noobsocials.com): plain HTML files in public/ai-site/, one shared stylesheet, no JavaScript.
//   node scripts/build-ai-site.mjs
// The pages are answered by the website's Worker (worker/aiSite.js) so they stay online even when the computer that runs NOOB AI is off; every other address on that host
// (the sign-in page, the app, the data) goes through to NOOB AI itself. Everything written here comes from NOOB AI's own README (what it really does), nothing invented.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'ai-site');
const SITE = 'https://ai.noobsocials.com';
const MAIN = 'https://noobsocials.com';
const UPDATED = '2026-11-18';
fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV = [
  ['/features', 'Features'], ['/how-it-works', 'How it works'], ['/languages', 'Languages'], ['/safety', 'Safety'], ['/faq', 'FAQ'], ['/install', 'Install'],
];

const FOUNDER = { '@type': 'Person', '@id': MAIN + '/about#founder', name: 'Padmanabh Singh Vaghela', jobTitle: 'Founder, CEO and Owner of NOOB Socials and NOOB AI' };
const ORG = { '@type': 'Organization', '@id': MAIN + '/#org', name: 'NOOB Socials', alternateName: ['NOOB', 'noobsocials'], url: MAIN + '/', logo: SITE + '/logo.png', founder: FOUNDER, sameAs: ['https://www.instagram.com/nooob.xyz'] };
const APP = {
  '@type': 'SoftwareApplication', '@id': SITE + '/#app', name: 'NOOB AI', url: SITE + '/', image: SITE + '/og-image.png',
  description: 'NOOB AI is a free multilingual AI voice assistant with healthcare knowledge. Talk in your own language, hear it answer out loud, and let it remember you.',
  applicationCategory: 'LifestyleApplication', operatingSystem: 'Web, iPhone, Android, Windows, macOS', inLanguage: ['en', 'hi', 'ta', 'bn', 'mr', 'gu'],
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' }, publisher: { '@id': MAIN + '/#org' },
};

function crumbs(items) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + p })) };
}

function layout({ file, p, title, desc, h1, lede, body, ld = [], current = '' }) {
  const url = SITE + p;
  const graph = { '@context': 'https://schema.org', '@graph': [ORG, { '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: 'NOOB AI', publisher: { '@id': MAIN + '/#org' } }, ...ld] };
  const nav = NAV.map(([href, label]) => `<a href="${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#1c1b19">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/logo.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="NOOB AI">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og-image.png">
<link rel="stylesheet" href="/site.css">
<script type="application/ld+json">${JSON.stringify(graph)}</script>
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>
<header class="top">
  <div class="wrap bar">
    <a class="brand" href="/"><img src="/logo.png" alt="" width="36" height="36"><span>NOOB <b>AI</b></span></a>
    <nav class="links" aria-label="Main">${nav}</nav>
    <a class="btn small" href="/login">Open NOOB AI</a>
    <details class="menu"><summary aria-label="Menu"><span></span></summary><div class="drawer">${nav}<a class="btn" href="/login">Open NOOB AI</a></div></details>
  </div>
</header>
<main id="main">
${h1 ? `<section class="hero${p === '/' ? ' home' : ''}"><div class="wrap">${p === '/' ? '' : `<p class="crumbs"><a href="/">NOOB AI</a> / ${esc(h1)}</p>`}<h1>${h1}</h1><p class="lede">${lede}</p>${p === '/' ? `<div class="cta"><a class="btn" href="/login">Open NOOB AI</a><a class="btn ghost" href="/install">Install on your phone</a></div><ul class="pills"><li>Free to use</li><li>Voice in 70+ languages</li><li>Remembers you</li><li>Healthcare-aware</li></ul>` : ''}</div></section>` : ''}
${body}
</main>
<footer class="foot">
  <div class="wrap cols">
    <div><a class="brand" href="/"><img src="/logo.png" alt="" width="32" height="32"><span>NOOB <b>AI</b></span></a><p class="muted">A free multilingual AI voice assistant with healthcare knowledge, made by the NOOB team.</p></div>
    <div><h2>NOOB AI</h2><a href="/features">Features</a><a href="/how-it-works">How it works</a><a href="/languages">Languages</a><a href="/safety">Health and safety</a><a href="/install">Install the app</a></div>
    <div><h2>Help</h2><a href="/faq">FAQ</a><a href="/privacy">Privacy</a><a href="/about">About</a><a href="/contact">Contact</a></div>
    <div><h2>NOOB</h2><a href="${MAIN}/">NOOB social app</a><a href="${MAIN}/terms">Terms</a><a href="${MAIN}/privacy">Privacy policy</a><a href="${MAIN}/data-deletion">Delete your data</a></div>
  </div>
  <div class="wrap legal"><span>&copy; 2026 NOOB. NOOB AI gives information, not medical advice.</span><a href="${MAIN}/">noobsocials.com</a></div>
</footer>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, file), html);
}

const card = (t, d) => `<article class="card"><h3>${t}</h3><p>${d}</p></article>`;
const cta = (t, d) => `<section class="band"><div class="wrap"><h2>${t}</h2><p>${d}</p><div class="cta"><a class="btn" href="/login">Open NOOB AI</a><a class="btn ghost" href="/install">Install on your phone</a></div></div></section>`;

// ------------------------------------------------------------------------------------------------ home
layout({
  file: 'index.html', p: '/', current: '',
  title: 'NOOB AI: free multilingual AI voice assistant with healthcare knowledge',
  desc: 'NOOB AI is a free AI voice assistant by NOOB. Talk in your own language, hear it answer out loud, and let it remember you. Healthcare-aware, with safety first.',
  h1: 'Meet <span class="accent">NOOB AI</span>, your multilingual AI friend',
  lede: 'Talk in your own language and hear NOOB AI answer out loud. It remembers what you tell it, notices how you feel, and knows a little about almost everything. Free to use, from the NOOB team.',
  ld: [APP, crumbs([['NOOB AI', '/']])],
  body: `
<section class="sec"><div class="wrap"><h2>Everything a friendly assistant should do</h2><p class="sub">Voice first, private by design, and built to be useful every day.</p>
<div class="grid">
${card('Talk by voice', 'Tap the orb and speak. NOOB AI stops listening when you stop talking and answers out loud. Turn on conversation mode to keep chatting like with a friend.')}
${card('Your language, your voice', 'It understands every major language, including Hindi, English, Tamil, Bengali, Marathi and Gujarati, and answers in the same language with a natural female voice in 70+ languages.')}
${card('It remembers you', 'Tell it your name, your hobbies or your favourite song once. NOOB AI saves it in its own memory and uses it next time, even after it was switched off.')}
${card('Cares about well-being', 'It notices how you feel from your words and your tone of voice, answers with warmth first, and checks in when you seem low for days. Your mood history is private.')}
${card('Knows about almost everything', 'Science, maths, history, coding, sports, films, cooking, travel. For anything recent, it can look it up on the web: news, weather and scores.')}
${card('Plays your songs', 'Say "Play Kesariya". NOOB AI plays it in the YouTube player inside the app, and you can say "stop the music" any time.')}
</div><p class="more"><a href="/features">See every feature</a></p></div></section>

<section class="sec alt"><div class="wrap split"><div><h2>Healthcare, with safety first</h2><p>NOOB AI is an information assistant, not a doctor. It puts emergencies first, points you to <strong>112</strong> or <strong>108</strong> when it matters, shares the <strong>Tele MANAS 14416</strong> helpline for mental-health crises, and tells you clearly when you should see a doctor and how soon.</p><p><a class="btn ghost" href="/safety">How NOOB AI keeps you safe</a></p></div>
<div class="panel"><p class="big">Emergency?</p><p>Call <strong>112</strong> or <strong>108</strong> now.</p><p class="muted">Mental-health crisis in India: <strong>Tele MANAS 14416</strong>.</p></div></div></section>

<section class="sec"><div class="wrap"><h2>How it works, in three steps</h2>
<ol class="steps"><li><b>You speak</b><span>Hold the button on a NOOB device or tap the orb in the app. You can type too.</span></li><li><b>NOOB AI understands</b><span>It listens in your language, thinks with your saved details in mind, and looks things up when needed.</span></li><li><b>It answers out loud</b><span>The first words arrive in a few seconds, in the same language, in a natural voice.</span></li></ol>
<p class="more"><a href="/how-it-works">Read how it works</a></p></div></section>

<section class="sec alt"><div class="wrap split"><div><h2>Part of NOOB</h2><p>NOOB AI is made by the team behind <a href="${MAIN}/">NOOB Socials</a>, the free social app for reels, chat and games, made by Padmanabh Singh Vaghela. Already have a NOOB account? Choose <strong>Continue with NOOB</strong> on the sign-in page and you do not need a new password.</p><p class="muted">Accounts made without NOOB get 5 free questions, then link a NOOB account for unlimited use.</p></div>
<div class="panel"><p class="big">Free</p><p>No subscription and no card. Sign in and start talking.</p></div></div></section>

<section class="sec"><div class="wrap"><h2>Questions people ask</h2><div class="faqs">
<details><summary>Is NOOB AI free?</summary><p>Yes. NOOB AI is free to use.</p></details>
<details><summary>Can I install it on my phone?</summary><p>Yes. Open NOOB AI in your phone's browser and add it to your home screen. It then opens full screen like an app. <a href="/install">Step-by-step guide</a>.</p></details>
<details><summary>Does it replace a doctor?</summary><p>No. It gives information and tells you when to see a doctor. In an emergency call 112 or 108.</p></details>
</div><p class="more"><a href="/faq">All questions and answers</a></p></div></section>
${cta('Start talking to NOOB AI', 'Sign in with your NOOB account, or create a free account in a minute.')}
`,
});

// ------------------------------------------------------------------------------------------------ features
layout({
  file: 'features.html', p: '/features', current: '/features',
  title: 'NOOB AI features: voice, 70+ languages, memory and healthcare knowledge',
  desc: 'Everything NOOB AI can do: talk by voice in your language, remember you, understand how you feel, search the web, play songs, and keep you safe with healthcare rules.',
  h1: 'Features', lede: 'A closer look at what NOOB AI can do for you.',
  ld: [APP, crumbs([['NOOB AI', '/'], ['Features', '/features']])],
  body: `
<section class="sec"><div class="wrap"><h2>Talking</h2><div class="grid">
${card('Voice in the app or on a NOOB device', 'Tap the orb in the app, or hold the button on a NOOB device. You can also type your question.')}
${card('Conversation mode', 'The app keeps listening after each answer, so you can chat naturally without tapping again.')}
${card('Fast answers', 'The first words come in about two to four seconds, and the voice starts while the rest of the answer is still being written.')}
${card('Every major language', 'Speak in Hindi, English, Tamil, Bengali, Marathi, Gujarati and many more. NOOB AI understands you directly from your voice.')}
${card('Replies in the same language', 'It answers in the language you spoke, with a natural female voice available in 70+ languages.')}
${card('Works offline too', 'If the online brain is unavailable, NOOB AI can fall back to a local AI model on its own computer.')}
</div></div></section>
<section class="sec alt"><div class="wrap"><h2>Knowing and remembering</h2><div class="grid">
${card('Permanent memory', 'Everything NOOB AI learns about you is saved in its database and survives a power cut. You can search, edit or delete memories on the Memory page.')}
${card('About Me', 'Add your name, age, city, allergies, conditions, medicines and hobbies. NOOB AI uses them in every answer to make advice safer and friendlier.')}
${card('General knowledge and live search', 'Science, maths, history, coding, sports, films, law, money, cooking and travel, plus a live web search for anything recent.')}
${card('Today and now', 'It knows today\'s date and time, and can look up news, weather and scores when you ask.')}
${card('Conversation history', 'Every question and answer is kept with search, so you can find what NOOB AI told you before.')}
${card('Plays songs', 'Ask for a song by name in any language. The app plays it in the YouTube player and you can pause, change or stop it by voice.')}
</div></div></section>
<section class="sec"><div class="wrap"><h2>Care and safety</h2><div class="grid">
${card('Healthcare safety rules', 'Emergencies come first, with 112 and 108. It explains warning signs instead of guessing a diagnosis and says when a doctor is needed.')}
${card('Understands your well-being', 'It notices feelings from your words and tone, responds with warmth, and gently suggests a doctor or counsellor if low mood lasts two weeks or more.')}
${card('Private mood history', 'Mood notes are shown only to you, and you can clear them whenever you like.')}
</div><p class="more"><a href="/safety">Read the full safety design</a></p></div></section>
<section class="sec alt"><div class="wrap"><h2>Accounts and devices</h2><div class="grid">
${card('Continue with NOOB', 'Sign in with your NOOB social account, with no new password to remember.')}
${card('Your own space', 'Every person has their own memory, chats, About Me and devices. Nobody sees anyone else\'s data.')}
${card('Free to try', 'Accounts made without NOOB get 5 free questions, then link a NOOB account for unlimited use.')}
${card('Nearby NOOB devices', 'The app finds NOOB devices on your Wi-Fi and pairs with a 4-digit code on the device screen.')}
${card('Always in sync', 'The app shows whether your NOOB device is online, and the device shows whether the computer is on.')}
${card('Rate your experience', 'After the first 15 questions NOOB AI asks for a 1 to 5 star rating, so it can keep improving.')}
</div></div></section>
${cta('Try NOOB AI', 'It is free. Sign in and ask it anything.')}
`,
});

// ------------------------------------------------------------------------------------------------ how it works
layout({
  file: 'how-it-works.html', p: '/how-it-works', current: '/how-it-works',
  title: 'How NOOB AI works: voice, understanding, answers and memory',
  desc: 'How NOOB AI turns your voice into an answer in your own language: listening, understanding, thinking with your memory, searching the web, and speaking back.',
  h1: 'How NOOB AI works', lede: 'From your voice to a spoken answer, in six simple steps.',
  ld: [APP, crumbs([['NOOB AI', '/'], ['How it works', '/how-it-works']])],
  body: `
<section class="sec"><div class="wrap narrow">
<ol class="long">
<li><h3>1. You speak</h3><p>In the app, your device's microphone listens and NOOB AI stops when you stop talking. On a NOOB device, you hold the button while you talk.</p></li>
<li><h3>2. The recording is sent securely</h3><p>The short recording goes to the NOOB AI server over an encrypted connection. It is compressed first so it travels fast.</p></li>
<li><h3>3. NOOB AI understands you</h3><p>An AI model listens to the voice directly and writes down what you said, in any major language. If that is unavailable, a backup speech model on the server does the same.</p></li>
<li><h3>4. It thinks with you in mind</h3><p>Your words go to the AI together with NOOB's friendly personality, its health-safety rules, your About Me details, what it remembers about you, the last few messages and today's date and time. If it needs fresh information, it searches the web.</p></li>
<li><h3>5. It speaks</h3><p>As soon as the first sentence is written it is turned into a natural female voice and sent back. The next sentences follow while the first one is playing.</p></li>
<li><h3>6. It plays</h3><p>The app plays the voice on your phone or computer. A NOOB device plays it on its own speaker.</p></li>
</ol>
<div class="note"><h3>Why is there a server?</h3><p>A modern AI model needs far more memory than a small device or a phone browser has. So the app and the device handle the microphone and the speaker, while the heavy AI work runs on the NOOB AI server and in the cloud. Commercial smart speakers are built the same way. It also means NOOB AI is available only while its server is running.</p></div>
</div></section>
${cta('See it in action', 'Open NOOB AI and say hello.')}
`,
});

// ------------------------------------------------------------------------------------------------ languages
layout({
  file: 'languages.html', p: '/languages', current: '/languages',
  title: 'NOOB AI languages: Hindi, English, Tamil, Bengali, Marathi and more',
  desc: 'Speak to NOOB AI in your own language. It understands every major language and answers in the same language with a natural voice in 70+ languages.',
  h1: 'Speak in your own language', lede: 'NOOB AI is built for people who think and speak in more than one language.',
  ld: [APP, crumbs([['NOOB AI', '/'], ['Languages', '/languages']])],
  body: `
<section class="sec"><div class="wrap narrow">
<p>NOOB AI listens to your voice directly, so you do not choose a language first. Just speak. It works out the language and answers in the same one.</p>
<div class="langs"><span>Hindi</span><span>English</span><span>Tamil</span><span>Bengali</span><span>Marathi</span><span>Gujarati</span><span>and every other major language</span></div>
<h2>What you get</h2>
<ul class="tick"><li>It understands every major language, spoken directly.</li><li>It replies in the language you used.</li><li>A natural female voice is available in more than 70 languages.</li><li>You can switch language in the middle of a chat.</li><li>Songs work in any language: ask for them by name.</li></ul>
<p class="muted">The quality of a voice and of recognition can differ from one language to another, and we keep improving it.</p>
</div></section>
${cta('Say something in your language', 'Open NOOB AI and speak.')}
`,
});

// ------------------------------------------------------------------------------------------------ safety
layout({
  file: 'safety.html', p: '/safety', current: '/safety',
  title: 'Health and safety at NOOB AI: emergencies first, information not diagnosis',
  desc: 'How NOOB AI handles health questions safely: emergencies first with 112 and 108, Tele MANAS 14416, no false diagnoses, and a clear message when you need a doctor.',
  h1: 'Health and safety', lede: 'NOOB AI is an information assistant, not a doctor. This is how it is built to keep you safe.',
  ld: [APP, crumbs([['NOOB AI', '/'], ['Health and safety', '/safety']])],
  body: `
<section class="sec"><div class="wrap narrow">
<div class="alert"><h2>In an emergency</h2><p>Call <strong>112</strong> or <strong>108</strong> now. For a mental-health crisis in India, call <strong>Tele MANAS 14416</strong>.</p></div>
<h2>What NOOB AI is built to do</h2>
<ul class="tick">
<li><b>Emergencies first.</b> For chest pain, breathing trouble, stroke signs, heavy bleeding, poisoning or thoughts of self-harm, it tells you to call 112 or 108 straight away, then gives brief first aid.</li>
<li><b>Help for mental-health crises.</b> It gives the Tele MANAS 14416 helpline.</li>
<li><b>Warmth first.</b> It notices feelings from your words and tone, responds with care, offers one small coping idea, and gently suggests a doctor or counsellor if low mood, panic or sleep trouble lasts two weeks or more.</li>
<li><b>Information, not diagnosis.</b> It explains possibilities and warning signs instead of giving a definite diagnosis.</li>
<li><b>Careful with medicines.</b> It gives only standard label doses for common over-the-counter medicines, with warnings for children, pregnancy, older people and kidney or liver disease. It never advises you to stop a prescribed medicine.</li>
<li><b>Knows you.</b> If you add allergies, conditions, medicines and age to About Me, it uses them to make answers safer.</li>
<li><b>Clear about doctors.</b> It says when you need a doctor and how urgently.</li>
</ul>
<div class="note"><h3>Please remember</h3><p>NOOB AI can make mistakes. Do not use it as your only source for medical decisions. Always speak to a qualified doctor or pharmacist about your health.</p></div>
</div></section>
`,
});

// ------------------------------------------------------------------------------------------------ privacy
layout({
  file: 'privacy.html', p: '/privacy', current: '/privacy',
  title: 'NOOB AI privacy: what is stored, where, and who sees it',
  desc: 'A plain explanation of how NOOB AI handles your data: what it stores, which services it uses to answer, who can see your conversations, and how to delete your data.',
  h1: 'Privacy', lede: 'A plain-language summary of how NOOB AI treats your data. Last updated 18 November 2026.',
  ld: [APP, crumbs([['NOOB AI', '/'], ['Privacy', '/privacy']])],
  body: `
<section class="sec"><div class="wrap narrow">
<h2>What NOOB AI stores</h2>
<p>Your About Me details, memories, mood notes, conversations and account are stored in NOOB AI's own database, on the NOOB AI server. Passwords are stored only as secure hashes. Every page and all data need a signed-in account, and each person can only see their own data.</p>
<h2>Services used to answer you</h2>
<ul class="tick"><li><b>Google Gemini</b> understands your voice and writes answers. On the free tier, Google may use conversations to improve its products.</li><li><b>DuckDuckGo</b> is used for live web searches, without an account.</li><li><b>Microsoft Edge text-to-speech</b> turns the answer into a voice.</li><li><b>YouTube</b>'s own player plays the songs you ask for.</li><li>A local AI model on the server can answer offline, without sending anything out.</li></ul>
<h2>Who can see your conversations</h2>
<p>Only you. The owner of the server can manage accounts, but other people's messages stay private in the server's log view.</p>
<h2>Your NOOB account</h2>
<p>If you choose Continue with NOOB, NOOB AI reads the basic details of your NOOB account (such as name and picture) to set up your space. Your NOOB data is covered by the <a href="${MAIN}/privacy">NOOB privacy policy</a>.</p>
<h2>Control and deletion</h2>
<ul class="tick"><li>Search, edit and delete memories on the Memory page.</li><li>Clear your mood history at any time.</li><li>To remove your NOOB data, follow the <a href="${MAIN}/data-deletion">data deletion page</a>.</li></ul>
<div class="note"><h3>Questions?</h3><p>See <a href="/contact">how to contact us</a>.</p></div>
</div></section>
`,
});

// ------------------------------------------------------------------------------------------------ faq
const FAQ = [
  ['What is NOOB AI?', 'NOOB AI is a free AI voice assistant from the NOOB team. You talk to it in your own language, it answers out loud in the same language, remembers what you tell it and knows a lot about healthcare and everyday topics.'],
  ['Is NOOB AI free?', 'Yes. NOOB AI is free to use. Accounts made without a NOOB account get 5 free questions, and linking a NOOB account unlocks unlimited questions.'],
  ['Which languages does NOOB AI understand?', 'Every major language, including Hindi, English, Tamil, Bengali, Marathi and Gujarati. It answers in the same language, with a natural voice available in more than 70 languages.'],
  ['How do I install NOOB AI on my phone?', 'Open NOOB AI in your phone browser and add it to your home screen. On iPhone use Safari, tap Share, then Add to Home Screen. On Android use Chrome, open the menu and tap Install app. See the install guide for details.'],
  ['Does NOOB AI replace a doctor?', 'No. NOOB AI gives information and tells you when to see a doctor. In an emergency call 112 or 108. For a mental-health crisis in India call Tele MANAS 14416.'],
  ['Does NOOB AI remember me?', 'Yes. It saves what you tell it in its own memory and uses it in later chats. You can search, edit or delete memories on the Memory page.'],
  ['Who can see my conversations?', 'Only you. Every person has their own private space on NOOB AI.'],
  ['How do I sign in?', 'Choose Continue with NOOB to use your NOOB social account, or create a free account on the sign-in page.'],
  ['Why is NOOB AI sometimes unavailable?', 'NOOB AI runs on its own server. If that server is switched off or under maintenance, the app shows a message. Try again a little later.'],
  ['Can it play songs?', 'Yes. Ask for a song by name in any language and the app plays it in the YouTube player. Say stop the music to stop it.'],
  ['Who makes NOOB AI?', 'NOOB AI is made by the NOOB team, the people behind the NOOB social app at noobsocials.com.'],
];
layout({
  file: 'faq.html', p: '/faq', current: '/faq',
  title: 'NOOB AI FAQ: free, languages, safety, privacy and installing',
  desc: 'Answers to common questions about NOOB AI: is it free, which languages, is it safe for health questions, who sees your chats, and how to install it on your phone.',
  h1: 'Frequently asked questions', lede: 'Quick answers about NOOB AI.',
  ld: [APP, crumbs([['NOOB AI', '/'], ['FAQ', '/faq']]), { '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }],
  body: `<section class="sec"><div class="wrap narrow"><div class="faqs">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></div></section>${cta('Still curious?', 'Open NOOB AI and ask it yourself.')}`,
});

// ------------------------------------------------------------------------------------------------ install
layout({
  file: 'install.html', p: '/install', current: '/install',
  title: 'Install NOOB AI on your iPhone, Android or computer',
  desc: 'Step-by-step: add NOOB AI to your iPhone, Android phone or computer home screen so it opens full screen like an app.',
  h1: 'Install NOOB AI', lede: 'Add NOOB AI to your home screen. It opens full screen, like an app, with its own icon.',
  ld: [APP, crumbs([['NOOB AI', '/'], ['Install', '/install']]), { '@type': 'HowTo', name: 'Install NOOB AI on your iPhone', step: [
    { '@type': 'HowToStep', name: 'Open Safari', text: 'Open Safari on your iPhone and go to ai.noobsocials.com.' },
    { '@type': 'HowToStep', name: 'Tap Share', text: 'Tap the Share button at the bottom of the screen.' },
    { '@type': 'HowToStep', name: 'Add to Home Screen', text: 'Scroll down, tap Add to Home Screen, then tap Add.' },
  ] }],
  body: `
<section class="sec"><div class="wrap narrow">
<h2>iPhone</h2><ol class="long compact"><li>Open <b>Safari</b> (it must be Safari) and go to <b>ai.noobsocials.com</b>.</li><li>Tap the <b>Share</b> button, the square with an arrow, at the bottom.</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Keep the name <b>NOOB AI</b> and tap <b>Add</b>.</li></ol>
<h2>Android</h2><ol class="long compact"><li>Open <b>Chrome</b> and go to <b>ai.noobsocials.com</b>.</li><li>Tap the menu (three dots) at the top right.</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Confirm, and the NOOB AI icon appears on your home screen.</li></ol>
<h2>Windows and Mac</h2><ol class="long compact"><li>Open <b>Chrome</b> or <b>Edge</b> and go to <b>ai.noobsocials.com</b>.</li><li>Click the <b>install</b> icon at the right end of the address bar, or open the menu and choose <b>Install NOOB AI</b>.</li></ol>
<div class="note"><h3>Good to know</h3><p>The first time, sign in inside the app, because the home-screen app keeps its own storage. Allow the microphone when your phone asks, so voice works. NOOB AI needs an internet connection.</p></div>
</div></section>
${cta('Ready?', 'Open NOOB AI now, or install it first.')}
`,
});

// ------------------------------------------------------------------------------------------------ about
layout({
  file: 'about.html', p: '/about', current: '',
  title: 'About NOOB AI: the AI friend from the NOOB team',
  desc: 'NOOB AI is the AI assistant made by Padmanabh Singh Vaghela, founder of NOOB Socials. Learn why it was built and how it fits with NOOB.',
  h1: 'About NOOB AI', lede: 'A friendly, multilingual, healthcare-aware AI, made by the NOOB team.',
  ld: [APP, crumbs([['NOOB AI', '/'], ['About', '/about']])],
  body: `
<section class="sec"><div class="wrap narrow">
<h2>Why we built it</h2>
<p>We wanted an AI that talks the way people really talk: in their own language, out loud, and with some care. Most assistants forget you the moment you close them and ignore how you feel. NOOB AI remembers you, notices your mood, and keeps health questions safe, and it is free.</p>
<h2>Made by NOOB</h2>
<p>NOOB AI is made by <strong>Padmanabh Singh Vaghela</strong>, the founder, CEO and owner of <a href="${MAIN}/">NOOB Socials</a> (and of NOOB AI), a free social app for reels, videos, chat, 38 games and music. You can sign in to NOOB AI with your NOOB account, and NOOB AI is part of the same family.</p>
<h2>What it is made of</h2>
<ul class="tick"><li>An app for your browser or home screen (HTML, CSS and JavaScript).</li><li>A server for speech, AI and memory (Python), with a local database (SQLite).</li><li>An optional NOOB device with a microphone, speaker and small screen (an ESP32-S3).</li></ul>
<p><a class="btn ghost" href="${MAIN}/about">About NOOB</a></p>
</div></section>
${cta('Meet NOOB AI', 'It is free. Say hello.')}
`,
});

// ------------------------------------------------------------------------------------------------ contact
layout({
  file: 'contact.html', p: '/contact', current: '',
  title: 'Contact NOOB AI: support, feedback and privacy requests',
  desc: 'How to reach the NOOB team about NOOB AI: support inside the NOOB app, feedback and rating, privacy and data deletion requests.',
  h1: 'Contact', lede: 'We read every message. Here is the quickest way to reach us.',
  ld: [APP, crumbs([['NOOB AI', '/'], ['Contact', '/contact']])],
  body: `
<section class="sec"><div class="wrap narrow">
<div class="grid two">
${card('Support', 'Open the NOOB social app and use Customer Support from your profile menu. The NOOB team answers there.')}
${card('Feedback', 'NOOB AI asks for a 1 to 5 star rating after your first 15 questions. You can also send a report from the app.')}
${card('Privacy and data deletion', `Follow the <a href="${MAIN}/data-deletion">data deletion page</a>, or read the <a href="/privacy">NOOB AI privacy summary</a>.`)}
${card('Grievances', `Use the <a href="${MAIN}/grievance.html">grievance form</a> of the NOOB app.`)}
</div>
<p class="muted">NOOB AI is a project of the NOOB team. The main NOOB site is <a href="${MAIN}/">noobsocials.com</a>.</p>
</div></section>
`,
});

// ------------------------------------------------------------------------------------------------ robots, sitemap
const PAGES = ['/', '/features', '/how-it-works', '/languages', '/safety', '/privacy', '/faq', '/install', '/about', '/contact'];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map((p) => `  <url><loc>${SITE}${p === '/' ? '/' : p}</loc><lastmod>${UPDATED}</lastmod><changefreq>${p === '/' ? 'weekly' : 'monthly'}</changefreq><priority>${p === '/' ? '1.0' : '0.7'}</priority></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app\nDisallow: /login\nDisallow: /noob-signin\nDisallow: /ask\nDisallow: /device/\nDisallow: /static/\n\nSitemap: ${SITE}/sitemap.xml\n`);

// ------------------------------------------------------------------------------------------------ stylesheet
fs.writeFileSync(path.join(OUT, 'site.css'), `:root{--bg:#1c1b19;--bg2:#242321;--card:#2a2926;--line:#3a3834;--text:#f3efe8;--muted:#b9b3a8;--accent:#e0794f;--accent2:#f09a74;--ink:#1c1b19;--radius:16px;--max:1080px}
@media (prefers-color-scheme:light){:root{--bg:#faf7f2;--bg2:#f1ece3;--card:#ffffff;--line:#e2dacb;--text:#24211c;--muted:#6a6358;--accent:#c85f36;--accent2:#b3522d;--ink:#ffffff}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent2);text-underline-offset:3px}a:hover{color:var(--accent)}
img{max-width:100%;height:auto}
.wrap{max-width:var(--max);margin:0 auto;padding:0 20px}.narrow{max-width:760px}
.skip{position:absolute;left:-999px;top:0;background:var(--accent);color:var(--ink);padding:10px 16px;z-index:50}.skip:focus{left:8px;top:8px}
:focus-visible{outline:3px solid var(--accent2);outline-offset:2px;border-radius:6px}
.top{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:20px;min-height:64px}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-weight:700;font-size:19px;letter-spacing:.2px}.brand img{border-radius:9px}.brand b{color:var(--accent)}
.links{display:flex;gap:4px;margin-left:auto}.links a,.drawer a:not(.btn){color:var(--muted);text-decoration:none;padding:8px 12px;border-radius:10px;font-weight:500}.links a:hover,.links a[aria-current]{color:var(--text);background:var(--bg2)}
.btn{display:inline-block;background:var(--accent);color:var(--ink);text-decoration:none;font-weight:700;padding:13px 24px;border-radius:999px;border:2px solid var(--accent);transition:transform .15s,background .15s}.btn:hover{background:var(--accent2);border-color:var(--accent2);color:var(--ink);transform:translateY(-1px)}
.btn.ghost{background:transparent;color:var(--text);border-color:var(--line)}.btn.ghost:hover{background:var(--bg2);color:var(--text);border-color:var(--muted)}
.btn.small{padding:9px 18px;font-size:15px}
.menu{display:none;margin-left:auto}.menu summary{list-style:none;cursor:pointer;width:44px;height:44px;display:grid;place-items:center;border-radius:12px}.menu summary::-webkit-details-marker{display:none}
.menu summary span,.menu summary span::before,.menu summary span::after{display:block;width:22px;height:2px;background:var(--text);border-radius:2px;position:relative;content:""}
.menu summary span::before{position:absolute;top:-7px}.menu summary span::after{position:absolute;top:7px}
.drawer{position:absolute;left:0;right:0;top:64px;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 20px 20px;display:grid;gap:4px}.drawer .btn{text-align:center;margin-top:8px}
@media(max-width:860px){.links,.bar>.btn.small{display:none}.menu{display:block}}
.hero{padding:72px 0 56px;border-bottom:1px solid var(--line);background:radial-gradient(900px 380px at 80% -10%,color-mix(in srgb,var(--accent) 22%,transparent),transparent),var(--bg)}
.hero.home{padding:96px 0 80px}.hero h1{font-size:clamp(34px,6vw,60px);line-height:1.08;margin:0 0 18px;letter-spacing:-.02em;max-width:18ch}.hero:not(.home) h1{font-size:clamp(30px,5vw,46px);max-width:none}
.accent{color:var(--accent)}.lede{font-size:clamp(17px,2.4vw,21px);color:var(--muted);max-width:640px;margin:0 0 28px}
.crumbs{margin:0 0 10px;color:var(--muted);font-size:14px}.crumbs a{color:var(--muted)}
.cta{display:flex;flex-wrap:wrap;gap:12px}.pills{list-style:none;display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:28px 0 0}.pills li{border:1px solid var(--line);background:var(--bg2);color:var(--muted);padding:6px 14px;border-radius:999px;font-size:14px}
.sec{padding:64px 0}.sec.alt{background:var(--bg2);border-block:1px solid var(--line)}
h2{font-size:clamp(24px,3.5vw,34px);line-height:1.2;margin:0 0 12px;letter-spacing:-.01em}.sub{color:var(--muted);margin:0 0 32px;max-width:640px}
h3{margin:0 0 8px;font-size:19px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin-top:28px}.grid.two{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px;transition:border-color .2s,transform .2s}.card:hover{border-color:var(--accent);transform:translateY(-2px)}.card p{margin:0;color:var(--muted)}
.more{margin-top:28px;font-weight:600}
.split{display:grid;grid-template-columns:1.4fr 1fr;gap:40px;align-items:center}@media(max-width:820px){.split{grid-template-columns:1fr}}
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:28px;text-align:center}.panel .big{font-size:32px;font-weight:800;color:var(--accent);margin:0 0 8px}.panel p{margin:6px 0}
.muted{color:var(--muted)}
.steps{list-style:none;counter-reset:s;padding:0;margin:28px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
.steps li{counter-increment:s;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px;position:relative}.steps li::before{content:counter(s);display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--accent);color:var(--ink);font-weight:800;margin-bottom:12px}.steps b{display:block;font-size:19px;margin-bottom:6px}.steps span{color:var(--muted)}
.long{list-style:none;padding:0;margin:0}.long li{padding:20px 0;border-bottom:1px solid var(--line)}.long li:last-child{border:0}.long p{margin:0;color:var(--muted)}.long.compact li{padding:10px 0 10px 4px;color:var(--text)}.long.compact{list-style:decimal;padding-left:22px}.long.compact li{border:0}
.tick{list-style:none;padding:0;margin:16px 0}.tick li{position:relative;padding:8px 0 8px 32px}.tick li::before{content:"";position:absolute;left:0;top:14px;width:18px;height:10px;border-left:3px solid var(--accent);border-bottom:3px solid var(--accent);transform:rotate(-45deg) scale(.9)}
.langs{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}.langs span{background:var(--card);border:1px solid var(--line);padding:8px 16px;border-radius:999px;font-weight:600}
.note,.alert{border:1px solid var(--line);background:var(--card);border-radius:var(--radius);padding:22px 24px;margin:32px 0}.note p,.alert p{margin:0;color:var(--muted)}.alert{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--card))}.alert p{color:var(--text)}
.faqs{display:grid;gap:12px}.faqs details{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px 20px}.faqs summary{cursor:pointer;font-weight:600;padding:16px 0;list-style:none;display:flex;justify-content:space-between;gap:16px}.faqs summary::-webkit-details-marker{display:none}.faqs summary::after{content:"+";color:var(--accent);font-size:22px;line-height:1}.faqs details[open] summary::after{content:"\\2212"}.faqs details p{margin:0 0 16px;color:var(--muted)}
.band{padding:72px 0;text-align:center;background:radial-gradient(700px 300px at 50% 120%,color-mix(in srgb,var(--accent) 25%,transparent),transparent),var(--bg2);border-top:1px solid var(--line)}.band p{color:var(--muted);margin:0 0 24px}.band .cta{justify-content:center}
.foot{border-top:1px solid var(--line);background:var(--bg2);padding:48px 0 0}.cols{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:32px}@media(max-width:820px){.cols{grid-template-columns:1fr 1fr}}@media(max-width:520px){.cols{grid-template-columns:1fr}}
.foot h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 12px}.foot a:not(.brand){display:block;color:var(--text);text-decoration:none;padding:5px 0}.foot a:not(.brand):hover{color:var(--accent2)}.foot p{max-width:34ch;font-size:15px}
.legal{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;border-top:1px solid var(--line);margin-top:36px;padding-top:20px;padding-bottom:28px;color:var(--muted);font-size:14px}.legal a{color:var(--muted)}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`);
console.log('NOOB AI site written to', OUT, '(' + fs.readdirSync(OUT).length + ' files)');

// Keeps AI programs (the crawlers that collect pages to train AI, and the assistants that fetch a page for someone) out of NOOB, the way Instagram does:
// they may read only the pages that are meant for everyone (the legal and information pages); every other address, the app itself, a public link, a picture or a video, is refused with a 403.
// Search engines (Google, Bing ...) are not on the list: they keep indexing the public pages (see public/robots.txt). Honest limit: this recognises programs that say who they are
// (their User-Agent) and the well-known AI crawlers; a program that pretends to be a person's browser is stopped by the Cloudflare "AI Scrapers and Crawlers" switch (dashboard),
// and the app's real content (posts, reels, chats) is never in a page's text anyway: it is only fetched after a person signs in.
export const AI_AGENTS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Google-CloudVertexBot',
  'GoogleOther', 'Gemini-Deep-Research', 'CCBot', 'Bytespider', 'Amazonbot', 'Applebot-Extended', 'meta-externalagent', 'meta-externalfetcher', 'FacebookBot', 'cohere-ai', 'cohere-training-data-crawler',
  'Diffbot', 'ImagesiftBot', 'Omgilibot', 'Omgili', 'YouBot', 'Timpibot', 'AI2Bot', 'Ai2Bot-Dolma', 'DuckAssistBot', 'MistralAI-User', 'PanguBot', 'PetalBot', 'Webzio', 'Scrapy', 'img2dataset',
  'Kangaroo Bot', 'SemrushBot-OCOB', 'ICC-Crawler', 'FriendlyCrawler', 'Quora-Bot', 'NovaAct', 'Operator', 'Manus', 'Genspark', 'Devin', 'bingbot-ai', 'LinerBot', 'TavilyBot', 'Firecrawl', 'Jina', 'ExaBot',
];
const AGENT_RE = new RegExp(AI_AGENTS.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

// the only addresses an AI program may read
export const AI_ALLOWED = [/^\/$/, /^\/robots\.txt$/, /^\/sitemap\.xml$/, /^\/security\.txt$/, /^\/\.well-known\//, /^\/privacy(\.html)?\/?$/, /^\/terms(\.html)?\/?$/, /^\/about(\.html)?\/?$/, /^\/data-deletion(\.html)?\/?$/, /^\/grievance(\.html)?\/?$/, /^\/refund(s)?(-policy)?(\.html)?\/?$/];

export const isAiAgent = (userAgent) => !!userAgent && AGENT_RE.test(userAgent);
export const aiMayRead = (pathname) => AI_ALLOWED.some((re) => re.test(pathname));

/** A 403 for an AI program asking for something it may not read; null for everyone and everything else. */
export function botGate(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!isAiAgent(ua)) return null;
  const { pathname } = new URL(request.url);
  if (aiMayRead(pathname)) return null;
  return new Response('NOOB does not allow AI programs to read this page.', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow, noai, noimageai' },
  });
}

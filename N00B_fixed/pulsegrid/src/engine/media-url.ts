import dancesUrl from '../../assets/performance/models/dances.bin?url'
import dancesMoreUrl from '../../assets/performance/models/dances_more.bin?url'

/** Exact stable URLs, derived only from assets.lock.json. */
const MEDIA_URLS: Record<string, string> = {
  "audio/music/midnight-circuit.mp3": "assets/performance/audio/music/midnight-circuit.mp3",
  "audio/music/neon-heartbeat.mp3": "assets/performance/audio/music/neon-heartbeat.mp3",
  "audio/music/starlight-overdrive.mp3": "assets/performance/audio/music/starlight-overdrive.mp3",
  "audio/music/sting_clear.mp3": "assets/performance/audio/music/sting_clear.mp3",
  "audio/music/sting_fail.mp3": "assets/performance/audio/music/sting_fail.mp3",
  "audio/music/title.mp3": "assets/performance/audio/music/title.mp3",
  "audio/music/warmup.mp3": "assets/performance/audio/music/warmup.mp3",
  "audio/sfx/arrow_tick.mp3": "assets/performance/audio/sfx/arrow_tick.mp3",
  "audio/sfx/arrow_wrong.mp3": "assets/performance/audio/sfx/arrow_wrong.mp3",
  "audio/sfx/badge.mp3": "assets/performance/audio/sfx/badge.mp3",
  "audio/sfx/co2_jet.mp3": "assets/performance/audio/sfx/co2_jet.mp3",
  "audio/sfx/combo_milestone.mp3": "assets/performance/audio/sfx/combo_milestone.mp3",
  "audio/sfx/count_tick.mp3": "assets/performance/audio/sfx/count_tick.mp3",
  "audio/sfx/countdown_tick.mp3": "assets/performance/audio/sfx/countdown_tick.mp3",
  "audio/sfx/crowd_ambience.mp3": "assets/performance/audio/sfx/crowd_ambience.mp3",
  "audio/sfx/crowd_applause.mp3": "assets/performance/audio/sfx/crowd_applause.mp3",
  "audio/sfx/crowd_aww.mp3": "assets/performance/audio/sfx/crowd_aww.mp3",
  "audio/sfx/crowd_cheer.mp3": "assets/performance/audio/sfx/crowd_cheer.mp3",
  "audio/sfx/fever_start.mp3": "assets/performance/audio/sfx/fever_start.mp3",
  "audio/sfx/finish_impact.mp3": "assets/performance/audio/sfx/finish_impact.mp3",
  "audio/sfx/hit_bad.mp3": "assets/performance/audio/sfx/hit_bad.mp3",
  "audio/sfx/hit_cool.mp3": "assets/performance/audio/sfx/hit_cool.mp3",
  "audio/sfx/hit_great.mp3": "assets/performance/audio/sfx/hit_great.mp3",
  "audio/sfx/hit_miss.mp3": "assets/performance/audio/sfx/hit_miss.mp3",
  "audio/sfx/hit_perfect.mp3": "assets/performance/audio/sfx/hit_perfect.mp3",
  "audio/sfx/level_up.mp3": "assets/performance/audio/sfx/level_up.mp3",
  "audio/sfx/phrase_lock.mp3": "assets/performance/audio/sfx/phrase_lock.mp3",
  "audio/sfx/pyro.mp3": "assets/performance/audio/sfx/pyro.mp3",
  "audio/sfx/rank_stamp.mp3": "assets/performance/audio/sfx/rank_stamp.mp3",
  "audio/sfx/spotlight.mp3": "assets/performance/audio/sfx/spotlight.mp3",
  "audio/sfx/transition_whoosh.mp3": "assets/performance/audio/sfx/transition_whoosh.mp3",
  "audio/sfx/ui_back.mp3": "assets/performance/audio/sfx/ui_back.mp3",
  "audio/sfx/ui_click.mp3": "assets/performance/audio/sfx/ui_click.mp3",
  "audio/sfx/ui_hover.mp3": "assets/performance/audio/sfx/ui_hover.mp3",
  "audio/sfx/ui_start.mp3": "assets/performance/audio/sfx/ui_start.mp3",
  "audio/sfx/vo_clear.mp3": "assets/performance/audio/sfx/vo_clear.mp3",
  "audio/sfx/vo_combo.mp3": "assets/performance/audio/sfx/vo_combo.mp3",
  "audio/sfx/vo_fail.mp3": "assets/performance/audio/sfx/vo_fail.mp3",
  "audio/sfx/vo_fever.mp3": "assets/performance/audio/sfx/vo_fever.mp3",
  "audio/sfx/vo_finish.mp3": "assets/performance/audio/sfx/vo_finish.mp3",
  "audio/sfx/vo_go.mp3": "assets/performance/audio/sfx/vo_go.mp3",
  "audio/sfx/vo_great.mp3": "assets/performance/audio/sfx/vo_great.mp3",
  "audio/sfx/vo_newbest.mp3": "assets/performance/audio/sfx/vo_newbest.mp3",
  "audio/sfx/vo_perfect.mp3": "assets/performance/audio/sfx/vo_perfect.mp3",
  "audio/sfx/vo_ready.mp3": "assets/performance/audio/sfx/vo_ready.mp3",
  "audio/sfx/vo_spotlight.mp3": "assets/performance/audio/sfx/vo_spotlight.mp3",
  "audio/sfx/vo_welcome.mp3": "assets/performance/audio/sfx/vo_welcome.mp3",
  "fonts/Figtree-VF.subset.woff2": "assets/performance/fonts/Figtree-VF.subset.woff2",
  "fonts/Sora-VF.subset.woff2": "assets/performance/fonts/Sora-VF.subset.woff2",
  "fx/particles.webp": "assets/performance/fx/particles.webp",
  "models/anims.glb": "assets/performance/models/anims.glb",
  "models/dancer_f.glb": "assets/performance/models/dancer_f.glb",
  "models/dancer_m.glb": "assets/performance/models/dancer_m.glb",
  "models/eyebrows_female.glb": "assets/performance/models/eyebrows_female.glb",
  "models/eyebrows_regular.glb": "assets/performance/models/eyebrows_regular.glb",
  "models/hair_buns.glb": "assets/performance/models/hair_buns.glb",
  "models/hair_buzzed.glb": "assets/performance/models/hair_buzzed.glb",
  "models/hair_long.glb": "assets/performance/models/hair_long.glb",
  "models/hair_simpleparted.glb": "assets/performance/models/hair_simpleparted.glb",
  "tex/crowd.webp": "assets/performance/tex/crowd.webp",
  "tex/eye.webp": "assets/performance/tex/eye.webp",
  "tex/floor.webp": "assets/performance/tex/floor.webp",
  "tex/hair1.webp": "assets/performance/tex/hair1.webp",
  "tex/hair1_normal.webp": "assets/performance/tex/hair1_normal.webp",
  "tex/hair2.webp": "assets/performance/tex/hair2.webp",
  "tex/hair2_normal.webp": "assets/performance/tex/hair2_normal.webp",
  "tex/skin_f_dark.webp": "assets/performance/tex/skin_f_dark.webp",
  "tex/skin_f_light.webp": "assets/performance/tex/skin_f_light.webp",
  "tex/skin_f_normal.webp": "assets/performance/tex/skin_f_normal.webp",
  "tex/skin_f_rough.webp": "assets/performance/tex/skin_f_rough.webp",
  "tex/skin_m_dark.webp": "assets/performance/tex/skin_m_dark.webp",
  "tex/skin_m_light.webp": "assets/performance/tex/skin_m_light.webp",
  "tex/skin_m_normal.webp": "assets/performance/tex/skin_m_normal.webp",
  "tex/skin_m_rough.webp": "assets/performance/tex/skin_m_rough.webp",
  "ui/b_clear.webp": "assets/performance/ui/b_clear.webp",
  "ui/b_fever.webp": "assets/performance/ui/b_fever.webp",
  "ui/b_finish.webp": "assets/performance/ui/b_finish.webp",
  "ui/b_spotlight.webp": "assets/performance/ui/b_spotlight.webp",
  "ui/j_bad.webp": "assets/performance/ui/j_bad.webp",
  "ui/j_cool.webp": "assets/performance/ui/j_cool.webp",
  "ui/j_great.webp": "assets/performance/ui/j_great.webp",
  "ui/j_miss.webp": "assets/performance/ui/j_miss.webp",
  "ui/j_perfect.webp": "assets/performance/ui/j_perfect.webp",
  "ui/tile_done.webp": "assets/performance/ui/tile_done.webp",
  "ui/tile_idle.webp": "assets/performance/ui/tile_idle.webp",
  "ui/tile_reverse.webp": "assets/performance/ui/tile_reverse.webp",
}

// Generic choreography packs are deliberately retained as local Git inputs; their .bin format is
// not one of the managed asset types. Vite emits portable, hashed URLs for them.
const LOCAL_MEDIA_URLS: Record<string, string> = {
  'models/dances.bin': dancesUrl,
  'models/dances_more.bin': dancesMoreUrl,
}

const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')

export function managedMediaUrl(sourcePath: string): string {
  const normalized = sourcePath.replace(/^\/+/, '')
  const path = MEDIA_URLS[normalized]
  if (path) return base + path.replace(/^\/+/, '')
  const localPath = LOCAL_MEDIA_URLS[normalized]
  if (localPath) return localPath
  throw new Error(`No registered game media URL: ${normalized}`)
}

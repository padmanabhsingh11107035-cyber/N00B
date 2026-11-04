import type { Input } from '../engine/input'
import type { Quality, SaveData, SaveStore } from '../engine/save'

export type UiActions = {
  play(): void
  pause(): void
  resume(): void
  quit(): void
  advance(): void
  settings(patch: Partial<SaveData>): void
}
export type Screen = 'title' | 'play' | 'pause' | 'settings'

/** Small DOM overlay. All visible strings are fixed in English; discoveries are saved locally. */
export class FarboundUI {
  screen: Screen = 'title'
  private readonly root: HTMLElement
  private returnTo: Screen = 'title'

  constructor(private readonly save: SaveStore, private readonly actions: UiActions, private readonly input: Input) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', e => this.onClick(e))
    this.root.addEventListener('input', e => this.onInput(e))
    window.addEventListener('keydown', e => {
      if (e.code === 'Enter' && this.root.querySelector('.dialogue.is-open')) this.actions.advance()
    })
    this.updateProgress(save.data.story.stars.length, 10)
    this.refreshSettings()
    this.show('title')
  }

  show(screen: Screen): void {
    this.screen = screen
    this.root.dataset.screen = screen
    for (const panel of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      panel.classList.toggle('is-active', panel.dataset.screen === screen)
    }
    if (screen === 'title') this.updateTitleButton()
    if (screen === 'play') this.root.querySelector('.hud')?.classList.add('is-visible')
    else if (screen !== 'pause') this.root.querySelector('.hud')?.classList.remove('is-visible')
    if (screen === 'pause') this.root.querySelector('.hud')?.classList.add('is-visible')
    requestAnimationFrame(() => {
      const first = this.root.querySelector<HTMLElement>(`[data-screen="${screen}"] button:not([disabled])`)
      if (first && this.input.method !== 'touch') first.focus({ preventScroll: true })
    })
  }

  setPrompt(text: string): void {
    const prompt = this.root.querySelector<HTMLElement>('.interaction-hint')!
    prompt.textContent = text
    prompt.classList.toggle('is-visible', !!text && this.screen === 'play')
  }

  showDialogue(speaker: string, text: string): void {
    const panel = this.root.querySelector<HTMLElement>('.dialogue')!
    const who = panel.querySelector<HTMLElement>('.dialogue-speaker')!
    who.textContent = speaker || 'A quiet thought'
    who.classList.toggle('is-hidden', !speaker)
    panel.querySelector<HTMLElement>('.dialogue-text')!.textContent = text
    panel.classList.add('is-open')
    panel.setAttribute('aria-hidden', 'false')
    panel.querySelector<HTMLButtonElement>('[data-action="advance"]')?.focus({ preventScroll: true })
  }

  closeDialogue(): void {
    const panel = this.root.querySelector<HTMLElement>('.dialogue')!
    panel.classList.remove('is-open')
    panel.setAttribute('aria-hidden', 'true')
    this.setPrompt('')
  }

  updateProgress(found: number, total: number): void {
    this.root.querySelector<HTMLElement>('.progress-count')!.textContent = `${found} / ${total}`
    this.root.querySelector<HTMLElement>('.progress-fill')!.style.width = `${(found / total) * 100}%`
    this.root.querySelector<HTMLElement>('.title-progress')!.textContent = found ? `${found} of ${total} star memories found` : 'No memories found yet'
    this.updateTitleButton()
  }

  refreshSettings(): void {
    const d = this.save.data
    const sens = this.root.querySelector<HTMLInputElement>('[name="sensitivity"]')
    const music = this.root.querySelector<HTMLInputElement>('[name="musicVolume"]')
    const sfx = this.root.querySelector<HTMLInputElement>('[name="sfxVolume"]')
    if (sens) sens.value = String(d.sensitivity)
    if (music) music.value = String(d.musicVolume)
    if (sfx) sfx.value = String(d.sfxVolume)
    const muted = this.root.querySelector<HTMLInputElement>('[name="muted"]')
    if (muted) muted.checked = d.muted
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-quality]')) {
      button.setAttribute('aria-pressed', String(button.dataset.quality === d.quality))
    }
  }

  private updateTitleButton(): void {
    const label = this.root.querySelector<HTMLElement>('.play-label')
    if (label) label.textContent = this.save.data.story.stars.length ? 'Continue wandering' : 'Begin the walk'
  }

  private onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-quality]')
    if (!target) return
    const action = target.dataset.action
    if (target.dataset.quality) {
      const quality = target.dataset.quality as Quality
      this.actions.settings({ quality })
      this.refreshSettings()
      return
    }
    switch (action) {
      case 'play': this.actions.play(); break
      case 'pause': this.actions.pause(); break
      case 'resume': this.actions.resume(); break
      case 'quit': this.actions.quit(); break
      case 'settings': this.returnTo = this.screen; this.show('settings'); break
      case 'back': this.show(this.returnTo); break
      case 'advance': this.actions.advance(); break
    }
  }

  private onInput(event: Event): void {
    const el = event.target as HTMLInputElement
    if (!el.name) return
    if (el.name === 'sensitivity') this.actions.settings({ sensitivity: Number(el.value) })
    if (el.name === 'musicVolume') this.actions.settings({ musicVolume: Number(el.value) })
    if (el.name === 'sfxVolume') this.actions.settings({ sfxVolume: Number(el.value) })
    if (el.name === 'muted') this.actions.settings({ muted: el.checked })
  }

  private template(): string {
    return `
      <div class="brand-mark" aria-label="Farbound: Ruins Beyond"><span class="mark-sun"></span><span>FARBOUND</span><small>RUINS BEYOND</small></div>
      <section class="screen title-screen" data-screen="title" aria-label="Title screen">
        <div class="title-card">
          <p class="eyebrow">A small journey above the clouds</p>
          <h1>Farbound</h1><p class="subtitle">Ruins Beyond</p>
          <p class="intro">The engine can wait. There is a hill to wander, a fox to meet, and a quiet old guardian to find.</p>
          <button class="primary-button" data-action="play"><span class="play-label">Begin the walk</span><b aria-hidden="true">→</b></button>
          <button class="text-button" data-action="settings">Settings</button>
          <p class="title-progress">No memories found yet</p>
        </div>
        <p class="title-footer">WASD to walk · Click to look · E to listen</p>
      </section>
      <section class="hud" aria-label="Journey information">
        <div class="hud-title">FARBOUND <span>RUINS BEYOND</span></div>
        <div class="memory-meter"><span>STAR MEMORIES</span><b class="progress-count">0 / 10</b><i class="progress-track"><i class="progress-fill"></i></i></div>
        <button class="pause-button" data-action="pause" aria-label="Pause journey">Ⅱ</button>
        <div class="reticle" aria-hidden="true"><i></i></div>
        <div class="interaction-hint" aria-live="polite"></div>
        <div class="control-tip">WASD move · Click to look · Shift walk faster · Space jump · E listen · Esc pause</div>
      </section>
      <section class="screen pause-screen" data-screen="pause" aria-label="Paused">
        <div class="modal-card"><p class="eyebrow">A moment of stillness</p><h2>Paused</h2>
          <button class="primary-button" data-action="resume">Continue wandering <b>→</b></button>
          <button class="secondary-button" data-action="settings">Settings</button>
          <button class="text-button" data-action="quit">Return to the clouds</button>
        </div>
      </section>
      <section class="screen settings-screen" data-screen="settings" aria-label="Settings">
        <div class="modal-card settings-card"><p class="eyebrow">Make the journey yours</p><h2>Settings</h2>
          <label class="setting-row"><span>Graphics</span><span class="quality-group">
            <button data-quality="low">Low</button><button data-quality="medium">Balanced</button><button data-quality="high">High</button>
          </span></label>
          <label class="setting-row"><span>Look sensitivity</span><input name="sensitivity" type="range" min="0.2" max="3" step="0.1"></label>
          <label class="setting-row"><span>Music</span><input name="musicVolume" type="range" min="0" max="1" step="0.05"></label>
          <label class="setting-row"><span>Effects</span><input name="sfxVolume" type="range" min="0" max="1" step="0.05"></label>
          <label class="setting-row"><span>Mute all sound</span><input name="muted" type="checkbox"></label>
          <p class="setting-note">Low graphics is recommended for older devices. Your discoveries stay on this device.</p>
          <button class="secondary-button" data-action="back">Back</button>
        </div>
      </section>
      <section class="dialogue" aria-label="Conversation" aria-hidden="true">
        <div class="dialogue-card"><p class="dialogue-speaker"></p><p class="dialogue-text"></p>
          <button class="dialogue-next" data-action="advance">Continue <span>↵</span></button>
        </div>
      </section>
      <div class="touch" aria-label="Touch controls">
        <div class="touch-stick" aria-label="Movement joystick"><i></i></div>
        <div class="touch-buttons"><button data-touch="jump">Jump</button><button data-touch="interact">Listen</button><button data-touch="sprint">Run</button></div>
      </div>
      <div class="toast" aria-live="polite"></div>
    `
  }
}

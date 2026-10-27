const fontUrl = (file: string): string => `./assets/fonts/${file}`

const sora = fontUrl('Sora-VF.subset.woff2')
const figtree = fontUrl('Figtree-VF.subset.woff2')

/** Install and preload the English display and body fonts (they sit next to the page, under ./assets/fonts/). */
export function installGameFonts(): void {
  if (document.querySelector('style[data-coil-rush-fonts]')) return
  for (const href of [sora, figtree]) {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'font'
    link.type = 'font/woff2'
    link.crossOrigin = 'anonymous'
    link.href = href
    document.head.append(link)
  }
  const style = document.createElement('style')
  style.dataset.coilRushFonts = 'true'
  style.textContent = `
    @font-face { font-family: 'Sora'; src: url('${sora}') format('woff2'); font-weight: 100 900; font-display: swap; }
    @font-face { font-family: 'Figtree'; src: url('${figtree}') format('woff2'); font-weight: 300 900; font-display: swap; }
  `
  document.head.append(style)
}

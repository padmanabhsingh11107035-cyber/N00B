// The ten NOOB Cold Drinks cans. To change a name, a line of text, a price or the look of a can, change it here and build again (see README.md).
//
// sweet, fizz: how sweet and how fizzy the drink is, from 1 to 5 (shown as little bars).
// colors: a / b = the two colours of the flavour (the glow, the lit page and the big name), bg1 / bg2 = the page behind the can.
// design: the look of the can itself.
//   base     the colour of the can, from the top to the bottom (three steps of a gradient)
//   ink      the colour of the doodles drawn all over the can
//   word     the colour of the big NOOB logo; accent = the colour of its shadow and of the thin lines round the can
//   deco     a second pattern under the doodles: 'none', 'halftone' (dots), 'stripes', 'waves' or 'glow'
//   flake    how much metallic glitter the paint has (0 to 1)
//   finish   'gloss' (glossy paint, like a car) or 'metal' (shiny coloured metal)
export const FLAVORS = [
  {
    id: 'cola-night', name: 'Cola Night', tagline: 'The classic, turned up.',
    notes: ['Bold cola', 'Caramel', 'Big fizz'], price: 40, size: '330 ml', sweet: 3, fizz: 5,
    colors: { a: '#ff2a3d', b: '#ff7a59', bg1: '#2a0a10', bg2: '#050506' },
    design: { base: ['#26262b', '#0a0a0c', '#1a1a1f'], ink: '#ffffff', word: '#ffffff', accent: '#ff2a3d', deco: 'halftone', flake: 0.55, finish: 'gloss' }
  },
  {
    id: 'blue-blast', name: 'Blue Blast', tagline: 'Brain freeze, but fun.',
    notes: ['Blue raspberry', 'Ice cool', 'Sweet'], price: 40, size: '330 ml', sweet: 4, fizz: 4,
    colors: { a: '#2aa8ff', b: '#6ee7ff', bg1: '#06245e', bg2: '#030a1f' },
    design: { base: ['#3b82ff', '#1450ff', '#0a2bb8'], ink: '#ffffff', word: '#ffffff', accent: '#00e5ff', deco: 'glow', flake: 0.7, finish: 'metal' }
  },
  {
    id: 'lime-zing', name: 'Lime Zing', tagline: 'Sharp. Fresh. Loud.',
    notes: ['Lemon-lime', 'Zesty', 'Crisp'], price: 40, size: '330 ml', sweet: 3, fizz: 4,
    colors: { a: '#b6ff1a', b: '#ffe94a', bg1: '#143d06', bg2: '#050f02' },
    design: { base: ['#e4ff5a', '#a6f000', '#5cb800'], ink: '#0a0a0a', word: '#0a0a0a', accent: '#ffffff', deco: 'stripes', flake: 0.6, finish: 'metal' }
  },
  {
    id: 'orange-rush', name: 'Orange Rush', tagline: 'Rush hour, but chill.',
    notes: ['Juicy orange', 'Sweet', 'Tangy'], price: 40, size: '330 ml', sweet: 4, fizz: 3,
    colors: { a: '#ff8a00', b: '#ffc23a', bg1: '#4a1b00', bg2: '#120600' },
    design: { base: ['#ffb830', '#ff7000', '#e03c00'], ink: '#ffffff', word: '#111111', accent: '#ffffff', deco: 'waves', flake: 0.6, finish: 'metal' }
  },
  {
    id: 'watermelon-pop', name: 'Watermelon Pop', tagline: 'Summer in a can.',
    notes: ['Ripe watermelon', 'Light', 'Refreshing'], price: 45, size: '330 ml', sweet: 4, fizz: 3,
    colors: { a: '#ff3d86', b: '#5df08f', bg1: '#47081f', bg2: '#12040a' },
    design: { base: ['#ff8cc4', '#ff2e86', '#d4116a'], ink: '#111111', word: '#ffffff', accent: '#17d46c', deco: 'halftone', flake: 0.5, finish: 'gloss' }
  },
  {
    id: 'mango-tango', name: 'Mango Tango', tagline: 'Dance in every sip.',
    notes: ['Sweet Indian mango', 'Smooth', 'Fruity'], price: 45, size: '330 ml', sweet: 5, fizz: 2,
    colors: { a: '#ffc21a', b: '#ff7a1a', bg1: '#4a3200', bg2: '#140c00' },
    design: { base: ['#fff08a', '#ffc800', '#e8920a'], ink: '#111111', word: '#111111', accent: '#ff6a00', deco: 'glow', flake: 0.7, finish: 'metal' }
  },
  {
    id: 'grape-galaxy', name: 'Grape Galaxy', tagline: 'Out of this world.',
    notes: ['Bold grape', 'Smooth finish', 'Sparkling'], price: 45, size: '330 ml', sweet: 4, fizz: 4,
    colors: { a: '#a66bff', b: '#e879f9', bg1: '#25095c', bg2: '#08021a' },
    design: { base: ['#9a5cff', '#5d22d8', '#26097a'], ink: '#f3eaff', word: '#ffffff', accent: '#e879f9', deco: 'waves', flake: 0.85, finish: 'metal' }
  },
  {
    id: 'cherry-blaze', name: 'Cherry Blaze', tagline: 'Hot flavour, cold can.',
    notes: ['Dark cherry', 'Spicy-sweet kick', 'Bold'], price: 45, size: '330 ml', sweet: 4, fizz: 4,
    colors: { a: '#ff2a4a', b: '#ffb21a', bg1: '#4d0010', bg2: '#12020a' },
    design: { base: ['#ff4258', '#d6001e', '#760011'], ink: '#111111', word: '#ffffff', accent: '#ffb21a', deco: 'stripes', flake: 0.5, finish: 'gloss' }
  },
  {
    id: 'mint-frost', name: 'Mint Frost', tagline: 'Chill mode: on.',
    notes: ['Cool mint', 'Clean finish', 'Icy'], price: 40, size: '330 ml', sweet: 2, fizz: 3,
    colors: { a: '#2ee6c8', b: '#9ffff0', bg1: '#06403a', bg2: '#020f0e' },
    design: { base: ['#9ff8e8', '#25d4b6', '#0a8d7e'], ink: '#ffffff', word: '#05403a', accent: '#ffffff', deco: 'halftone', flake: 0.65, finish: 'metal' }
  },
  {
    id: 'peach-fizz', name: 'Peach Fizz', tagline: 'Soft vibes, big fizz.',
    notes: ['Juicy peach', 'Light bubbles', 'Gentle'], price: 40, size: '330 ml', sweet: 3, fizz: 2,
    colors: { a: '#ff8fa3', b: '#ffc9a0', bg1: '#4d1f2c', bg2: '#140609' },
    design: { base: ['#ffffff', '#f6f3f0', '#ffe2d6'], ink: '#111111', word: '#111111', accent: '#ff8fa3', deco: 'none', flake: 0.35, finish: 'gloss' }
  }
];

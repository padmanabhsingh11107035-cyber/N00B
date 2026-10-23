// The ten NOOB Cold Drinks cans. To change a name, a line of text, a price or the colour of a can, change it here and build again (see README.md).
//
// sweet, fizz: how sweet and how fizzy the drink is, from 1 to 5 (shown as little bars).
// colors: a / b = the two colours of the flavour (the small details of the page), bg1 / bg2 = the dark page behind the can.
// design: the can itself, kept plain.
//   color      the colour of the can
//   ink        the colour of the thin doodles of the app that are drawn all over it
//   word       the colour of the big NOOB logo
//   metalness  how much like coloured metal it is (0 to 1); a light colour needs a little less, or it turns grey
export const FLAVORS = [
  {
    id: 'cola-night', name: 'Cola Night', tagline: 'The classic, turned up.',
    notes: ['Bold cola', 'Caramel', 'Big fizz'], price: 40, size: '330 ml', sweet: 3, fizz: 5,
    colors: { a: '#ff2a3d', b: '#ff7a59', bg1: '#2a0a10', bg2: '#050506' },
    design: { color: '#141416', ink: '#ffffff', word: '#ffffff', metalness: 0.85 }
  },
  {
    id: 'blue-blast', name: 'Blue Blast', tagline: 'Brain freeze, but fun.',
    notes: ['Blue raspberry', 'Ice cool', 'Sweet'], price: 40, size: '330 ml', sweet: 4, fizz: 4,
    colors: { a: '#2aa8ff', b: '#6ee7ff', bg1: '#06245e', bg2: '#030a1f' },
    design: { color: '#1356e6', ink: '#ffffff', word: '#ffffff', metalness: 0.8 }
  },
  {
    id: 'lime-zing', name: 'Lime Zing', tagline: 'Sharp. Fresh. Loud.',
    notes: ['Lemon-lime', 'Zesty', 'Crisp'], price: 40, size: '330 ml', sweet: 3, fizz: 4,
    colors: { a: '#b6ff1a', b: '#ffe94a', bg1: '#143d06', bg2: '#050f02' },
    design: { color: '#9bdc12', ink: '#0a0a0a', word: '#0a0a0a', metalness: 0.8 }
  },
  {
    id: 'orange-rush', name: 'Orange Rush', tagline: 'Rush hour, but chill.',
    notes: ['Juicy orange', 'Sweet', 'Tangy'], price: 40, size: '330 ml', sweet: 4, fizz: 3,
    colors: { a: '#ff8a00', b: '#ffc23a', bg1: '#4a1b00', bg2: '#120600' },
    design: { color: '#ff6a00', ink: '#ffffff', word: '#111111', metalness: 0.8 }
  },
  {
    id: 'watermelon-pop', name: 'Watermelon Pop', tagline: 'Summer in a can.',
    notes: ['Ripe watermelon', 'Light', 'Refreshing'], price: 45, size: '330 ml', sweet: 4, fizz: 3,
    colors: { a: '#ff3d86', b: '#5df08f', bg1: '#47081f', bg2: '#12040a' },
    design: { color: '#ff2e86', ink: '#ffffff', word: '#ffffff', metalness: 0.8 }
  },
  {
    id: 'mango-tango', name: 'Mango Tango', tagline: 'Dance in every sip.',
    notes: ['Sweet Indian mango', 'Smooth', 'Fruity'], price: 45, size: '330 ml', sweet: 5, fizz: 2,
    colors: { a: '#ffc21a', b: '#ff7a1a', bg1: '#4a3200', bg2: '#140c00' },
    design: { color: '#ffc400', ink: '#111111', word: '#111111', metalness: 0.8 }
  },
  {
    id: 'grape-galaxy', name: 'Grape Galaxy', tagline: 'Out of this world.',
    notes: ['Bold grape', 'Smooth finish', 'Sparkling'], price: 45, size: '330 ml', sweet: 4, fizz: 4,
    colors: { a: '#a66bff', b: '#e879f9', bg1: '#25095c', bg2: '#08021a' },
    design: { color: '#6a2be0', ink: '#ffffff', word: '#ffffff', metalness: 0.8 }
  },
  {
    id: 'cherry-blaze', name: 'Cherry Blaze', tagline: 'Hot flavour, cold can.',
    notes: ['Dark cherry', 'Spicy-sweet kick', 'Bold'], price: 45, size: '330 ml', sweet: 4, fizz: 4,
    colors: { a: '#ff2a4a', b: '#ffb21a', bg1: '#4d0010', bg2: '#12020a' },
    design: { color: '#d6001e', ink: '#ffffff', word: '#ffffff', metalness: 0.8 }
  },
  {
    id: 'mint-frost', name: 'Mint Frost', tagline: 'Chill mode: on.',
    notes: ['Cool mint', 'Clean finish', 'Icy'], price: 40, size: '330 ml', sweet: 2, fizz: 3,
    colors: { a: '#2ee6c8', b: '#9ffff0', bg1: '#06403a', bg2: '#020f0e' },
    design: { color: '#1fcbb0', ink: '#ffffff', word: '#05403a', metalness: 0.78 }
  },
  {
    id: 'peach-fizz', name: 'Peach Fizz', tagline: 'Soft vibes, big fizz.',
    notes: ['Juicy peach', 'Light bubbles', 'Gentle'], price: 40, size: '330 ml', sweet: 3, fizz: 2,
    colors: { a: '#ff8fa3', b: '#ffc9a0', bg1: '#4d1f2c', bg2: '#140609' },
    design: { color: '#ffffff', ink: '#111111', word: '#111111', metalness: 0.35 }
  }
];

/**
 * English story and encounter rules adapted directly from the supplied Faraway source bundle.
 * The game pins its visible content to English; unused translations are intentionally excluded.
 */


export type Speaker = '' | 'fox' | 'rose' | 'sheep' | 'tapir' | 'shoebill' | 'you'
export type Line = readonly [Speaker, string]
export type Target = 'plane' | 'hat' | 'sprout' | 'fox' | 'rose' | 'sheep' | 'box' | 'tapir' | 'shoebill' | 'guardian'
export type StarId = Target
/** Order of the ten stars in the HUD. */
export const STARS: readonly StarId[] = ['plane', 'fox', 'rose', 'sheep', 'box', 'sprout', 'hat', 'tapir', 'shoebill', 'guardian']
export const FOX_TAMED = 3
/** Scripts write the player's name as this token; the UI swaps the real name in when a talk opens. */
export const NAME_TOKEN = '{name}'
export function personalize(text: string, name: string): string {
  return text.split(NAME_TOKEN).join(name)
}

export type Book = {
  plane: { first: Line[]; again: Line[][] }
  hat: { first: Line[]; again: Line[][] }
  sprout: { first: Line[]; more: Line[]; last: Line[] }
  fox: { meet: [Line[], Line[], Line[]]; tamed: Line[][] }
  rose: { first: Line[]; again: Line[][]; fox: Line[] }
  sheep: { first: Line[]; again: Line[][] }
  box: { first: Line[]; again: Line[][] }
  tapir: { first: Line[]; again: Line[][] }
  shoebill: { first: Line[]; again: Line[][] }
  guardian: { first: Line[]; again: Line[][]; awake: Line[]; after: Line[][] }
}

export const EN_BOOK: Book = {
  plane: {
    first: [
      ['', 'This is your aeroplane. It has buried its nose in the grass, as if smelling the earth.'],
      ['', 'One propeller blade is bent, and a small cloud is stuck in the engine.'],
      ['', 'There is water enough for a few days. Mending it will take a long time — but today you are in no hurry at all.'],
    ],
    again: [
      [['', 'You tighten a bolt. The aeroplane seems to give a small sigh.']],
      [['', 'You draw a sheep on the wing, study it for a long while, then rub it out. This one looks rather ill.']],
      [['', 'So you draw a box instead, with three little holes in its side. That is much better.']],
      [['', 'Far away, the clouds are slowly changing shape. You decide the engine can wait until tomorrow.']],
    ],
  },
  hat: {
    first: [
      ['', 'A strangely shaped stone: low at one end, high at the other, with a great bulge in the middle.'],
      ['', 'Grown-ups who pass by always say, “What a nice hat.”'],
      ['', 'But you can see at once that it is a boa constrictor that has swallowed an elephant, and is slowly digesting it.'],
      ['you', '…Better not to explain it to the grown-ups.'],
    ],
    again: [
      [['', 'The boa is still digesting. By the look of it, it will take several months.']],
      [['', 'You put your ear to the stone. Somewhere inside, an elephant is snoring very quietly.']],
    ],
  },
  sprout: {
    first: [
      ['', 'A little shoot has come up through the grass, holding up two round leaves.'],
      ['', 'It is a baobab sprout. While they are small, they look almost exactly like rose sprouts.'],
      ['', 'You pull it up by the root. Left to grow, its roots would split the whole hill apart.'],
    ],
    more: [['', 'Another one pulled. It is a dull job, but an important one.']],
    last: [
      ['', 'That is all the baobab sprouts for today.'],
      ['', 'Tomorrow morning they will come up again. You must remember, every day.'],
    ],
  },
  fox: {
    meet: [
      [
        ['fox', 'Stop there. One more step and I will run.'],
        ['you', 'I won’t hurt you. My name is {name}.'],
        ['fox', '{name}… I know you won’t. But knowing a name is not the same as knowing someone.'],
        ['fox', 'On this hill you are only someone passing by, and I am only a patch of orange in the grass.'],
        ['fox', 'If you came often, and sat a little closer each time…'],
        ['fox', 'then one day I might tell your footsteps apart from the sound of the wind.'],
        ['fox', 'That is enough for today. Next time, you may come a little nearer.'],
      ],
      [
        ['fox', 'You came back, {name}.'],
        ['fox', 'Do you know, I started being happy before the clouds had even drifted over?'],
        ['fox', 'The nearer it came to your coming, the more I fidgeted. My tail kept sweeping the grass.'],
        ['fox', 'That is why there should be a proper hour. Otherwise I never know when to start getting my heart ready.'],
        ['fox', 'Go on now. Next time, a little closer.'],
      ],
      [
        ['fox', 'I don’t eat bread, and I don’t watch clouds. Clouds never meant anything to me.'],
        ['fox', 'But that red ribbon… from now on, whenever I see it flying in the wind, I will think of you.'],
        ['fox', 'And I will come to love the sound of the wind in the grass.'],
        ['fox', 'There, {name}. You have tamed me.'],
        ['fox', 'From now on, wherever you go, I will follow.'],
      ],
    ],
    tamed: [
      [
        ['fox', 'Here is a secret: you have to close your eyes to see the things that matter most.'],
        ['fox', 'Like now. My eyes are shut, and still I know it’s you, {name}.'],
      ],
      [['fox', 'The time you spent on me is what makes me different from every other fox.']],
      [['fox', 'Don’t forget, {name}: you tamed me. That is something you are responsible for, always.']],
      [['fox', 'Are you watching the clouds, {name}? I am watching you watch the clouds.']],
      [['fox', 'The wind is gentlest by the rose. The guardian’s hand keeps it off her.']],
      [['fox', 'Today the wind smells a little sweet.']],
    ],
  },
  rose: {
    first: [
      ['', 'Beside the guardian’s big hand, resting in the grass, a red rose is growing under a glass dome.'],
      ['', 'You gently lift the glass.'],
      ['rose', 'Ah, there you are at last. I have only just woken up; my petals are not yet in order.'],
      ['you', 'Hello. My name is {name}.'],
      ['rose', '{name}. A fine name — though not, of course, as fine as “rose”.'],
      ['rose', 'Have you seen my thorns? One, two, three, four. I am not the least bit afraid.'],
      ['rose', '…Though the wind is a little cold. When you leave, remember to put my dome back.'],
    ],
    again: [
      [['rose', 'That big one keeps the wind off me every day. It never says a word, but I know it is listening.']],
      [['rose', 'You needn’t come to see me every day, {name}. …But if you do come, I shall be very glad.']],
      [['rose', 'I have no need of a screen, you understand. I am only… a tiny bit afraid of the cold.']],
      [['rose', 'You think there are many roses in the world? Perhaps. But I am the only one whose dome you have lifted.']],
    ],
    fox: [['rose', 'You smell of fox, {name}. So you have tamed something too.']],
  },
  sheep: {
    first: [
      ['sheep', 'Baa—'],
      ['', 'A little sheep, fluffy as a cloud, is very seriously chewing a blade of grass.'],
      ['', 'It looks at the rose, and then at you.'],
      ['you', '…You are not to eat her.'],
      ['sheep', 'Baa.'],
    ],
    again: [
      [['', 'You remember that you ought to draw it a muzzle. But you forgot to draw the strap.']],
      [
        ['sheep', 'Baa?'],
        ['', 'It rests its head against the guardian’s cold fingers and yawns.'],
      ],
      [
        ['', 'There are a few petals caught in its wool. Who knows which flower they fell from.'],
        ['', '…Let us hope not that one.'],
      ],
      [
        ['sheep', 'Baa—'],
        ['', 'It seems a little plumper since it came out of its box.'],
      ],
      [
        ['sheep', 'Baa… {name}… baa.'],
        ['', 'It says your name the way one might say the name of a particularly delicious grass.'],
      ],
    ],
  },
  box: {
    first: [
      ['', 'A small wooden box with three air holes in its side.'],
      ['', 'It is empty, except for a little dry grass.'],
      ['', 'The sheep that lived in it must have let itself out.'],
    ],
    again: [
      [['', 'You peer through a hole and cannot see a thing. Still, you feel sure there is a sheep asleep in there.']],
      [['', 'Sometimes a box is more of a sheep than a sheep is.']],
    ],
  },
  tapir: {
    first: [
      ['tapir', 'Shh — I’m eating.'],
      ['you', 'Eating grass?'],
      ['tapir', 'No. Dreams. Last night the whole hill was full of them.'],
      ['tapir', 'One of them fell out of the sky. On the back it said “{name}”.'],
      ['tapir', 'It had an engine in it, and a little bit of being afraid.'],
      ['tapir', 'I ate the afraid part. The flying part I’m giving back to you.'],
      ['tapir', 'Don’t thank me. Black-and-white animals are made for keeping dreams and waking apart.'],
    ],
    again: [
      [
        ['tapir', 'Grown-ups’ dreams are always tough. You have to chew them for a long time.'],
        ['tapir', 'Children’s dreams are soft, like grass that has only just come up.'],
      ],
      [
        ['tapir', 'Do you know why I’m half black and half white?'],
        ['you', 'Why?'],
        ['tapir', 'So that at night you can only see half of me. The other half I keep for the day.'],
      ],
      [
        ['tapir', 'If you have a bad dream tonight, {name}, come and find me on this slope.'],
        ['tapir', 'I’ll walk over very softly. I won’t wake you.'],
      ],
      [['', 'The tapir touches a wildflower with its trunk, smells it for a long time, and decides not to eat it.']],
    ],
  },
  shoebill: {
    first: [
      ['shoebill', '…'],
      ['you', 'Hello?'],
      ['shoebill', '…'],
      ['shoebill', 'I’m thinking. I’ve been thinking for three days.'],
      ['you', 'About what?'],
      ['shoebill', 'About whether I ought to move.'],
      ['shoebill', 'The guardian has sat here even longer than I have stood. I’m learning from it.'],
      ['shoebill', 'You are… {name}.'],
      ['you', 'I haven’t told you yet.'],
      ['shoebill', 'The wind did. Three days ago.'],
      ['', 'Very, very slowly, it bows to you.'],
    ],
    again: [
      [
        ['shoebill', '…'],
        ['shoebill', 'Did you say something just now? I’m still answering the last thing you said.'],
      ],
      [
        ['shoebill', 'Grown-ups look at me and think I’m cross.'],
        ['shoebill', 'The same way they look at that stone and think it’s a hat.'],
      ],
      [
        ['shoebill', 'Stand still long enough and the wind thinks you are a tree.'],
        ['shoebill', 'And then it tells you its secrets.'],
      ],
      [['', 'The shoebill watches the clouds, and so do you. Nobody says anything. It is nice like this.']],
      [
        ['shoebill', '…{name}.'],
        ['shoebill', 'Nothing. I only wanted to check that I still remember.'],
      ],
    ],
  },
  guardian: {
    first: [
      ['', 'It does not speak.'],
      ['', 'You lay your hand against its fingers. The stone is warm from the sun, and fine grass grows in the cracks.'],
      ['', 'Its eye is dark, like a very, very deep well.'],
    ],
    again: [
      [['', 'A bird is sitting on its head. It keeps perfectly still, as if afraid to wake it.']],
      [['', 'It faces the sea of clouds. Perhaps it is waiting for a ship that sailed a long, long time ago.']],
      [['', 'One of its hands hangs low — just where it keeps the wind off the rose.']],
      [['', 'You sit at its feet for a while. The wind passes through its hollow joints like a very old song.']],
    ],
    awake: [
      ['', 'You lay your hand against its fingers.'],
      ['', 'For a long, long time, nothing happens.'],
      ['', 'Then, very softly, its eye begins to glow.'],
      ['', 'Like a star that laughs, even in daylight.'],
      ['', 'The wind passes through its hollow joints with a very soft sound. It sounds as if it is calling your name: {name}.'],
      ['', 'Perhaps it was never waiting for someone to come back — only for someone to sit and watch the clouds with it for a while.'],
      ['', 'From now on, whenever you look up at the clouds, you will think of all of them on this hill.'],
    ],
    after: [
      [['', 'There is a very small light in its eye now.']],
      [['', 'The wind blows in from deep in the sea of clouds. It sits as silent as ever, but you know it is smiling.']],
    ],
  },
}

/** What the hill remembers (`stars`, `fox`, `awake` are saved; the rest lasts one visit). */
export type StoryState = {
  stars: StarId[]
  fox: number
  awake: boolean
  /** Conversations already had with each target during this visit. */
  visits: Partial<Record<Target, number>>
  /** Baobab sprouts still standing (including the one being pulled). */
  sproutsLeft: number
  roseSmeltFox: boolean
}

export type Effects = {
  star?: StarId
  /** New fox taming level. */
  fox?: number
  pullSprout?: boolean
  liftDome?: boolean
  awaken?: boolean
  roseSmeltFox?: boolean
}

const cycle = <T>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length]

export type Choice = { lines: Line[]; effects: Effects; /** A repeat line was used: advance `visits`. */ repeat?: boolean }

/** Pick what a target says now, and what talking to it changes. */
export function chooseScript(book: Book, target: Target, s: StoryState): Choice {
  const seen = s.stars.includes(target)
  const n = s.visits[target] ?? 0
  const first = (lines: Line[]): Choice => ({ lines, effects: { star: target } })
  const again = (list: Line[][], effects: Effects = {}): Choice => ({ lines: cycle(list, n), effects, repeat: true })
  switch (target) {
    case 'plane':
    case 'hat':
    case 'sheep':
    case 'box':
    case 'tapir':
    case 'shoebill': {
      const b = book[target]
      if (!seen) return first(b.first)
      return again(b.again)
    }
    case 'sprout': {
      const b = book.sprout
      if (!seen) return { lines: b.first, effects: { star: 'sprout', pullSprout: true } }
      return { lines: s.sproutsLeft <= 1 ? b.last : b.more, effects: { pullSprout: true } }
    }
    case 'fox': {
      const b = book.fox
      if (s.fox < FOX_TAMED) {
        const level = Math.max(0, s.fox)
        const effects: Effects = { fox: level + 1 }
        if (level + 1 >= FOX_TAMED) effects.star = 'fox'
        return { lines: b.meet[level], effects }
      }
      return again(b.tamed, seen ? {} : { star: 'fox' })
    }
    case 'rose': {
      const b = book.rose
      if (!seen) return { lines: b.first, effects: { star: 'rose', liftDome: true } }
      if (s.fox >= FOX_TAMED && !s.roseSmeltFox) return { lines: b.fox, effects: { liftDome: true, roseSmeltFox: true } }
      return again(b.again, { liftDome: true })
    }
    case 'guardian': {
      const b = book.guardian
      if (!seen) return first(b.first)
      if (s.awake) return again(b.after)
      if (STARS.every(id => s.stars.includes(id))) return { lines: b.awake, effects: { awaken: true } }
      return again(b.again)
    }
  }
}

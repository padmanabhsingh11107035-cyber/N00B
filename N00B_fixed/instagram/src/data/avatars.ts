// The free NOOB avatars: thirty-six characters (each one of a kind: the colour twins and the repeated poses of the first pictures were left out). A person picks one from the three
// dots on their profile (Choose an avatar); it becomes the profile picture. The pictures are in public/avatars/<id>.webp, with three close-ups of the clothes (-top, -pants, -boots).
// The names, the roles and every word below are NOOB's own story for the characters (nothing here is about a real person).
import { MAIN_SITE } from '../utils/siteUrl.ts';

export interface AvatarClothing { part: string; text: string; image: 'top' | 'pants' | 'boots' }
export interface AvatarInfo { age: number; height: string; from: string; vibe: string; colour: string; sound: string }
export interface Avatar {
  id: string; name: string; role: string; tagline: string;
  /** the colour of the picture's background (the page takes the same colour) */
  bg: string;
  /** a dark text colour is needed on a pale background */
  light?: boolean;
  intro: string; clothing: AvatarClothing[]; extras: string[]; info: AvatarInfo; traits: Array<[string, string]>;
}

const C = (top: string, pants: string, boots: string): AvatarClothing[] => [
  { part: 'Jacket and top', text: top, image: 'top' },
  { part: 'Trousers and belts', text: pants, image: 'pants' },
  { part: 'Boots', text: boots, image: 'boots' }
];

export const AVATARS: ReadonlyArray<Avatar> = [
  {
    id: 'nova', name: 'Nova', role: 'Pathfinder', tagline: 'First to arrive, last to doubt', bg: '#02c8e2',
    intro: 'Nova grew up on the rooftops of Mumbai, where every shortcut is a story. She reads a crowd the way other people read a map and always knows the quickest way to the best spot. She is the friend who says "follow me" and is right.',
    clothing: C('An aqua bomber jacket worn open over a black crop top, with zip pockets on the sleeves and a chain of small buckles.', 'Black tactical cargo trousers with aqua straps down the legs, a wide belt and pockets for everything.', 'Chunky black high-top boots with aqua soles and thick laces.'),
    extras: ['Fingerless gloves', 'Silver earrings', 'Long wavy dark hair'],
    info: { age: 21, height: '168 cm', from: 'Mumbai', vibe: 'Bold and curious', colour: 'Aqua', sound: 'Rooftop lo-fi' },
    traits: [['Quick feet', 'Finds the fastest way through any crowd.'], ['Open hands', 'Makes new friends in one minute.'], ['Cool head', 'Never panics, even when lost.']]
  },
  {
    id: 'blaze', name: 'Blaze', role: 'Streetrunner', tagline: 'Fast, loud and always in yellow', bg: '#fc8302',
    intro: 'Blaze never walks. Her cap is her signature and the yellow stripes on her jacket are the first thing you see when she turns a corner. She turns every errand into a race and every race into a party.',
    clothing: C('A cropped yellow-and-black jacket with wide sleeves and a black crop top; a black cap with a gold star on the front.', 'Black cargo trousers with bright yellow straps, pouches on the hips and a fastened belt.', 'Black and yellow high-top sneakers with white soles.'),
    extras: ['Black cap with a star', 'Fingerless gloves', 'Yellow belt straps'],
    info: { age: 20, height: '165 cm', from: 'Delhi', vibe: 'Loud and loyal', colour: 'Sun yellow', sound: 'Fast drums' },
    traits: [['Sprint', 'Wins every race to the canteen.'], ['Hype', 'Cheers louder than the whole stadium.'], ['Cap trick', 'Never loses her cap, ever.']]
  },
  {
    id: 'roxy', name: 'Roxy', role: 'Striker', tagline: 'Pink hair, red alert', bg: '#7928df',
    intro: 'Roxy plays to win and dresses to be seen. The pastel pink hair and the red-and-black jacket mean one thing on the pitch: she is coming for the ball. Off the pitch she is the warmest person in the group chat.',
    clothing: C('A white crop top under a red-and-black jacket worn off the shoulder, with a silver chain at the neck.', 'Black shorts with red straps and buckles, thigh straps on both legs and black stockings with red stripes.', 'Black and red chunky sneakers with white soles.'),
    extras: ['Long pastel pink hair', 'Thigh straps', 'Silver necklace'],
    info: { age: 22, height: '172 cm', from: 'Pune', vibe: 'Fierce and funny', colour: 'Ruby red', sound: 'Stadium bass' },
    traits: [['Power shot', 'Hits harder than anyone on the team.'], ['Comeback', 'Plays best when she is losing.'], ['Warm heart', 'Always shares the snacks.']]
  },
  {
    id: 'zest', name: 'Zest', role: 'Scout', tagline: 'Sees it before you do', bg: '#7ece27',
    intro: 'Zest is the lookout of every crew: calm voice, sharp eyes and a long green jacket that disappears into any garden. She spots the new trend, the new cafe and the new song before they are famous.',
    clothing: C('A lime-green crop top under a long black jacket with neon-green trim and a hood that sits low on the shoulders.', 'Loose black cargo trousers with deep pockets and a belt with a bright green buckle.', 'Black boots with lime-green soles and laces.'),
    extras: ['Long dark hair', 'Neon green trim', 'Fingerless gloves'],
    info: { age: 21, height: '170 cm', from: 'Bengaluru', vibe: 'Calm and curious', colour: 'Lime', sound: 'Indie guitar' },
    traits: [['Eagle eyes', 'Notices the tiny details.'], ['Trend radar', 'Finds the next big thing first.'], ['Soft steps', 'Moves without a sound.']]
  },
  {
    id: 'mira', name: 'Mira', role: 'Vocalist', tagline: 'Her voice fills the room', bg: '#f72687',
    intro: 'Mira sings on balconies, on buses and sometimes in her sleep. Her long black hair and magenta streaks are the stage lights she carries everywhere. When she starts a chorus, the whole street joins in.',
    clothing: C('A black halter crop top under a magenta-and-black jacket that slides off one shoulder.', 'Black cargo trousers with hot-pink straps and ribbons from belt to ankle.', 'Black and pink chunky boots with white stitching.'),
    extras: ['Long black hair', 'Fingerless gloves', 'Choker necklace'],
    info: { age: 20, height: '166 cm', from: 'Kolkata', vibe: 'Dreamy and loud', colour: 'Hot pink', sound: 'Pop ballads' },
    traits: [['Big voice', 'Hits the high note every time.'], ['Crowd magnet', 'People stop to listen.'], ['Night owl', 'Writes songs after midnight.']]
  },
  {
    id: 'ivory', name: 'Ivory', role: 'Mediator', tagline: 'Keeps the peace, keeps the style', bg: '#f7bc09',
    intro: 'Ivory has silver hair and a gentle way of ending arguments. She wears white cargo trousers because she believes a good day should keep them clean. Whoever is upset ends up sitting next to her.',
    clothing: C('A yellow-and-black jacket over a black crop top, with a strap across the chest and a small pouch.', 'White cargo trousers with black straps, big side pockets and cuffs at the ankle.', 'White and yellow high-top sneakers.'),
    extras: ['Long silver hair', 'Hand on head pose', 'Black belt with a gold buckle'],
    info: { age: 23, height: '171 cm', from: 'Jaipur', vibe: 'Gentle and wise', colour: 'Gold', sound: 'Soft piano' },
    traits: [['Peace maker', 'Turns any fight into a laugh.'], ['Clean style', 'Her whites stay white.'], ['Listener', 'Remembers every story.']]
  },
  {
    id: 'vesper', name: 'Vesper', role: 'Dancer', tagline: 'Starts the party at sunset', bg: '#6828c5',
    intro: 'Vesper comes alive when the sun goes down. A violet jacket, black shorts and boots made for spinning: she can turn any pavement into a dance floor. Her playlist has never been the same twice.',
    clothing: C('A fitted violet top under a wide-sleeved violet jacket with purple stitching.', 'Black shorts with a thigh strap on one leg and a slim belt with pouches.', 'Black ankle boots with purple soles and tall socks.'),
    extras: ['Long dark hair', 'Thigh strap', 'Fingerless gloves'],
    info: { age: 22, height: '174 cm', from: 'Goa', vibe: 'Free and glowing', colour: 'Violet', sound: 'House and funk' },
    traits: [['Spin', 'Never gets dizzy.'], ['Rhythm', 'Feels the beat in her feet.'], ['Glow', 'Lights up every photo.']]
  },
  {
    id: 'kairo', name: 'Kairo', role: 'Guardian', tagline: 'Stands between you and trouble', bg: '#167bf7',
    intro: 'Kairo carries a long case on his back and never says what is inside. His black coat with glowing blue lines is known across the campus. He walks the late-night corridors so everybody else can sleep.',
    clothing: C('A long black coat with glowing blue lines over a grey-blue open-collar shirt and a loose tie.', 'Black cargo trousers with deep pockets, a dark belt and a long coat tail with blue lining.', 'Black boots with blue and white soles.'),
    extras: ['A long case on his back', 'Short black hair', 'Fingerless gloves'],
    info: { age: 24, height: '182 cm', from: 'Hyderabad', vibe: 'Quiet and steady', colour: 'Electric blue', sound: 'Night synth' },
    traits: [['Shield', 'Always stands in front.'], ['Patience', 'Waits for the right moment.'], ['Night watch', 'Awake when you need him.']]
  },
  {
    id: 'ember', name: 'Ember', role: 'Duelist', tagline: 'One look, one move', bg: '#ee3438',
    intro: 'Ember trains at dawn and argues with nobody, because she settles things in one move. A red-and-black jacket, a black wrap on her arms and a long blade on her back make her easy to find and hard to forget.',
    clothing: C('A black bralette under a red-and-black jacket with wide, rolled sleeves.', 'Black cargo trousers with red straps, a wide belt and strapped pockets.', 'Black and red heavy boots with red soles.'),
    extras: ['A long blade on her back', 'Long dark hair', 'Fingerless gloves'],
    info: { age: 23, height: '169 cm', from: 'Chennai', vibe: 'Focused and fierce', colour: 'Fire red', sound: 'War drums' },
    traits: [['Blade skill', 'Never needs a second try.'], ['Calm fire', 'Burns bright, stays cool.'], ['Dawn runner', 'First on the track.']]
  },
  {
    id: 'frost', name: 'Frost', role: 'Strategist', tagline: 'Three moves ahead', bg: '#dbe2ec',
    light: true,
    intro: 'Frost plans everything and still looks effortless. Her white jacket with cyan lines and her long silver hair are the calm in every noisy room. When the team is stuck, she is the one who draws the plan on a napkin.',
    clothing: C('A white cropped jacket with cyan details over a black top and a gold-buckled belt.', 'Black and white cargo trousers with cyan straps hanging at the sides.', 'White high-top boots with cyan panels.'),
    extras: ['Long silver hair', 'Fingerless gloves', 'Gold buckle belt'],
    info: { age: 22, height: '170 cm', from: 'Shimla', vibe: 'Cool and clever', colour: 'Ice white', sound: 'Rain ambience' },
    traits: [['Big picture', 'Sees the whole board.'], ['Napkin plans', 'Her best ideas fit on a napkin.'], ['Ice calm', 'Never raises her voice.']]
  },
  {
    id: 'sakura', name: 'Sakura', role: 'Charmer', tagline: 'Smile first, plan later', bg: '#fd42a0',
    intro: 'Sakura has pastel pink hair and a smile that opens doors. She introduces people who should know each other and remembers every birthday. Whatever room she walks into feels a little warmer.',
    clothing: C('A pink-and-black cropped jacket with big sleeves over a black top.', 'Black cargo trousers with pink straps, a slim belt and pouches.', 'Black and pink sneakers with chunky soles.'),
    extras: ['Long pastel pink hair', 'Hand-to-forehead pose', 'Silver necklace'],
    info: { age: 20, height: '164 cm', from: 'Ahmedabad', vibe: 'Sweet and sharp', colour: 'Blossom pink', sound: 'Dream pop' },
    traits: [['Connector', 'Knows everybody.'], ['Memory', 'Never forgets a birthday.'], ['Warm smile', 'Fixes a bad day.']]
  },
  {
    id: 'nyx', name: 'Nyx', role: 'Shadow', tagline: 'Quiet, quick, gone', bg: '#3330ba',
    intro: 'Nyx ties her hair in a high ponytail so it never gets in the way. A violet jacket and a see-through purple cape on one leg make her look like part of the night sky. She is the one who always knows what happened.',
    clothing: C('A violet cropped jacket over a black top, with narrow purple straps across the shoulders.', 'Slim black trousers with a long translucent purple cape hanging from the belt on one side.', 'Black and purple boots with high ankles.'),
    extras: ['High ponytail', 'Fingerless gloves', 'Purple cape'],
    info: { age: 21, height: '173 cm', from: 'Darjeeling', vibe: 'Mysterious and kind', colour: 'Indigo', sound: 'Midnight trap' },
    traits: [['Silent step', 'You never hear her coming.'], ['Night sight', 'Better in the dark.'], ['Secrets', 'Keeps every one.']]
  },
  {
    id: 'zane', name: 'Zane', role: 'Navigator', tagline: 'Never lost, only exploring', bg: '#02d0e8',
    intro: 'Zane lives on his phone map and in his cyan hoodie jacket. Give him any address on Earth and he will find the street food nearby. He is the friend who says "trust me, this way".',
    clothing: C('A black-and-cyan zip jacket with a high collar over a black tee.', 'Black cargo trousers with cyan buckles and straps on both legs.', 'Black and cyan sneakers with thick soles.'),
    extras: ['Short black hair', 'Fingerless gloves', 'Phone holster on the belt'],
    info: { age: 22, height: '180 cm', from: 'Kochi', vibe: 'Easy-going and bright', colour: 'Cyan', sound: 'Road-trip pop' },
    traits: [['Map brain', 'Remembers every turn.'], ['Food radar', 'Finds the best snacks.'], ['Good vibes', 'Always has a plan B.']]
  },
  {
    id: 'rogue', name: 'Rogue', role: 'Enforcer', tagline: 'Rules? He writes them', bg: '#d4152c',
    intro: 'Rogue hides half of his face behind a black mask and the other half behind a smirk. The long red-and-black coat, the silver hair and the silent walk make people stand up straighter. Under the coat he is a softie for stray cats.',
    clothing: C('A long red-and-black hooded coat with high collar over a black shirt and a thin chain.', 'Black cargo trousers with red straps, a belt with a square buckle and big pockets.', 'Black and red heavy boots.'),
    extras: ['Black face mask', 'Short silver hair', 'Fingerless gloves'],
    info: { age: 25, height: '184 cm', from: 'Lucknow', vibe: 'Tough outside, soft inside', colour: 'Crimson', sound: 'Dark hip-hop' },
    traits: [['Presence', 'Silences a room by walking in.'], ['Cat whisperer', 'Every stray follows him.'], ['Straight talk', 'Says it once.']]
  },
  {
    id: 'amara', name: 'Amara', role: 'Muse', tagline: 'Everyone\'s favourite idea', bg: '#7e28d3',
    intro: 'Amara paints, writes and dances, usually on the same afternoon. Her long dark hair and violet jacket show up in a dozen sketchbooks. Spend ten minutes with her and you want to start something new.',
    clothing: C('A cropped violet jacket with puffed sleeves over a black top.', 'Black cargo trousers with purple straps and ribbons.', 'Violet and white chunky sneakers.'),
    extras: ['Long dark hair', 'Arm-up pose', 'Choker necklace'],
    info: { age: 21, height: '167 cm', from: 'Udaipur', vibe: 'Creative and gentle', colour: 'Amethyst', sound: 'Acoustic covers' },
    traits: [['Inspire', 'Gives everyone a new idea.'], ['Sketchbook', 'Draws on everything.'], ['Kind eyes', 'Listens first.']]
  },
  {
    id: 'kiran', name: 'Kiran', role: 'Hacker', tagline: 'There is always a back door', bg: '#60bb22',
    intro: 'Kiran types faster than he talks and talks faster than he thinks. His black hoodie jacket with neon green lines is a uniform at every hackathon. He fixes your Wi-Fi, your phone and your bad mood, in that order.',
    clothing: C('A black hooded jacket with neon-green lines and straps over a black tee.', 'Black cargo trousers with lime straps and multiple pockets.', 'Black boots with lime-green soles.'),
    extras: ['Short black hair', 'Hands in pockets pose', 'Fingerless gloves'],
    info: { age: 23, height: '178 cm', from: 'Noida', vibe: 'Geeky and generous', colour: 'Neon green', sound: 'Chiptune' },
    traits: [['Fast fingers', 'Never touches the mouse.'], ['Fixer', 'Solves it in five minutes.'], ['Night shift', 'Best code after 2 am.']]
  },
  {
    id: 'orion', name: 'Orion', role: 'Phantom', tagline: 'Gone before the flash', bg: '#b32dda',
    intro: 'Orion has dark hair with blue streaks and moves like the end of a song. A violet hooded jacket with glowing seams makes him easy to spot at night and impossible to catch. He plays hide and seek like it is a sport.',
    clothing: C('A violet hooded jacket with glowing seams over a black shirt.', 'Black cargo trousers with violet straps and a side pouch.', 'Black and purple sneakers with white edges.'),
    extras: ['Blue-streaked hair', 'Hand in pocket', 'Fingerless gloves'],
    info: { age: 22, height: '179 cm', from: 'Indore', vibe: 'Smooth and shy', colour: 'Orchid', sound: 'Synthwave' },
    traits: [['Vanish', 'Leaves no footprints.'], ['Glow', 'Seams that shine in the dark.'], ['Best hider', 'Undefeated at hide and seek.']]
  },
  {
    id: 'rowan', name: 'Rowan', role: 'Wildcard', tagline: 'Nobody knows what he will do next', bg: '#fd7603',
    intro: 'Rowan has silver hair, an orange-and-black hooded coat and a plan that changes every ten minutes. Teams put him last on the list and first in the finals, because he is the one nobody can read.',
    clothing: C('A black-and-orange hooded coat with long tails over a black tee.', 'Black cargo trousers with orange straps and a belt with a metal buckle.', 'Black and orange sneakers with chunky soles.'),
    extras: ['Short silver hair', 'Hand on hip pose', 'Fingerless gloves'],
    info: { age: 24, height: '181 cm', from: 'Chandigarh', vibe: 'Wild and witty', colour: 'Tangerine', sound: 'Jazz-funk' },
    traits: [['Surprise', 'Always has a twist.'], ['Clutch', 'Best under pressure.'], ['Prankster', 'Never gets caught.']]
  },
  {
    id: 'azura', name: 'Azura', role: 'Voyager', tagline: 'The sea is a sidewalk', bg: '#0052da',
    intro: 'Azura packs light and leaves early. Her bright blue cropped jacket has seen more beaches than any passport. She always has a story about the last place she was and a ticket for the next one.',
    clothing: C('A bright blue cropped jacket with wide sleeves over a black top.', 'Black cargo trousers with blue straps and a slim belt.', 'Black and blue sneakers with white soles.'),
    extras: ['Dark hair with a blue streak', 'Hand-on-head pose', 'Fingerless gloves'],
    info: { age: 22, height: '168 cm', from: 'Puducherry', vibe: 'Free-spirited', colour: 'Ocean blue', sound: 'Beach reggae' },
    traits: [['Wanderlust', 'Never unpacked.'], ['Sea legs', 'Calm on any boat.'], ['Storyteller', 'Every trip is a movie.']]
  },
  {
    id: 'cloud', name: 'Cloud', role: 'Healer', tagline: 'Soft words, strong hands', bg: '#c5c6ce',
    light: true,
    intro: 'Cloud looks like a quiet morning: a white hooded jacket with gold details, white trousers and bright sneakers. He carries plasters, chargers and kind words for everyone. If you are down, he is already on his way.',
    clothing: C('A white hooded jacket with gold trim and black details over a black tee, with a thin chain.', 'White cargo trousers with yellow straps and a black belt with a gold buckle.', 'White and yellow sneakers with thick soles.'),
    extras: ['Short dark hair', 'Gold buckle belt', 'Fingerless gloves'],
    info: { age: 23, height: '178 cm', from: 'Dehradun', vibe: 'Gentle and dependable', colour: 'Cloud white', sound: 'Soft acoustic' },
    traits: [['First aid', 'Always has a plaster.'], ['Gentle', 'Never rushes you.'], ['Dependable', 'Shows up every time.']]
  },
  {
    id: 'soldier', name: 'Ranger', role: 'Scout', tagline: 'Quiet steps, steady eyes', bg: '#d4d8c8',
    light: true,
    intro: 'Ranger is the one who walks ahead and checks the path before anyone else. Camouflage kit, a heavy pack and night goggles on his helmet: he is calm in the dark and always knows where the group is. If he says it is safe, it is.',
    clothing: C('A camouflage combat jacket under an olive vest with a star badge, a patterned scarf and a helmet with night goggles.', 'Camouflage cargo trousers with a utility belt, leg straps and pouches.', 'Tan lace-up boots with thick black soles.'),
    extras: ['Night goggles', 'Dark sunglasses', 'Big backpack'],
    info: { age: 27, height: '182 cm', from: 'Jaipur', vibe: 'Calm and watchful', colour: 'Olive', sound: 'Slow drums' },
    traits: [['Sharp eyes', 'Notices everything first.'], ['Steady', 'Keeps calm when it is loud.'], ['Loyal', 'Never leaves anyone behind.']]
  },
  {
    id: 'goku', name: 'Goku', role: 'Fighter', tagline: 'Never stops getting stronger', bg: '#f08a1c',
    intro: 'Goku is a warrior with golden spiky hair and an orange training suit with a blue sash. He loves a good fight, a big meal and a challenge that makes him better. However tough the battle gets, he smiles, stands up again and keeps going.',
    clothing: C('An orange training top with a blue undershirt, blue wristbands and a round badge on the chest.', 'Orange loose trousers with a blue sash tied at the waist, torn and dusty from many fights.', 'Blue boots with red trim and a rope tied round the ankle.'),
    extras: ['Golden spiky hair', 'Blue wristbands', 'Blue sash belt'],
    info: { age: 29, height: '175 cm', from: 'Mount Paozu', vibe: 'Fearless and cheerful', colour: 'Orange', sound: 'Loud drums' },
    traits: [['Never gives up', 'Gets back up every single time.'], ['Fast learner', 'Copies a move after seeing it once.'], ['Big heart', 'Fights to protect his friends.']]
  },
  {
    id: 'vegeta', name: 'Vegeta', role: 'Prince', tagline: 'Pride first, always', bg: '#2b6fd6',
    intro: 'Vegeta is a proud warrior prince with golden spiky hair and a blue fighting suit under white and gold armour. He trains harder than anyone and hates to lose, even in a small game. Behind the stern face is a loyal fighter who always shows up when it matters.',
    clothing: C('White and gold battle armour with shoulder straps over a blue fitted top.', 'A blue stretch bodysuit with strong, muscled legs and a plain belt line.', 'White boots with gold toe caps and white gloves with a gold edge.'),
    extras: ['Golden spiky hair', 'White gloves', 'Gold armour plate'],
    info: { age: 32, height: '164 cm', from: 'Vegeta Plateau', vibe: 'Proud and fierce', colour: 'Royal blue', sound: 'Heavy bass' },
    traits: [['Pride', 'Never accepts second place.'], ['Discipline', 'Trains before sunrise.'], ['Loyal', 'Shows up when it counts.']]
  },
  {
    id: 'itachi', name: 'Itachi', role: 'Shadow', tagline: 'Silent, sharp, always one step ahead', bg: '#7a1f2b',
    intro: 'Itachi is a calm, quiet ninja in a long black robe covered in red clouds. He rarely says more than he needs to, and he is always thinking three moves ahead. Under the cold stare is someone who carries every burden alone so that others do not have to.',
    clothing: C('A long black robe with a high red-lined collar and red cloud patterns, over a mesh shirt.', 'The robe falls to the ankles, torn at the hem, over dark trousers with white wraps.', 'Dark blue open sandals with white leg wraps.'),
    extras: ['Forehead protector', 'Red cloud robe', 'Ring on his finger'],
    info: { age: 21, height: '178 cm', from: 'Hidden Leaf Village', vibe: 'Calm and mysterious', colour: 'Crimson', sound: 'Slow strings' },
    traits: [['Calm', 'Never raises his voice.'], ['Genius', 'Sees the plan before it starts.'], ['Selfless', 'Carries the weight alone.']]
  },
  {
    id: 'sasuke', name: 'Sasuke', role: 'Avenger', tagline: 'Walks alone, strikes first', bg: '#2e3566',
    intro: 'Sasuke is a sharp-eyed ninja in a dark torn outfit with a thick purple rope belt and a sword across his back. He trains in silence and answers with actions, not words. Cold at first, he is fiercely loyal to the few people he trusts.',
    clothing: C('A dark sleeveless top with a high collar, a bandaged right arm and fingerless gloves.', 'Dark loose trousers under a torn dark cloth with a thick purple rope belt.', 'Grey-green shin guards and open ninja sandals.'),
    extras: ['Sword on his back', 'Purple rope belt', 'Bandaged arm'],
    info: { age: 19, height: '182 cm', from: 'Hidden Leaf Village', vibe: 'Cold and focused', colour: 'Midnight blue', sound: 'Dark synth' },
    traits: [['Focused', 'Never loses sight of the goal.'], ['Fast', 'Moves before you blink.'], ['Loyal', 'Rarely says it, always shows it.']]
  },
  {
    id: 'naruto', name: 'Naruto', role: 'Dreamer', tagline: 'Believe it, then do it', bg: '#f2a31b',
    intro: 'Naruto is a loud, cheerful ninja with spiky blond hair, an orange jacket and a huge grin. He was alone for most of his childhood, so he never lets anyone else feel left out. He never gives up, and his stubborn kindness has changed more hearts than any fight.',
    clothing: C('An orange and navy zip-up jacket with a fluffy white collar and rolled sleeves.', 'Dark olive trousers with a leg pouch and white tape wraps on the thigh.', 'Dark ninja sandals with strap guards on the shins.'),
    extras: ['Spiky blond hair', 'Forehead protector', 'Whisker marks'],
    info: { age: 18, height: '166 cm', from: 'Hidden Leaf Village', vibe: 'Loud and loyal', colour: 'Orange', sound: 'Upbeat drums' },
    traits: [['Never quits', 'Stands up every time.'], ['Friendly', 'Makes friends with everyone.'], ['Determined', 'Keeps every promise he makes.']]
  },
  {
    id: 'mask', name: 'Mastermind', role: 'Planner', tagline: 'Every move planned in advance', bg: '#b3202a',
    intro: 'Mastermind wears a red jumpsuit, a deep hood and a painted moustache mask, and never shows a face. Calm, patient and always three steps ahead, he plans the whole job before anyone else wakes up. When the plan goes wrong, he already has another one ready.',
    clothing: C('A bright red hooded jumpsuit with a long diagonal zip and a chest pocket.', 'The same red jumpsuit, loose at the legs and gathered at the ankles.', 'Black laced combat boots with thick soles, and dark gloves.'),
    extras: ['Painted moustache mask', 'Deep red hood', 'Dark gloves'],
    info: { age: 30, height: '180 cm', from: 'Madrid', vibe: 'Calm and clever', colour: 'Bold red', sound: 'Slow tense beats' },
    traits: [['Planner', 'Has a backup for the backup.'], ['Patient', 'Waits for the perfect moment.'], ['Mysterious', 'Nobody has seen the face.']]
  },
  {
    id: 'raider', name: 'Raider', role: 'Enforcer', tagline: 'Ready before the signal', bg: '#7a161d',
    intro: 'Raider is the one on the team who stands at the front, in a red jumpsuit and a moustache mask with a toy-style rifle held ready. Tough and focused, he never breaks the plan and never leaves the crew behind.',
    clothing: C('A red hooded jumpsuit with a diagonal zip, worn over a tough, ready stance.', 'Loose red jumpsuit legs gathered at the ankles.', 'Black laced combat boots with thick soles, and dark gloves.'),
    extras: ['Painted moustache mask', 'Black rifle', 'Dark gloves'],
    info: { age: 28, height: '184 cm', from: 'Madrid', vibe: 'Tough and focused', colour: 'Deep red', sound: 'Heavy drums' },
    traits: [['Focused', 'Eyes on the plan.'], ['Strong', 'Takes the front line.'], ['Loyal', 'Never leaves the crew behind.']]
  },
  {
    id: 'frontman', name: 'Frontman', role: 'Host', tagline: 'Watches everything, says little', bg: '#1d1d22',
    intro: 'Frontman wears a long black coat, black gloves and a polished black mask under a deep hood. He runs the whole show from the shadows and nobody has ever seen his face. Every rule is his, every move is watched, and he never raises his voice.',
    clothing: C('A long black double-breasted trench coat with a cross strap over the chest and a deep black hood.', 'The coat falls to the ankles over dark trousers.', 'Black laced combat boots with thick soles, and black gloves.'),
    extras: ['Polished black mask', 'Cross strap', 'Black gloves'],
    info: { age: 35, height: '185 cm', from: 'Unknown', vibe: 'Cold and in control', colour: 'Black', sound: 'Slow low strings' },
    traits: [['Authority', 'Everyone follows his rules.'], ['Calm', 'Never raises his voice.'], ['Mystery', 'No one has seen his face.']]
  },
  {
    id: 'squareguard', name: 'Square', role: 'Guard', tagline: 'Follows the plan, never questions it', bg: '#d6336c',
    intro: 'Square is a guard in a bright pink hooded jumpsuit and a black mask marked with a white square. Quiet, strict and always on time, he keeps order wherever he stands and never leaves his post.',
    clothing: C('A pink hooded jumpsuit with a long centre zip and a black mask with a white square.', 'The same pink jumpsuit, gathered at the ankles with a dark belt line at the waist.', 'Black laced combat boots and black gloves.'),
    extras: ['White square mask', 'Pink hood', 'Black gloves'],
    info: { age: 28, height: '178 cm', from: 'Seoul', vibe: 'Strict and steady', colour: 'Hot pink', sound: 'Steady drums' },
    traits: [['Disciplined', 'Never leaves his post.'], ['Precise', 'Does exactly what is asked.'], ['Silent', 'Speaks only when needed.']]
  },
  {
    id: 'circleguard', name: 'Circle', role: 'Guard', tagline: 'Always where he is needed', bg: '#e0457b',
    intro: 'Circle is a guard in a pink hooded jumpsuit with a black mask marked with a white circle. Watchful and never in a hurry, he sees the whole room at once and keeps everything running smoothly.',
    clothing: C('A pink hooded jumpsuit with a long centre zip and a black mask with a white circle.', 'The same pink jumpsuit, gathered at the ankles with a dark belt line at the waist.', 'Black laced combat boots and black gloves.'),
    extras: ['White circle mask', 'Pink hood', 'Black gloves'],
    info: { age: 27, height: '176 cm', from: 'Busan', vibe: 'Watchful and calm', colour: 'Rose pink', sound: 'Soft pulse' },
    traits: [['Watchful', 'Sees everything in the room.'], ['Patient', 'Never in a hurry.'], ['Reliable', 'Always at his post.']]
  },
  {
    id: 'triangleguard', name: 'Triangle', role: 'Guard', tagline: 'Sharp eyes, sharper focus', bg: '#c2255c',
    intro: 'Triangle is a guard in a pink hooded jumpsuit with a black mask marked with a white triangle. Sharp and alert, he is the one the others look to when a decision has to be made fast.',
    clothing: C('A pink hooded jumpsuit with a long centre zip and a black mask with a white triangle.', 'The same pink jumpsuit, gathered at the ankles with a dark belt line at the waist.', 'Black laced combat boots and black gloves.'),
    extras: ['White triangle mask', 'Pink hood', 'Black gloves'],
    info: { age: 29, height: '180 cm', from: 'Incheon', vibe: 'Sharp and alert', colour: 'Deep pink', sound: 'Tight beats' },
    traits: [['Alert', 'Notices the smallest change.'], ['Decisive', 'Chooses fast.'], ['Leader', 'The others follow his lead.']]
  },
  {
    id: 'survivor', name: 'Survivor', role: 'Player', tagline: 'Quiet, careful, never gives up', bg: '#1f8a70',
    intro: 'Survivor wears a green tracksuit with white stripes and the number 456 on the chest. Calm and thoughtful, she watches before she moves and trusts the few people who earned it. When everything looks lost, she is the one still standing.',
    clothing: C('A green zip-up tracksuit jacket with white shoulder stripes, a white tee and the number 456 patch.', 'Green tracksuit trousers with a white stripe down each leg and cuffed ankles.', 'Black and white slip-on trainers.'),
    extras: ['Number 456 patch', 'White stripes', 'Short ponytail'],
    info: { age: 24, height: '165 cm', from: 'Seoul', vibe: 'Quiet and determined', colour: 'Teal green', sound: 'Gentle piano' },
    traits: [['Resilient', 'Never gives up.'], ['Careful', 'Thinks before she acts.'], ['Kind', 'Helps when it matters.']]
  },
  {
    id: 'rookie', name: 'Rookie', role: 'Player', tagline: 'Nervous at first, brave in the end', bg: '#2b9c7e',
    intro: 'Rookie wears a green tracksuit with white stripes and the number 101 on the chest. New to everything and a little nervous, he learns fast, asks good questions and surprises everyone with how brave he turns out to be.',
    clothing: C('A green zip-up tracksuit jacket with white shoulder stripes, a white tee and the number 101 patch.', 'Green tracksuit trousers with a white stripe down each leg and cuffed ankles.', 'Black and white slip-on trainers.'),
    extras: ['Number 101 patch', 'White stripes', 'Neat dark hair'],
    info: { age: 22, height: '172 cm', from: 'Daegu', vibe: 'Hopeful and curious', colour: 'Teal green', sound: 'Light acoustic' },
    traits: [['Quick learner', 'Gets it after one try.'], ['Brave', 'Steps up when it counts.'], ['Honest', 'Says what he thinks.']]
  },
  {
    id: 'shadowguard', name: 'Shadow', role: 'Guard', tagline: 'Unseen until it matters', bg: '#2a2a31',
    intro: 'Shadow is a guard in an all-black hooded jumpsuit and a black mask marked with a white square. He moves quietly at the edge of the room, sees everything and is only noticed when something goes wrong.',
    clothing: C('A black hooded jumpsuit with a long centre zip and a black mask with a white square.', 'The same black jumpsuit, loose at the legs and gathered at the ankles.', 'Black laced combat boots and black gloves.'),
    extras: ['White square mask', 'Black hood', 'Black gloves'],
    info: { age: 30, height: '181 cm', from: 'Seoul', vibe: 'Silent and watchful', colour: 'Midnight black', sound: 'Low drone' },
    traits: [['Silent', 'You never hear him coming.'], ['Observant', 'Misses nothing.'], ['Steady', 'Stays calm under pressure.']]
  },
  {
    id: 'gunguard', name: 'Marksman', role: 'Guard', tagline: 'Ready before the signal', bg: '#a61e4d',
    intro: 'Marksman is a guard in a pink hooded jumpsuit with a triangle mask, carrying a black rifle held ready across his chest. Focused and disciplined, he stands at the front and never breaks formation.',
    clothing: C('A pink hooded jumpsuit with a long centre zip and a black mask with a white triangle.', 'The same pink jumpsuit, gathered at the ankles.', 'Black laced combat boots and black gloves, with a black rifle held across the chest.'),
    extras: ['White triangle mask', 'Black rifle', 'Black gloves'],
    info: { age: 31, height: '183 cm', from: 'Seoul', vibe: 'Focused and ready', colour: 'Deep pink', sound: 'Heavy drums' },
    traits: [['Focused', 'Eyes on his post.'], ['Disciplined', 'Never breaks formation.'], ['Strong', 'Takes the front line.']]
  }
];

export const avatarUrl = (id: string, kind: '' | 'top' | 'pants' | 'boots' = '', origin = ''): string => `${origin}/avatars/${id}${kind ? '-' + kind : ''}.webp?v=2`;
/** what is saved as the profile picture: the full web address, so it also works in emails, notifications and the Android app */
export const avatarStoredUrl = (id: string): string => `${MAIN_SITE}/avatars/${id}.webp`;
export const avatarIdOf = (value?: string | null): string | null => {
  const m = /\/avatars\/([a-z]+)\.webp(?:\?|$)/.exec(value || '');
  return m && AVATARS.some((a) => a.id === m[1]) ? m[1] : null;
};

/** the character cut out of its picture (transparent background), for the turning 3D view */
export const avatarCutUrl = (id: string, origin = ''): string => `${origin}/avatars/${id}-cut.webp?v=1`;
/** the characters that have a real 3D model (public/avatars/<id>.glb); the others show their picture only */
export const AVATARS_3D: ReadonlySet<string> = new Set(['nova', 'blaze', 'roxy', 'zest', 'mira', 'ivory', 'vesper', 'kairo', 'ember', 'frost', 'sakura', 'nyx', 'zane', 'rogue', 'amara', 'kiran', 'orion', 'rowan', 'azura', 'cloud', 'soldier', 'goku', 'vegeta', 'itachi', 'sasuke', 'naruto', 'mask', 'raider', 'frontman', 'squareguard', 'circleguard', 'triangleguard', 'survivor', 'rookie', 'shadowguard', 'gunguard']);
export const avatarModelUrl = (id: string, origin = ''): string => `${origin}/avatars/${id}.glb?v=24`;

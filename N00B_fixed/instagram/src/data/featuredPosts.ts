// NOOB's own posts on the Home page: 3D models and pictures that ship WITH the app (nothing is uploaded, so they take no space on the server).
// People can like, comment, share, save and repost them, but nobody can publish one: the list is only this file, and only NOOB changes it.
// The id is fixed (f0f0f0f0-0000-4000-8000-0000000000NN, NN = 01..ff): the database accepts only that range for the counters (migration 20261128000001).
// To add one: add a line here (a model made in code: type 'model' + build key from Featured/ballBuddy.ts; a picture: type 'image' + a file in public/featured/).
export interface FeaturedPost {
  id: string;
  type: 'model' | 'image';
  title: string;
  caption: string;
  /** when it was published (newest first in the list of ids) */
  at: string;
  /** type 'model': the key of the model built in code (Featured/ballBuddy.ts, MODEL_BUILDERS) */
  build?: string;
  /** type 'model': or a model file made outside (a .glb from public/avatars/, the address carries ?v= so a changed file gets a new address) */
  src?: string;
  /** type 'image': the file (a path on this site) and what it shows */
  image?: string;
  alt?: string;
}

export const FEATURED_POSTS: ReadonlyArray<FeaturedPost> = [
  { id: 'f0f0f0f0-0000-4000-8000-000000000001', type: 'model', title: 'Noob Ball', caption: 'Meet the Noob Ball: black, round and always watching. Drag it to turn it round!', at: '2026-11-28T09:00:00.000Z', build: 'ball-eyes' },
  { id: 'f0f0f0f0-0000-4000-8000-000000000002', type: 'model', title: 'NOOB Bot', caption: 'Say hi to NOOB Bot, the little yellow robot with the NOOB badge. Drag it to turn it round!', at: '2026-11-28T11:00:00.000Z', src: '/avatars/noobbot.glb?v=1' },
  { id: 'f0f0f0f0-0000-4000-8000-000000000003', type: 'model', title: 'Night Guard', caption: 'The Night Guard keeps watch in all black with the NOOB mask. Drag to see the whole figure!', at: '2026-11-28T11:10:00.000Z', src: '/avatars/nightguard.glb?v=1' },
  { id: 'f0f0f0f0-0000-4000-8000-000000000004', type: 'model', title: 'Crimson Guard', caption: 'Crimson Guard, all in red with the NOOB mask. Turn it round with your finger!', at: '2026-11-28T11:20:00.000Z', src: '/avatars/crimsonguard.glb?v=1' },
  { id: 'f0f0f0f0-0000-4000-8000-000000000005', type: 'model', title: 'Sandstorm Guard', caption: 'Sandstorm in a dusty mustard suit with the NOOB mask. Spin it around and take a good look!', at: '2026-11-28T11:30:00.000Z', src: '/avatars/mustardguard.glb?v=1' },
  { id: 'f0f0f0f0-0000-4000-8000-000000000006', type: 'model', title: 'Warden Guard', caption: 'Warden is fully loaded: vest, holster and a suppressed rifle. Drag to inspect every detail!', at: '2026-11-28T11:40:00.000Z', src: '/avatars/tacticguard.glb?v=1' },
  { id: 'f0f0f0f0-0000-4000-8000-000000000007', type: 'model', title: 'Cobalt Guard', caption: 'Cobalt in deep blue with the NOOB mask and a tactical vest. Turn it with your finger!', at: '2026-11-28T11:50:00.000Z', src: '/avatars/blueguard.glb?v=1' },
  { id: 'f0f0f0f0-0000-4000-8000-000000000008', type: 'model', title: 'Arctic Guard', caption: 'Arctic, all in white with the NOOB mask. Drag to see it from every side!', at: '2026-11-28T12:00:00.000Z', src: '/avatars/whiteguard.glb?v=1' },
  { id: 'f0f0f0f0-0000-4000-8000-000000000009', type: 'model', title: 'Indigo Guard', caption: 'Indigo, a plain blue suit with the NOOB mask and nothing else. Turn it round!', at: '2026-11-28T12:10:00.000Z', src: '/avatars/jumpguard.glb?v=1' }
];

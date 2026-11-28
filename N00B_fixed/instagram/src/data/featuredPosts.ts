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
  /** type 'image': the file (a path on this site) and what it shows */
  image?: string;
  alt?: string;
}

export const FEATURED_POSTS: ReadonlyArray<FeaturedPost> = [
  { id: 'f0f0f0f0-0000-4000-8000-000000000001', type: 'model', title: 'Noob Ball', caption: 'Meet the Noob Ball: black, round and always watching. Drag it to turn it round!', at: '2026-11-28T09:00:00.000Z', build: 'ball-eyes' }
];

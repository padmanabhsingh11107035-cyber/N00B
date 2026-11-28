// The 3D models shown on the NOOB Models page (three-line menu). One entry = one curved box with the model turning inside it.
// To add a model: put the .glb file in public/models/ (or any public/ folder) and add a line here; nothing else changes.
// Nova is on the Avatars page, not here.
export interface NoobModel {
  id: string;
  name: string;
  /** a short line under the name */
  blurb: string;
  /** the .glb file (a path on this site) */
  src?: string;
  /** or a model made in code (Models/ballBuddy.ts, MODEL_BUILDERS): the key of the builder */
  build?: string;
}

export const NOOB_MODELS: ReadonlyArray<NoobModel> = [
  { id: 'ball', name: 'Noob Ball', blurb: 'A round black buddy with bulging eyes', build: 'ball-eyes' }
];

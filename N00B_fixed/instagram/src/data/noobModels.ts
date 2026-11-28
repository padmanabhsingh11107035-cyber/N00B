// The 3D models shown on the NOOB Models page (three-line menu). One entry = one curved box with the model turning inside it.
// To add a model: put the .glb file in public/models/ (or any public/ folder) and add a line here; nothing else changes.
// The first box shows Nova (the figure of the avatar page) so the page works from day one; the models made for this page come next.
export interface NoobModel {
  id: string;
  name: string;
  /** a short line under the name */
  blurb: string;
  /** the .glb file (a path on this site) */
  src: string;
}

export const NOOB_MODELS: ReadonlyArray<NoobModel> = [
  { id: 'nova', name: 'Nova', blurb: 'The NOOB hero: drag to turn it', src: '/avatars/nova.glb?v=29' }
];

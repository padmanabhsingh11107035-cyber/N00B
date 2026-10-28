export interface Pt { x: number; y: number }

// One face found in a picture. The spot between the eyes is the middle of everything: every lens is drawn around it in "eye distances" (1 = the distance between the two eyes),
// turned with the head, so one drawing fits a big face, a small face and a tilted face. The tracker hands these out with cx / cy / u as fractions of the picture (cx and u of its
// width, cy of its height); placeFace() turns them into pixels for the picture that is being drawn.
//
// All heights (y) are measured downwards from the eyes, so the forehead is negative. On an average face (Google's canonical face): hairline -1.2, forehead point of the finder -0.9,
// brows -0.4, nose tip 0.6, under the nose 0.75, upper lip 0.95, mouth 1.1, chin 1.9; half width of the face at the cheeks 1.2.
export interface FaceFrame {
  cx: number; cy: number;          // the spot between the eyes
  u: number;                       // the distance between the eyes
  roll: number;                    // head tilt in radians (clockwise on the screen is positive)
  yaw: number;                     // -1..1: the face turned towards the left (-) or the right (+) of the screen
  top: number; chin: number;       // the finder's forehead point (it is lower than the hairline) and the chin
  hair: number; skull: number;     // where the hair starts, and the top of the head: both worked out from the face's own length
  halfW: number;                   // half the width of the face at the cheeks
  temple: number;                  // half the width of the head at eye level
  brow: number;                    // the eyebrows (negative: above the eyes)
  eyeW: number;                    // the width of one eye
  nose: Pt;                        // the tip of the nose
  base: number;                    // y just under the nose
  lipTop: number;                  // y of the top edge of the upper lip
  lipUp: number; lipLow: number;   // y of the inner edge of the upper / lower lip (they move apart when the mouth opens)
  mouth: Pt; mouthW: number;       // the middle between the lips, and the width of the mouth
  mouthOpen: number; smile: number; browUp: number; blinkL: number; blinkR: number;   // 0..1 (blinkL = the eye on the left of the screen)
  seen: number;                    // 1 while the face is there; fades to 0 in a moment when it is lost
}

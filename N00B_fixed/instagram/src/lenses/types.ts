export interface Pt { x: number; y: number }

// One face found in a picture. The spot between the eyes is the middle of everything: every lens is drawn around it in "eye distances" (1 = the distance between the two eyes),
// turned with the head, so one drawing fits a big face, a small face and a tilted face. The tracker hands these out with cx / cy / u as fractions of the picture (cx and u of its
// width, cy of its height); scaleFace() turns them into pixels for the picture that is being drawn.
export interface FaceFrame {
  cx: number; cy: number;          // the spot between the eyes
  u: number;                       // the distance between the eyes
  roll: number;                    // head tilt in radians (clockwise on the screen is positive)
  yaw: number;                     // -1..1: the face turned towards the left (-) or the right (+) of the screen
  top: number; chin: number;       // forehead and chin, in eye distances from the eyes (top is negative: above them)
  halfW: number;                   // half the width of the face
  brow: number;                    // the eyebrows (negative: above the eyes)
  nose: Pt; mouth: Pt; mouthW: number;
  mouthOpen: number; smile: number; browUp: number; blinkL: number; blinkR: number;   // 0..1 (blinkL = the eye on the left of the screen)
  seen: number;                    // 1 while the face is there; fades to 0 in a moment when it is lost
}

// The size of the can (in the units of the 3D scene). A sleek 330 ml can: 2 wide and 4.87 high. The printed part runs from BODY_FROM to BODY_TO; the paint canvas is wrapped round it.
export const CAN_HEIGHT = 4.87;
export const BODY_FROM = 0.42;
export const BODY_TO = 4.62;
export const SHOULDER = 4.26;
export const PRINT_ASPECT = (Math.PI * 2) / (BODY_TO - BODY_FROM);   // width / height of the printed picture

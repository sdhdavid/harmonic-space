// Maps Tonnetz lattice coordinates (i = fifths, j = major thirds) into 3D.
// morph 0 = flat hexagonal plane, 1 = torus. The first half rolls the strip into a
// tube (j wraps every 3 major thirds), the second half bends the tube into a ring
// (i wraps every 12 fifths).

export const COLS = 12;
export const ROWS = 3;

const S = 2;
const ROW_H = (S * Math.sqrt(3)) / 2;
const L = COLS * S;
const W = ROWS * ROW_H;
const TAU = Math.PI * 2;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);

export function morphPhases(m) {
  return { roll: smooth(clamp01(m * 2)), bend: smooth(clamp01(m * 2 - 1)) };
}

export function latticeToWorld(i, j, m, out) {
  const { roll, bend } = morphPhases(m);

  // Flat coordinates. The hex shear is removed while rolling so the seam lines up.
  const c = (i + (j - ROWS / 2) * 0.5 * (1 - roll) - COLS / 2) * S;
  const v = (j - ROWS / 2) * ROW_H;

  let y = v;
  let h = 0;
  if (roll > 1e-4) {
    const rho = W / (TAU * roll);
    const th = v / rho;
    y = rho * Math.sin(th);
    h = rho * (1 - Math.cos(th)) - (roll * W) / TAU;
  }

  let x = c;
  let z = y;
  if (bend > 1e-4) {
    const P = L / (TAU * bend);
    const phi = c / P;
    x = (P - y) * Math.sin(phi);
    z = P - (P - y) * Math.cos(phi) - (bend * L) / TAU;
  }

  return out.set(x, h, z);
}

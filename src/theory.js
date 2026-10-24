export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export const mod12 = (n) => ((n % 12) + 12) % 12;

// Tonnetz coordinates: one step in i is a perfect fifth, one step in j a major third.
export const pitchAt = (i, j) => mod12(7 * i + 4 * j);

export const triadNotes = ({ root, quality }) =>
  quality === 'major'
    ? [root, mod12(root + 4), mod12(root + 7)]
    : [root, mod12(root + 3), mod12(root + 7)];

export const triadName = ({ root, quality }) => NOTE_NAMES[root] + (quality === 'minor' ? 'm' : '');
export const triadKey = ({ root, quality }) => `${root}${quality}`;

// Neo-Riemannian moves: each one keeps two notes and moves the third by a step.
export const TRANSFORMS = {
  P: (t) => ({ root: t.root, quality: t.quality === 'major' ? 'minor' : 'major' }),
  L: (t) =>
    t.quality === 'major'
      ? { root: mod12(t.root + 4), quality: 'minor' }
      : { root: mod12(t.root + 8), quality: 'major' },
  R: (t) =>
    t.quality === 'major'
      ? { root: mod12(t.root + 9), quality: 'minor' }
      : { root: mod12(t.root + 3), quality: 'major' },
};

export const TRANSFORM_INFO = {
  P: 'Parallel — flip the third (C ↔ Cm)',
  L: 'Leading-tone — root slides down a semitone (C → Em)',
  R: 'Relative — fifth rises a whole step (C → Am)',
};

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parseChord(s) {
  const m = /^([A-G])([#b♯♭]?)(m?)$/.exec(s);
  if (!m) throw new Error(`Bad chord: ${s}`);
  let root = LETTERS[m[1]];
  if (m[2] === '#' || m[2] === '♯') root++;
  if (m[2] === 'b' || m[2] === '♭') root--;
  return { root: mod12(root), quality: m[3] ? 'minor' : 'major' };
}

export const PROGRESSIONS = [
  { name: 'Pop: I–V–vi–IV', chords: 'C G Am F', note: 'The four chords of a thousand songs — a tight loop around one neighbourhood.' },
  { name: 'Jazz: ii–V–I', chords: 'Dm G C', note: 'Two hops along the fifths axis, home to the tonic.' },
  { name: 'Pachelbel canon', chords: 'C G Am Em F C F G', note: 'Zig-zags while drifting along the fifths.' },
  { name: 'Andalusian cadence', chords: 'Am G F E', note: 'Descending bass, flamenco colour.' },
  { name: 'Creep: I–III–IV–iv', chords: 'G B C Cm', note: 'A leap up the major-third axis, then a P flip at the end.' },
  { name: 'Coltrane changes', chords: 'C Eb Ab B E G C', note: 'Tonics a major third apart — the trail loops around the short way of the torus.' },
  { name: 'Hexatonic cycle (P·L)', chords: 'C Cm Ab Abm E Em C', note: 'Alternating P and L: six triads sharing one hexatonic scale.' },
  { name: 'Octatonic cycle (P·R)', chords: 'C Cm Eb Ebm F# F#m A Am C', note: 'Alternating P and R: eight triads, a ring of minor thirds.' },
  { name: 'Falling thirds (R·L chain)', chords: 'C Am F Dm Bb Gm Eb Cm', note: 'Each step keeps two notes — a straight diagonal road through the lattice.' },
];

export const SCALES = {
  none: { name: 'Off', intervals: null },
  major: { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { name: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  pentatonic: { name: 'Major pentatonic', intervals: [0, 2, 4, 7, 9] },
  wholeTone: { name: 'Whole tone', intervals: [0, 2, 4, 6, 8, 10] },
  hexatonic: { name: 'Hexatonic (augmented)', intervals: [0, 3, 4, 7, 8, 11] },
  octatonic: { name: 'Octatonic', intervals: [0, 1, 3, 4, 6, 7, 9, 10] },
};

import * as Tone from 'tone';
import { mod12 } from './theory.js';

let voices = null;
let muted = false;

async function ensure() {
  if (voices) return voices;
  await Tone.start();
  const reverb = new Tone.Reverb({ decay: 5, wet: 0.35 }).toDestination();
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fattriangle', count: 3, spread: 18 },
    envelope: { attack: 0.03, decay: 0.4, sustain: 0.5, release: 1.8 },
  }).connect(reverb);
  pad.volume.value = -16;
  const bass = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.5, sustain: 0.6, release: 1.5 },
  }).connect(reverb);
  bass.volume.value = -10;
  const pluck = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.6, sustain: 0.1, release: 1.2 },
  }).connect(reverb);
  pluck.volume.value = -8;
  voices = { pad, bass, pluck };
  return voices;
}

const hz = (midi) => Tone.Frequency(midi, 'midi').toFrequency();

export async function playMidi(midi, dur = 0.8) {
  if (muted) return;
  const { pluck } = await ensure();
  pluck.triggerAttackRelease(hz(midi), dur);
}

// Close voicing between A3 and G♯4 keeps consecutive chords near each other.
export async function playTriad(pcs, root, dur = 1.2) {
  if (muted) return;
  const { pad, bass } = await ensure();
  pad.triggerAttackRelease(pcs.map((pc) => hz(57 + mod12(pc - 9))), dur);
  bass.triggerAttackRelease(hz(36 + root), dur);
}

export function setMuted(v) {
  muted = v;
}

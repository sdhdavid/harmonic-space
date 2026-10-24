# Harmonic Space

An experimental playground for exploring music theory in 3D.

The first world is a **Tonnetz**, a map of harmony:

- every dot is a note; stepping along the lattice moves by a **perfect fifth**, a **major third** or a **minor third**
- every triangle is a **triad**: ▲ major, ▼ minor
- neighbouring triangles share two notes, so the three moves between them (**P**, **L**, **R**) are the smoothest chord changes possible
- roll the plane up and it closes into a **torus**: twelve fifths around the long way, three major thirds around the short way

Click notes and chords to hear them, walk with `P` / `L` / `R`, light up a scale, or play a progression and watch its path through harmonic space.

Built with [Three.js](https://threejs.org) and [Tone.js](https://tonejs.github.io), bundled with Vite.

## Run locally

```sh
npm install
npm run dev
```

## Deploy

Pushing to `main` builds the site and publishes it to GitHub Pages (Settings → Pages → Source: **GitHub Actions**).

## Ideas for next worlds

- Chew's spiral array: keys and chords as regions on a helix of fifths
- Interval lab: frequency ratios as geometry, from consonance to dissonance
- Chord space: voice-leading between chords as motion through a 3D orbifold
- Play from a MIDI keyboard and watch your harmony light up the lattice

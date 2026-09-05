#!/usr/bin/env python3
"""Generate assets/sfx/*.wav: the game's chiptune sound effects.

Square and triangle waves plus a little noise, synthesised with numpy and
written with the stdlib `wave` module: 22 050 Hz, mono, 16-bit. Every piece
is an original composition in the arcade idiom (nothing is sampled or
transcribed). The output is byte-for-byte deterministic, so
tests/gen-sounds.test.mjs regenerates the files into a temp dir and fails
when the committed ones drift:

    python3 tools/gen_sounds.py              # writes assets/sfx/
    python3 tools/gen_sounds.py --out DIR    # writes elsewhere (the test does this)

One-shots are normalised to -3 dBFS and faded over 2 ms at both ends so
they never click. Loops (the sirens, fright and eyes) are seamless: they
hold an integer number of cycles, and start and end on the same zero of
the wave, so SoundEffect can repeat them without a seam. The noise
generator is a fixed-seed LCG rather than numpy's RNG, so the bytes do not
depend on the numpy version.
"""

import argparse
import wave
from pathlib import Path

import numpy as np

RATE = 22050
PEAK = 10 ** (-3 / 20)      # -3 dBFS
QUIET = 10 ** (-9 / 20)     # the eyes loop sits under the rest
FADE_SECONDS = 0.002        # click guard at both ends of a one-shot

# The seven background layers; everything else is a one-shot.
LOOPS = ("siren-1", "siren-2", "siren-3", "siren-4", "siren-5", "fright", "eyes")


# --- building blocks ---------------------------------------------------------

def samples(seconds):
    return int(round(seconds * RATE))


def phase_of(freq):
    """Phase in cycles at each sample for an instantaneous-frequency array; starts at 0."""
    return np.concatenate(([0.0], np.cumsum(freq[:-1]))) / RATE


def square(phase, duty=0.5):
    return np.where(phase % 1.0 < duty, 1.0, -1.0)


def triangle(phase):
    """A triangle that is 0 and rising at phase 0, so loops can start and end on it."""
    return 1.0 - 4.0 * np.abs(((phase + 0.25) % 1.0) - 0.5)


def noise(n, seed):
    """Uniform noise in [-1, 1) from a 32-bit LCG (Numerical Recipes constants)."""
    out = np.empty(n)
    x = seed & 0xFFFFFFFF
    for i in range(n):
        x = (1664525 * x + 1013904223) & 0xFFFFFFFF
        out[i] = x / 2147483648.0 - 1.0
    return out


def sweep(f0, f1, seconds):
    """Instantaneous frequency gliding linearly from f0 to f1."""
    return np.linspace(f0, f1, samples(seconds), endpoint=False)


def vibrato(freq, rate, depth):
    """Modulate a frequency array by `depth` (a fraction) at `rate` Hz."""
    t = np.arange(len(freq)) / RATE
    return freq * (1.0 + depth * np.sin(2 * np.pi * rate * t))


def adsr(n, attack=0.002, decay=0.0, sustain=1.0, release=0.02):
    """A linear ADSR envelope over n samples whose first and last samples are 0."""
    a, d, r = samples(attack), samples(decay), samples(release)
    a = min(a, n)
    r = min(r, n - a)
    d = min(d, n - a - r)
    env = np.full(n, sustain)
    env[:a] = np.linspace(0.0, 1.0, a, endpoint=False)
    env[a:a + d] = np.linspace(1.0, sustain, d, endpoint=False)
    if r > 0:
        env[n - r:] = np.linspace(sustain, 0.0, r)
    return env


def note(freq, seconds, wave_fn=square, env=None, **wave_args):
    """One steady note (or a frequency array) with an envelope that starts and ends at 0."""
    n = samples(seconds) if np.isscalar(freq) else len(freq)
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, dtype=float)
    env = adsr(n) if env is None else env
    return wave_fn(phase_of(f), **wave_args) * env


def midi(n):
    return 440.0 * 2.0 ** ((n - 69) / 12.0)


def fade(x, seconds=FADE_SECONDS):
    n = min(samples(seconds), len(x) // 2)
    ramp = np.linspace(0.0, 1.0, n, endpoint=False)
    y = x.copy()
    y[:n] *= ramp
    y[len(y) - n:] *= ramp[::-1]
    return y


def normalise(x, peak=PEAK):
    top = np.max(np.abs(x))
    return x * (peak / top) if top > 0 else x


def seamless(freq, wave_fn, cycles):
    """A loop over the frequency curve holding exactly `cycles` cycles: the last sample sits on the
    same zero as the first, so the file repeats without a seam."""
    phase = phase_of(freq)
    phase = phase * (cycles / phase[-1])
    return wave_fn(phase)


# --- the pieces --------------------------------------------------------------

def start():
    """The opening jingle: 3.5 s of two-voice tune at 120 bpm and a held major chord."""
    eighth = 0.25
    lead = [72, 74, 76, 79, 76, 79, 84, 79, 81, 79, 77, 76, 74, 79]     # C5 D5 E5 G5 E5 G5 C6 G5 A5 G5 F5 E5 D5 G5
    bass = [48, 48, 55, 55, 48, 48, 55, 55, 53, 53, 55, 55, 55, 55]     # C3 . G3 . C3 . G3 . F3 . G3 . G3 .
    voice_lead = np.concatenate([note(midi(m), eighth, square, duty=0.5) for m in lead])
    voice_bass = np.concatenate([note(midi(m), eighth, triangle, env=adsr(samples(eighth), release=0.04)) for m in bass])
    hold = 0.5
    env = adsr(samples(hold), attack=0.005, release=0.25)
    chord = sum(note(midi(m), hold, square, env=env, duty=0.5) for m in (72, 76, 79)) / 3.0
    chord_bass = note(midi(48), hold, triangle, env=env)
    return np.concatenate([0.6 * voice_lead + 0.5 * voice_bass, 0.7 * chord + 0.5 * chord_bass])


def waka(f0, f1):
    """A chomp: a 70 ms square glide with a quick decay."""
    freq = sweep(f0, f1, 0.07)
    env = adsr(len(freq), attack=0.002, decay=0.05, sustain=0.35, release=0.015)
    return note(freq, None, square, env=env, duty=0.25)


def siren(base, span=120.0, seconds=0.5):
    """A triangle sweeping up `span` Hz and back over one loop; base + span/2 times the length is a
    whole number of cycles for every stage in the table."""
    n = samples(seconds)
    t = np.arange(n) / n
    freq = base + span * (1.0 - np.abs(2.0 * t - 1.0))
    cycles = int(round(seconds * (base + span / 2.0)))
    return seamless(freq, triangle, cycles)


def fright():
    """Eight quick square steps falling 900 -> 500 Hz, each note enveloped so the loop has no seam."""
    n = samples(0.30)
    edges = [int(round(i * n / 8)) for i in range(9)]
    steps = np.linspace(900.0, 500.0, 8)
    parts = []
    for i, f in enumerate(steps):
        length = edges[i + 1] - edges[i]
        env = adsr(length, attack=0.002, release=0.006)
        parts.append(square(phase_of(np.full(length, f)), duty=0.125) * env)
    return np.concatenate(parts)


def eyes():
    """Two quiet high triangle blips, 1400 then 1600 Hz, over a 0.25 s loop."""
    half = samples(0.25) // 2
    n = samples(0.25)
    parts = []
    for i, f in enumerate((1400.0, 1600.0)):
        length = half if i == 0 else n - half
        sounding = samples(0.06)
        env = np.zeros(length)
        env[:sounding] = adsr(sounding, attack=0.003, release=0.03)
        parts.append(triangle(phase_of(np.full(length, f))) * env)
    return np.concatenate(parts)


def ghost_eaten():
    """A rising square with vibrato, then a short high chirp."""
    rise = vibrato(sweep(400.0, 1200.0, 0.30), rate=30.0, depth=0.04)
    a = note(rise, None, square, env=adsr(len(rise), attack=0.002, release=0.02), duty=0.5)
    chirp = sweep(1600.0, 1900.0, 0.15)
    b = note(chirp, None, square, env=adsr(len(chirp), attack=0.002, decay=0.1, sustain=0.2, release=0.03), duty=0.25)
    return np.concatenate([a, b])


def death():
    """Six descending warbling dips from 700 to 150 Hz, then two noise bursts."""
    parts = []
    tops = np.linspace(700.0, 250.0, 6)
    for top in tops:
        dip = vibrato(sweep(top, top * 0.6, 0.2), rate=24.0, depth=0.06)
        parts.append(note(dip, None, square, env=adsr(len(dip), attack=0.003, release=0.03), duty=0.5))
    for seed in (7, 11):
        burst = noise(samples(0.2), seed)
        env = adsr(len(burst), attack=0.005, decay=0.15, sustain=0.15, release=0.04)
        parts.append(0.8 * burst * env)
    return np.concatenate(parts)


def extra_life():
    """C-E-G-C up the octave, twice, in quick square notes."""
    tune = [72, 76, 79, 84] * 2
    return np.concatenate([note(midi(m), 0.075, square, env=adsr(samples(0.075), release=0.01), duty=0.5) for m in tune])


def level_clear():
    """A triangle fanfare: three rising notes and a held fifth."""
    parts = [note(midi(m), 0.2, triangle, env=adsr(samples(0.2), release=0.03)) for m in (72, 76, 79)]
    env = adsr(samples(0.6), attack=0.005, release=0.3)
    held = (note(midi(84), 0.6, triangle, env=env) + note(midi(91), 0.6, triangle, env=env)) / 2.0
    parts.append(held)
    return np.concatenate(parts)


def fruit():
    """A ta-da-ding: three square notes rising E5, B5, E6."""
    a = note(midi(76), 0.08, square, env=adsr(samples(0.08), release=0.01), duty=0.5)
    b = note(midi(83), 0.08, square, env=adsr(samples(0.08), release=0.01), duty=0.5)
    c = note(midi(88), 0.14, square, env=adsr(samples(0.14), decay=0.06, sustain=0.5, release=0.04), duty=0.5)
    return np.concatenate([a, b, c])


PIECES = {
    "start": start,
    "waka-a": lambda: waka(420.0, 260.0),
    "waka-b": lambda: waka(260.0, 420.0),
    "siren-1": lambda: siren(300.0),
    "siren-2": lambda: siren(340.0),
    "siren-3": lambda: siren(380.0),
    "siren-4": lambda: siren(430.0),
    "siren-5": lambda: siren(490.0, seconds=0.42),
    "fright": fright,
    "eyes": eyes,
    "ghost-eaten": ghost_eaten,
    "death": death,
    "extra-life": extra_life,
    "level-clear": level_clear,
    "fruit": fruit,
}


# --- output ------------------------------------------------------------------

def render(name):
    x = PIECES[name]()
    if name in LOOPS:
        return normalise(x, QUIET if name == "eyes" else PEAK)
    return fade(normalise(x))


def to_pcm(x):
    return np.clip(np.round(x * 32767.0), -32768, 32767).astype("<i2").tobytes()


def write_wav(path, x):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(to_pcm(x))


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Generate the game's sound effects.")
    parser.add_argument("--out", type=Path, default=root / "assets" / "sfx", help="directory to write into")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for name in PIECES:
        x = render(name)
        write_wav(args.out / f"{name}.wav", x)
        print(f"wrote {args.out / (name + '.wav')} ({len(x) / RATE:.3f} s{', loop' if name in LOOPS else ''})")


if __name__ == "__main__":
    main()

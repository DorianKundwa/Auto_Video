# Local royalty-free audio library

Stage 7 picks music and SFX from this folder by tag. Drop in tracks you have the
right to use (CC0 or licensed) and describe them in `library.json`:

```json
{
  "tracks": [
    {
      "file": "warm-loop.mp3",
      "title": "Warm Loop",
      "mood": ["warm", "curious"],
      "bpm": 92,
      "durationSeconds": 60,
      "license": "CC0",
      "source": "https://example.org/cc0-track"
    }
  ],
  "sfx": [
    { "file": "pop.wav", "cue": "pop", "license": "CC0" }
  ]
}
```

Audio files themselves are not committed (see `.gitignore` for the folder rules).
Until tracks exist, the readiness check shows a warning — it is not required for
Stages 1-6.

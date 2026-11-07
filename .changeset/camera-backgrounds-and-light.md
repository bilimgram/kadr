---
"@kadr/compositor": minor
"@kadr/ui": minor
"@kadr/desktop": minor
---

Camera backgrounds and better light correction. The bubble can blur, remove or replace the room
behind you (colour gradients or your own image), using a small person-segmentation model that runs
on your computer (ADR 0009). Light correction now meters your face where the person mask finds it,
lights you more than the room, balances colour casts and restores contrast. Camera-only recordings
get the same effects.

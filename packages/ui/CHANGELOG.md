# @kadr/ui

## 0.3.0

### Minor Changes

- Camera backgrounds and better light correction. The bubble can blur, remove or replace the room
  behind you (colour gradients or your own image), using a small person-segmentation model that runs
  on your computer (ADR 0009). Light correction now meters your face where the person mask finds it,
  lights you more than the room, balances colour casts and restores contrast. Camera-only recordings
  get the same effects.

### Patch Changes

- Updated dependencies
  - @kadr/compositor@0.1.0
  - @kadr/project-format@0.1.0

## 0.2.0

### Minor Changes

- Add `IconButton`, an icon-only button whose label doubles as its tooltip (hover and keyboard focus,
  dismissible with Escape), and tooltip placements (`top`, `top-end`, `bottom`, `right`) for
  `data-tooltip`.

## 0.1.0

### Minor Changes

- Add `ActivityIndicator` (an iOS-style spinner) and `ErrorBoundary` (a recoverable error message
  instead of a blank window).

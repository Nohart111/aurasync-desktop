# AuraSync Desktop — Architectural & UX Optimization Standards

1. **Zero-Silence Audio Playback**:
   - Manage all audio playback through the singleton `AudioEngine` (`src/core/audio/AudioEngine.ts`) and `useAudioPlayer` (`src/hooks/useAudioPlayer.ts`).
   - Never set `crossOrigin = "anonymous"` or route external streams through `AudioContext.createMediaElementSource()` unless CORS headers are verified, as browsers will mute the output.
   - Avoid play/pause race conditions by handling `currentTrack` URL changes and `isPlaying` toggles in a single synchronized effect.

2. **60fps Smoothness & Zero React Re-renders**:
   - High-frequency audio progress (60Hz RAF loop) and scrub hover positions MUST use Framer Motion `MotionValue` (`useMotionValue`, `useSpring`, `useTransform`) instead of React `useState`.
   - Use GPU-accelerated transforms (`scaleX`, `translate3d`, `.gpu-accelerated`) and apply `.tabular-time` (`font-variant-numeric: tabular-nums`) to all `mm:ss` counters.

3. **Algorithmic Complexity (O(1) & O(log n))**:
   - Use `DoublyLinkedQueue` for all O(1) queue operations (`enqueue`, `insertAfterCurrent`, `removeById`, `jumpTo`, `next`, `prev`).
   - Clicking a track card to play immediately must call `playTrackNow(track)` (enqueue if needed + `jumpTo(track.id)` + `setPlaying(true)`).
   - Use `PlaylistSearchEngine` (Prefix Trie + Binary Search) for instant client-side filtering.

4. **Desktop-First UX**:
   - Support keyboard shortcuts (`Space`, `ArrowLeft`/`ArrowRight`, `M`, `Q`), buffering indicators, hover time previews on the seekbar, and smooth spring animations (`stiffness: 380, damping: 34`).
   - Ensure strict TypeScript compliance and verify builds using `npm.cmd run build`.
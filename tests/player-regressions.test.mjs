import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);

function load(relativePath, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(relativePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(code, {
    module: compiledModule, exports: compiledModule.exports,
    require: (name) => overrides[name] || require(name),
    console, AbortController, setTimeout, clearTimeout,
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
  }, { filename: relativePath });
  return compiledModule.exports;
}

// Disable browser persistence; exercise the real Zustand store actions.
const { usePlayerStore: store } = load('src/store/usePlayerStore.ts', {
  'zustand/middleware': { persist: (initializer) => initializer },
});
const track = (id) => ({ id, title: id, streamUrl: `https://example.test/${id}.mp3` });
const a = track('a'), b = track('b'), c = track('c');
function reset(overrides = {}) {
  store.setState({ queue: [a, b], queueItems: [a, b], internalQueue: [a, b],
    library: [a, b, c], currentTrack: a, currentQueueId: a.id,
    repeatMode: 'off', isShuffle: false, isPlaying: true,
    progress: 20, currentTime: 20, playNonce: 10, ...overrides });
}

test('single-song queue stays isolated from the library for next and previous', () => {
  reset({ queue: [a], repeatMode: 'all' });
  store.getState().advanceNext('ended');
  assert.equal(store.getState().currentTrack.id, 'a');
  assert.deepEqual(Array.from(store.getState().queue, t => t.id), ['a']);
  store.getState().playPrevious();
  assert.equal(store.getState().currentTrack.id, 'a');
});

test('repeat off finishes the last seconds, then stops without restarting', () => {
  for (const queue of [[a], [b, a]]) {
    reset({ queue });
    store.getState().advanceNext('crossfade');
    assert.equal(store.getState().isPlaying, true);
    assert.equal(store.getState().playNonce, 10);
    store.getState().advanceNext('ended');
    assert.equal(store.getState().isPlaying, false);
    assert.equal(store.getState().playNonce, 10);
    assert.equal(store.getState().currentTrack.id, 'a');
    assert.equal(store.getState().nextTrackPreview, null);
  }
});

test('repeat all preserves queue order when shuffle is off', () => {
  reset({ queue: [a, b, c], currentTrack: c, currentQueueId: c.id, repeatMode: 'all' });
  store.getState().advanceNext('ended');
  assert.equal(store.getState().currentTrack.id, 'a');
  assert.deepEqual(Array.from(store.getState().queue, t => t.id), ['a', 'b', 'c']);
  assert.equal(store.getState().playNonce, 11);
});

test('repeat one plays the full song and manual next still skips', () => {
  reset({ repeatMode: 'one' });
  store.getState().advanceNext('crossfade');
  assert.equal(store.getState().playNonce, 10);
  store.getState().advanceNext('ended');
  assert.equal(store.getState().currentTrack.id, 'a');
  assert.equal(store.getState().playNonce, 11);
  store.getState().advanceNext('manual');
  assert.equal(store.getState().currentTrack.id, 'b');
});

test('repeat off advances normally before the last track', () => {
  reset();
  store.getState().advanceNext('crossfade');
  assert.equal(store.getState().currentTrack.id, 'b');
  assert.equal(store.getState().isPlaying, true);
});

test('empty queue falls back to the library and previews are excluded', () => {
  reset({ queue: [], library: [a, { ...c, isPreview: true }, b] });
  store.getState().advanceNext('ended');
  assert.equal(store.getState().currentTrack.id, 'b');
});

test('late cancelled search cannot replace the newer result', async () => {
  let state, effect, cleanup;
  const requests = [];
  const react = {
    useState: (initial) => [state ?? initial, (value) => { state = typeof value === 'function' ? value(state) : value; }],
    useEffect: (callback) => { effect = callback; },
    useCallback: (callback) => callback,
  };
  const { useYoutubeSearch } = load('src/hooks/useYoutubeSearch.ts', {
    react,
    '@/core/services/youtubeMusic': { youtubeMusic: {
      search: (query) => new Promise(resolve => requests.push({ query, resolve })),
    } },
  });
  const tick = () => new Promise(resolve => setTimeout(resolve, 5));
  useYoutubeSearch('old', { debounceMs: 0 }); cleanup = effect();
  await tick(); cleanup();
  useYoutubeSearch('new', { debounceMs: 0 }); cleanup = effect();
  await tick();
  requests[1].resolve([{ id: 'new-result' }]); await tick();
  requests[0].resolve([{ id: 'old-result' }]); await tick();
  assert.equal(state.query, 'new');
  assert.equal(state.results[0].id, 'new-result');
  assert.equal(state.isLoading, false);
  cleanup();
});


test('play next moves an existing item without restarting or duplicating the current track', () => {
  reset({ queue: [a, b, c] });
  store.getState().playNextInQueue(c);
  assert.deepEqual(Array.from(store.getState().queue, t => t.id), ['a', 'c', 'b']);
  assert.equal(store.getState().nextTrackPreview.id, 'c');
  assert.equal(store.getState().playNonce, 10);
  store.getState().playNextInQueue(a);
  assert.deepEqual(Array.from(store.getState().queue, t => t.id), ['a', 'c', 'b']);
});

test('removing current advances to its successor; removing the last item stops without library fallback', () => {
  reset({ queue: [a, b, c], currentTrack: b });
  store.getState().removeFromQueue('b');
  assert.equal(store.getState().currentTrack.id, 'c');
  reset({ queue: [a] });
  store.getState().removeFromQueue('a');
  assert.equal(store.getState().currentTrack, null);
  assert.equal(store.getState().isPlaying, false);
});

test('retry restarts the same selection and preserves its queue', () => {
  reset({ playbackStatus: 'error', isPlaying: false });
  store.getState().retryPlayback();
  assert.equal(store.getState().currentTrack.id, 'a');
  assert.equal(store.getState().playNonce, 11);
  assert.equal(store.getState().progress, 0);
  assert.equal(store.getState().isPlaying, true);
  assert.deepEqual(Array.from(store.getState().queue, t => t.id), ['a', 'b']);
});

test('engine reports blocked playback and retry reloads a failed source', async () => {
  const { AudioEngine } = load('src/core/audio/AudioEngine.ts');
  const engine = AudioEngine.getInstance();
  const statuses = [];
  let reloads = 0, blocked = true;
  engine.primaryAudio = {
    src: '', volume: 0.8, paused: true, ended: false, error: null,
    pause() {}, load() { reloads++; }, removeAttribute() {},
    async play() { if (blocked) throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' }); },
  };
  engine.onPlaybackStatus(status => statuses.push(status));
  await engine.loadAndPlay('/a.mp3', 1);
  assert.equal(statuses.at(-1), 'error');
  blocked = false;
  engine.primaryAudio.error = { code: 2 };
  await engine.loadAndPlay('/a.mp3', 2);
  assert.equal(reloads, 2);
  assert.equal(statuses.at(-1), 'loading');
});

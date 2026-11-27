// jsdom runs a frame within ~16ms, so a test can pass only because a frame
// landed before its next step, then flake when CI is slow. Slow frames make that
// race fail locally. A race needs the frame to land inside the test's next step,
// so longer is not stricter: 50ms caught more of the known races than 30, 40, 60,
// 80 or 100ms (#1178).
const SLOW_FRAME_MS = 50;

// The real timers, read before any test fakes them: frames keep running while a
// test fakes only `setTimeout`, as jsdom's own frames do.
const { setTimeout: realSetTimeout, clearTimeout: realClearTimeout } =
  globalThis;

// A frame still pending when the test file ends would otherwise fire after
// jsdom's teardown and fail the run with "window is not defined"; it is skipped.
globalThis.requestAnimationFrame = (callback) =>
  Number(
    realSetTimeout(() => {
      if (typeof window === 'undefined') return;
      callback(performance.now());
    }, SLOW_FRAME_MS),
  );
globalThis.cancelAnimationFrame = (frame) => realClearTimeout(frame);

/**
 * Order of render passes in one frame (pure). The world is drawn first and the
 * hand-held view model on top of it. A capture (photograph, test frame) must
 * copy a frame that holds the world only, so the world is redrawn before the
 * copy whenever the view model has been drawn over it.
 */
export type FramePass = 'world' | 'viewmodel' | 'resize' | 'copy' | 'restore';

export interface CapturePlan {
  /** True when the capture asks for its own resolution (the scene is re-rendered at that size). */
  sized: boolean;
  /** Debug only: copy the frame as displayed, view model included. Ignored for sized captures. */
  raw: boolean;
}

export function planFrame(viewModel: boolean, capture: CapturePlan | null): FramePass[] {
  const passes: FramePass[] = ['world'];
  if (viewModel) passes.push('viewmodel');
  if (!capture) return passes;
  if (capture.sized) {
    passes.push('resize', 'world', 'copy', 'restore', 'world');
    if (viewModel) passes.push('viewmodel');
    return passes;
  }
  const clean = viewModel && !capture.raw;
  if (clean) passes.push('world');
  passes.push('copy');
  if (clean) passes.push('viewmodel');
  return passes;
}

/** True if the copy in this plan is taken from a frame with the view model on it. */
export function copyIncludesViewModel(passes: readonly FramePass[]): boolean {
  const at = passes.indexOf('copy');
  if (at < 0) return false;
  for (let i = at - 1; i >= 0; i--) {
    if (passes[i] === 'world') return false;
    if (passes[i] === 'viewmodel') return true;
  }
  return false;
}

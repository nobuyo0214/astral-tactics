import Phaser from "phaser";
/** Fit the logical board into its Grid track. Refresh Phaser's input transform
 * alongside its display size; never stretch the canvas using CSS alone. */
export function observeBoardViewport(
  game: Phaser.Game,
  host: HTMLElement,
): () => void {
  let frame = 0,
    closed = false;
  const fit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (closed || !game.isBooted || !host.isConnected) return;
      const { width, height } = host.getBoundingClientRect();
      if (width > 0 && height > 0) {
        game.scale.setParentSize(width, height);
        game.scale.refresh();
        game.scale.updateBounds();
      }
    });
  };
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  game.events.once(Phaser.Core.Events.READY, fit);
  fit();
  return () => {
    closed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    game.events.off(Phaser.Core.Events.READY, fit);
  };
}

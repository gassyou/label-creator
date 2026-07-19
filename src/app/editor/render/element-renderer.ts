/**
 * Element rendering helpers (Phase 1 of the four-layer architecture refactor).
 *
 * Currently exposes a thin wrapper around `FabricImage.fromURL` that loads
 * an image from a data URL or HTTP(S) URL. Phase 4 will grow this file with
 * per-element creation helpers as the element classes migrate out of
 * `editor-canvas.service.ts`.
 */
import { FabricImage } from 'fabric';

/**
 * Loads a Fabric image from a URL (data URL or HTTP URL) and returns the
 * FabricImage instance once the underlying `<img>` has finished loading.
 *
 * Thin wrapper — exists today so that element code can import a single
 * render-layer helper instead of reaching into `fabric` directly. Phase 4
 * will add more per-element factories here.
 */
export async function loadFabricImage(url: string): Promise<FabricImage> {
  return FabricImage.fromURL(url);
}
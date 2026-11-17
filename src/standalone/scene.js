import { createApplicationScene, loadDefaultRenderer } from '../app/scene.js';
import { createApplicationRequestServices } from '../services/requests.js';
import { loadPflStation } from '../pfl/station.js';

/** The default renderer plugin, loading from the first call (`app/scene.js`). */
export { loadDefaultRenderer };

/** Supply standalone request services when directly constructing a scene. */
export async function createStandaloneScene(options) {
  const scene = await createApplicationScene({
    requestServices: createApplicationRequestServices(),
    ...options,
  });
  const station = await loadPflStation({
    viewer: scene.viewer,
    cesiumToken: options.cesiumToken,
    signal: options.signal,
  });
  options.defer?.(() => station.destroy());
  return { ...scene, pflStation: station };
}

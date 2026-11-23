import { createApplicationControls } from '../app/controls.js';
import { getStandaloneCatalog } from './catalog.js';

/** Default landing viewpoint over Paul's rooftop LiveWire bed & 3v3 stadium. */
export const DEFAULT_ROOF_BED_VIEW = Object.freeze({
  lat: 29.24765,
  lon: -95.23141,
  height: -9.2,
  heading: 158,
  pitch: -22,
});

export function createStandaloneControls(options) {
  return createApplicationControls({
    catalog: options?.catalog ?? getStandaloneCatalog(),
    startView: options?.startView ?? DEFAULT_ROOF_BED_VIEW,
    ...options,
  });
}

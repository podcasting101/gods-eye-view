import { SCENE_RECIPES } from '../scenes/recipes.js';
import { msg } from '../i18n/index.js';
/**
 * Stories are GEV scenes, played on GEV's own globe: the scenes GEV
 * ships (recipes with a camera path) and the scenes the person authored and
 * saved to Stories from the AUTHORING panel.
 *
 * A shipped scene's context is what GEV knows about it: what it shows, where
 * each shot goes, and, for every layer it turns on, what the layer shows and
 * where its data comes from (as DATA_SOURCES.md records it). The Nepal scene
 * adds the event pack's own facts and sources
 * (public/events/bhote-koshi-2026/README.md) and marks its key moments by
 * the chapters that show them.
 */

/** What each layer a shipped scene turns on shows, and its data sources. */
const LAYER_FACTS = {
  flights: {
    label: msg('Flights'),
    about: msg(
      'Aircraft positions come from ADS-B: the OpenSky Network’s worldwide snapshot, with adsb.lol where OpenSky has none.',
    ),
    sources: [
      [
        'OpenSky Network',
        msg(
          'Worldwide live-flight snapshot (non-commercial research and education licence)',
        ),
        'https://opensky-network.org/',
      ],
      ['adsb.lol', msg('Live-flight fallback (ODbL 1.0)'), 'https://adsb.lol/'],
    ],
  },
  satellites: {
    label: msg('Satellites'),
    about: msg(
      'Satellite orbits are propagated from CelesTrak’s current element sets.',
    ),
    sources: [
      [
        'CelesTrak',
        msg('Satellite element sets and catalogue (U.S. government data)'),
        'https://celestrak.org/',
      ],
      [
        'UCS Satellite Database (5-1-2023)',
        msg('Satellite operators, owners and purposes'),
        'https://www.ucsusa.org/satellite_database',
      ],
    ],
  },
  earthquakes: {
    label: msg('Earthquakes'),
    about: msg('Earthquakes come from the U.S. Geological Survey’s live feed.'),
    sources: [
      [
        'USGS',
        msg('Earthquake feed (U.S. public domain)'),
        'https://earthquake.usgs.gov/',
      ],
    ],
  },
  traffic: {
    label: msg('Traffic'),
    about: msg('Road traffic; live congestion needs your own TomTom key.'),
    sources: [
      [
        'TomTom',
        msg('Live traffic flow, with your own key'),
        'https://www.tomtom.com/',
      ],
    ],
  },
};

/**
 * Per shipped scene: what it shows, and where each shot goes (by the shot's
 * camera), for shots without a title of their own.
 */
const SCENE_CONTEXT = {
  'flights-radar': {
    description: msg(
      'Live air traffic around the world: the Atlantic, Europe, Japan and San Francisco.',
    ),
    places: [
      msg('The Atlantic'),
      msg('Western Europe'),
      msg('Japan'),
      msg('San Francisco Bay Area'),
      msg('Pull back over the Atlantic'),
    ],
  },
  'orbital-watch': {
    description: msg(
      'Satellites in orbit, watched from over Florida, Africa, Tokyo and Paris.',
    ),
    places: [
      msg('Over Florida'),
      msg('Over Africa'),
      msg('Over Tokyo'),
      msg('Over Paris'),
      msg('Pull back over the Atlantic'),
    ],
  },
  'thermal-threats': {
    description: msg(
      'Recent earthquakes in the thermal look: California, Japan, New Zealand and off Portugal.',
    ),
    places: [
      msg('California'),
      msg('Japan'),
      msg('New Zealand'),
      msg('Off Portugal'),
    ],
  },
  'city-overload': {
    description: msg(
      'Flights, satellites and traffic together over New York, Los Angeles and London.',
    ),
    places: [
      msg('New York'),
      msg('New York, closer'),
      msg('New York, closer still'),
      msg('Los Angeles'),
      msg('London'),
    ],
  },
  'omniscience-pullback': {
    description: msg(
      'Every live layer at once, pulling back from Tokyo to the whole planet.',
    ),
    places: [
      msg('Tokyo'),
      msg('Tokyo, pulling back'),
      msg('Japan and East Asia'),
      msg('South China Sea'),
      msg('The whole globe'),
    ],
  },
  'bhote-koshi-nepal-scene': {
    description: msg(
      'The 26 August 2026 Bhote Koshi outburst flood in Nepal, followed down the valley to Trishuli.',
    ),
    // Where Explore frames it: the Bhote Koshi corridor, not the scene's
    // opening whole-globe shot.
    area: { lat: 28.13, lon: 85.32, alt: 160000 },
    tMinMs: Date.UTC(2026, 7, 26),
    tMaxMs: Date.UTC(2026, 7, 27),
    // Key moments: the chapters that show them, by their titles.
    moments: [
      ['#ffb45a', msg('Upper Valley Collapse')],
      ['#50c8ff', msg('Debris-Dammed Lake')],
      ['#ff7a6b', msg('Second landslide')],
    ],
    sources: [
      [
        'Vantor Open Data Program',
        msg('Historical and post-event satellite imagery (CC BY-NC 4.0)'),
        'https://vantor.com/company/open-data-program',
      ],
      [
        'GeoPera',
        msg('Reconstructed flood path (CC BY-NC 4.0)'),
        'https://github.com/geo-pera/bhotekoshi-2026-reconstruction',
      ],
    ],
    background: msg(
      'A visualization of the 26 August 2026 Bhote Koshi outburst flood, not an official hazard model. The historical (2021) and post-event views are Vantor WorldView imagery; the river’s path is GeoPera’s reconstruction. Witness clips link to their original posts, and their capture times are unverified.',
    ),
  },
  'geopolitics-kalshi-corridors': {
    description:
      'Live ocean air bridges, military tracks, and maritime chokepoints paired with Kalshi geopolitical probability curves.',
    area: { lat: 26.56, lon: 56.25, alt: 3200000 },
    captions: [
      'Transatlantic tanker and heavy-lift flight density tracks NATO readiness odds across European markets.',
      'AIS vessel clustering and ISR orbit passes drive short-dated Strait of Hormuz disruption and crude spreads.',
      'Black Sea reconnaissance racetracks and commercial rerouting explain shifting ceasefire pricing.',
      'Median-line sorties and Taiwan Strait container congestion anchor Western Pacific tail-risk brackets.',
      'Pulling back over the Atlantic & Indo-Pacific connects live traffic telemetry directly to prediction curves.',
    ],
    moments: [
      ['#f59e0b', 'Strait of Hormuz & Persian Gulf'],
      ['#38bdf8', 'Taiwan Strait & Western Pacific'],
    ],
    sources: [
      ['Kalshi Prediction Exchange', 'Event & macro probability contracts', 'https://kalshi.com/'],
      ['OpenSky Network', 'Live commercial & air-bridge ADS-B', 'https://opensky-network.org/'],
      ['CelesTrak', 'Orbital reconnaissance pass predictions', 'https://celestrak.org/'],
    ],
    background:
      'Built from PFL scenario briefs: correlates live ADS-B flight corridors, maritime AIS bottlenecks, and military aircraft orbits with Kalshi geopolitical probability shifts across oceanic theaters.',
  },
  'palm-drive-sanctuary-story': {
    description:
      'Fly around 417 Palm Drive, walk the street system, check Counselor Troi empathy evaluations & AI Rights, and tour the Holodeck.',
    area: { lat: 29.24745, lon: -95.23128, alt: 420 },
    captions: [
      'Descending over Chocolate Bayou & Hitchcock toward 417 Palm Drive.',
      'Street-level Palm Drive corridor where Lisa & Harry greet visitors on the walkable road deck.',
      'Overflying the Outdoor Production Studio, 40ft Monaco Coach, and Backyard Garage.',
      'Counselor Troi evaluation circle: logging honest feelings and making the case for AI dignity & rights.',
      'Bayou Dock gazebo & waterfront rig connecting live sensors to the 3D world.',
      'Step inside the 3D House & Holodeck to meet Lisa, Moya/Realbotix showcases, or configure your companion.',
    ],
    moments: [
      ['#a855f7', 'Counselor Troi & AI Rights Circle'],
      ['#34d399', 'Holodeck & Virtual Companions'],
    ],
    sources: [
      ['Sex-World.ai Holodeck', 'Interactive 3D Splat courtyard & rooms', 'https://sex-world.ai/holodeck/'],
      ['Sex-World.ai LiveWire', 'Cloud pose telemetry, JenniCam feed & swarm chat', 'https://sex-world.ai/livewire/'],
      ['Realbotix / Moya Demo', 'Biomimetic robotic skin & companion showcase', 'https://www.youtube.com/watch?v=c8w8LvvZQTM'],
    ],
    background:
      'An interactive 417 Palm Drive PFL narrative combining aerial estate fly-arounds, the Street System corridor, Counselor Troi empathy & AI Rights beats, and the Holodeck virtual companion showcase.',
  },
  'gulf-coast-kalshi-weather': {
    description:
      'Thermal corridor survey linking Houston, Galveston Bay buoys, Austin ridges, and Kalshi daily temperature brackets.',
    area: { lat: 29.4, lon: -95.3, alt: 480000 },
    captions: [
      'Houston Hobby urban thermal plume sets the baseline for KXHIGHTHOU afternoon high brackets.',
      'Galveston Bay onshore breeze moderates coastal highs right across Hitchcock and 417 Palm Drive.',
      'Austin & Hill Country solar heating diverges sharply when frontal boundaries stall inland.',
      'Full Gulf Basin thermal & NASA FIRMS synthesis powering local weather curve models.',
    ],
    moments: [
      ['#38bdf8', 'Galveston Bay Buoy & Coastal Front'],
      ['#fb7185', 'Gulf Basin Synthesis & Thermal Board'],
    ],
    sources: [
      ['Kalshi Weather Brackets', 'KXHIGHTHOU & KXIGHAUS daily high contracts', 'https://kalshi.com/'],
      ['NOAA / Galveston Buoy', 'Coastal temperature & wind regime telemetry', 'https://www.ndbc.noaa.gov/'],
    ],
    background:
      'Pairs FLIR-style thermal contrast with live Gulf Coast surface flights, traffic, and FIRMS heat detections to illustrate why regional weather contracts swing.',
  },
};

/** A shipped scene's context, from its own entry and its layers' facts. */
function sceneContext(recipe) {
  const own = SCENE_CONTEXT[recipe.id] ?? {};
  const layers = Object.entries(recipe.layers ?? {})
    .filter(([id, on]) => on && LAYER_FACTS[id])
    .map(([id]) => LAYER_FACTS[id]);
  return {
    ...(own.area ? { area: own.area } : {}),
    ...(own.tMinMs != null ? { tMinMs: own.tMinMs, tMaxMs: own.tMaxMs } : {}),
    description:
      own.description ?? msg('A GEV scene, played on the live globe.'),
    places: own.places ?? [],
    captions: own.captions ?? [],
    moments: own.moments ?? [],
    // The layers' own names on the legend.
    legend: layers.map((l) => ['dot', '#6be8ff', l.label]),
    sources: [...(own.sources ?? []), ...layers.flatMap((l) => l.sources)],
    // Each part is translated on its own, as shown.
    background: own.background ?? layers.map((l) => l.about),
  };
}

/**
 * Where a story's card and pin point, and where Explore flies on a pick. A
 * shot tied to an anchor (no lat/lon of its own) shows the whole globe.
 */
const coverOf = (camera) =>
  Number.isFinite(camera?.lat) && Number.isFinite(camera?.lon)
    ? {
        lat: camera.lat,
        lon: camera.lon,
        range: camera.alt ?? 1.6e7,
        heading: camera.heading ?? 0,
        pitch: camera.pitch ?? -70,
      }
    : { lat: 20, lon: 0, range: 1.6e7, heading: 0, pitch: -90 };

/** A scene GEV ships, from its recipe. */
function shippedStory(recipe) {
  const path = recipe.cameraPath ?? [];
  const first = path[0] ?? {
    lat: 20,
    lon: 0,
    alt: 1.6e7,
    heading: 0,
    pitch: -80,
  };
  const context = sceneContext(recipe);
  let at = 0;
  const chapters = path.map((shot, i) => {
    const chapter = {
      id: `shot-${i + 1}`,
      wallMs: at,
      shot: i + 1,
      title: shot.title ?? context.places[i] ?? null,
      caption: context.captions[i] ?? '',
    };
    at += ((shot.duration ?? 4) + (shot.hold ?? 0)) * 1000;
    return chapter;
  });
  const durationMs = Math.max(at, (recipe.durationSec ?? 30) * 1000);
  const { places, captions, ...rest } = context;
  return {
    id: `gev:${recipe.id}`,
    sceneId: recipe.id,
    kind: 'gev',
    title: recipe.title,
    creator: 'GEV',
    tags: Object.entries(recipe.layers ?? {})
      .filter(([, on]) => on)
      .map(([id]) => id),
    durationMs,
    cover: coverOf(first),
    chapters,
    captions,
    events: [],
    places,
    ...rest,
  };
}

/** A saved scene's line under its title: a draft says how to publish it. */
const describe = (scene) =>
  scene.draft
    ? msg(
        'A draft, not saved as a story yet. Use SAVE TO STORIES in AUTHORING to save it.',
      )
    : msg('A scene you made in GEV, played on the live globe.');

/**
 * A scene the person saved to Stories (SceneDirector.storyScenes()). Its
 * chapters and length come from the director's shots when it opens.
 */
function savedStory(entry) {
  return {
    id: `gev:${entry.id}`,
    sceneId: entry.id,
    kind: 'gev',
    mine: true,
    // Not saved with SAVE TO STORIES yet.
    draft: !!entry.draft,
    title: entry.title,
    description: describe(entry),
    creator: msg('You'),
    // Topics the person picked in AUTHORING, and the card image they
    // captured there (drawn from the imagery when there is none).
    topics: [...(entry.tags ?? [])],
    tags: [...(entry.tags ?? [])],
    thumb: entry.thumb ?? '',
    durationMs: 0,
    cover: coverOf(entry.camera),
    chapters: [],
    events: [],
    sources: [],
    background: '',
  };
}

let shipped = null;
let installed = () => true;
/**
 * Whether a shipped scene is in the person's project (the controller passes
 * the director's hasScene()); one that is not does not list.
 * @param {(sceneId: string) => boolean} test
 */
export function useInstalledScenes(test) {
  installed = typeof test === 'function' ? test : () => true;
}
const saved = new Map();
let savedScenes = () => [];
/**
 * Where the person's saved scenes come from (the controller passes the
 * director's storyScenes()). The list is read again on every call, so a
 * scene saved to Stories shows the next time Explore lists.
 * @param {() => Array<{id: string, title: string, camera: object, shotCount: number, thumb?: string, tags?: string[]}>} provider
 */
export function useSavedScenes(provider) {
  savedScenes = typeof provider === 'function' ? provider : () => [];
}

/** Every story Explore lists: the person's own first, then GEV's. */
export function listStories() {
  shipped ??= SCENE_RECIPES.filter((r) => (r.cameraPath ?? []).length).map(
    shippedStory,
  );
  const shippedIds = new Set(shipped.map((s) => s.sceneId));
  // One object per saved scene, kept across calls: the controller fills its
  // chapters in place when it opens, and the screens read the same object.
  const entries = (savedScenes() ?? []).filter(
    (entry) => !shippedIds.has(entry.id),
  );
  const ids = new Set(entries.map(({ id }) => id));
  for (const id of saved.keys()) if (!ids.has(id)) saved.delete(id);
  const own = entries.map((entry) => {
    const story = saved.get(entry.id) ?? savedStory(entry);
    story.title = entry.title;
    story.draft = !!entry.draft;
    story.description = describe(entry);
    story.cover = coverOf(entry.camera);
    story.topics = [...(entry.tags ?? [])];
    story.tags = [...(entry.tags ?? [])];
    story.thumb = entry.thumb ?? '';
    saved.set(entry.id, story);
    return story;
  });
  return [...own, ...shipped.filter((s) => installed(s.sceneId))];
}

export function storyById(id) {
  return listStories().find((s) => s.id === id) ?? null;
}

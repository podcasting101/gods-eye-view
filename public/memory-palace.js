import * as THREE from '/three/three.module.js';

    // =========================================================================
    // 1. PFL 417 PALM DRIVE POSED CAMERA DATASET (Derived from Calibrated Survey)
    // =========================================================================
    const ORIGIN_LAT = 29.24745;
    const ORIGIN_LON = -95.23148;

    const POSED_PHOTOS_DATASET = [
      {
        id: 'yard-overview-20261012',
        title: 'Wyze V4 — Front Yard & Driveway',
        timestamp: '2026-10-12 14:22 CDT',
        imageUrl: '/yard-frames/yard-overview-2026-10-12.png',
        lat: 29.247315,
        lon: -95.231524,
        position: [-4.2, 5.2, 11.5],
        lookAt: [2.5, 1.2, -6.0],
        fov: 62,
        aspect: 1.77,
        depth: 8.5,
        entities: ['Monaco Beaver RV', 'White RV', 'Red Van', 'Tesla', 'Yellow Pump House', 'Palm Drive'],
      },
      {
        id: 'back-yard-cam1-plan',
        title: 'Back Yard Cam 1 — Road & Culvert',
        timestamp: '2026-10-12 14:20 CDT',
        imageUrl: '/yard-frames/back-yard-cam1-2026-10-12.jpg',
        lat: 29.247480,
        lon: -95.231280,
        position: [13.5, 4.8, 6.0],
        lookAt: [-3.0, 0.8, 12.0],
        fov: 60,
        aspect: 1.77,
        depth: 8.0,
        entities: ['Palm Drive Culvert', 'Telephone Pole', 'Neighbor Driveway', 'East Oak Tree'],
      },
      {
        id: 'back-yard-cam2-water',
        title: 'Back Yard Cam 2 — Pond & Water',
        timestamp: '2026-10-12 14:25 CDT',
        imageUrl: '/yard-frames/back-yard-cam2-2026-10-12.jpg',
        lat: 29.247692,
        lon: -95.231438,
        position: [2.8, 4.5, -14.5],
        lookAt: [4.0, 1.0, -32.0],
        fov: 62,
        aspect: 1.77,
        depth: 9.0,
        entities: ['417 Palm Drive Pond', 'Blue House Across Pond', 'North Dock'],
      },
      {
        id: 'house-side-20261015',
        title: 'West Wall — Utility & Fence Line',
        timestamp: '2026-10-15 11:10 CDT',
        imageUrl: '/yard-frames/house-side-2026-10-12.png',
        lat: 29.247510,
        lon: -95.231630,
        position: [-15.0, 3.8, -2.5],
        lookAt: [-15.5, 1.2, 10.5],
        fov: 58,
        aspect: 1.77,
        depth: 7.5,
        entities: ['West Wall Utility', 'EcoFlow Miners Bank', '417 Palm Drive House'],
      },
      {
        id: 'master-bed-cam-20261015',
        title: 'Master Bedroom — Interior Station',
        timestamp: '2026-10-15 16:40 CDT',
        imageUrl: '/yard-frames/bed-station-2026-10-12.png',
        lat: 29.247545,
        lon: -95.231510,
        position: [-5.5, 3.4, -7.2],
        lookAt: [-1.0, 2.0, -13.0],
        fov: 60,
        aspect: 1.77,
        depth: 5.5,
        entities: ['Paul Prime', 'Lisa Holmes', 'Bedroom Camera Node'],
      },
      {
        id: 'stitched-ground-overview',
        title: 'TPS Stitched Composite — Full Yard',
        timestamp: '2026-10-24 11:37 CDT',
        imageUrl: '/yard-frames/front-yard-stitched-2026-10-12.png',
        lat: 29.247315,
        lon: -95.231524,
        position: [0.0, 14.5, 22.0],
        lookAt: [0.0, 0.0, 0.0],
        fov: 55,
        aspect: 1.33,
        depth: 7.0,
        entities: ['TPS Ground Registration', 'Lisa Muse Sovereign Anchor', '28 Survey Landmarks'],
      },
      {
        id: 'back-yard-cam2-stitched-splat',
        title: 'Stitched Waterfront Splat (Cam2 Before+After)',
        timestamp: '2026-10-26 09:21 CDT',
        imageUrl: '/yard-frames/back-yard-cam2-stitched-2026-10-26.png',
        lat: 29.247695,
        lon: -95.231445,
        position: [2.8, 5.2, -13.5],
        lookAt: [0.5, 1.2, -31.0],
        fov: 78,
        aspect: 2.04,
        depth: 10.5,
        entities: ['Multi-Trunk Tree Anchor', 'North Dock', 'Moved Solar Panels', 'Charred Yard Fire Scar', 'Yellow Boathouse'],
      },
      {
        id: 'back-yard-fire-analysis-20261026',
        title: 'Solar Panel Fire Scar Analysis (Stitched)',
        timestamp: '2026-10-25 12:18 CDT',
        imageUrl: '/yard-frames/back-yard-cam2-fire-analysis-2026-10-26.png',
        lat: 29.247698,
        lon: -95.231460,
        position: [-1.5, 4.8, -14.2],
        lookAt: [-2.5, 1.0, -30.5],
        fov: 76,
        aspect: 2.04,
        depth: 9.5,
        entities: ['Prior Solar Panel Ghost', 'Moved Solar Panels', 'Charred Yard Fire Scar', 'Multi-Trunk Tree Anchor'],
      },
      {
        id: 'dock-cam-fire-121338',
        title: 'Boathouse Dock Cam (HL_PAN4) — Smoke & Fire',
        timestamp: '2026-10-25 12:13 CDT',
        imageUrl: '/yard-frames/20261025_121338_pan4-cam_0.jpg',
        lat: 29.247745,
        lon: -95.231530,
        position: [-8.5, 2.2, -25.0],
        lookAt: [1.5, 2.6, -15.5],
        fov: 62,
        aspect: 1.77,
        depth: 7.5,
        entities: ['Boathouse Dock Cam', 'Solar Panel Fire Smoke', 'Paul Prime', 'Multi-Trunk Tree Anchor'],
      },
    ];

    // =========================================================================
    // 2. INITIALIZE THREE.JS SCENE, RENDERER & ON-DEMAND RENDER GOVERNOR
    // =========================================================================
    const container = document.getElementById('canvas-container');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b12);
    scene.fog = new THREE.FogExp2(0x070b12, 0.0085);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    const OVERVIEW_POS = new THREE.Vector3(0, 28, 34);
    const OVERVIEW_TARGET = new THREE.Vector3(0, 1.5, -2);
    camera.position.copy(OVERVIEW_POS);
    camera.lookAt(OVERVIEW_TARGET);

    // Lighting
    scene.add(new THREE.AmbientLight(0xd8f0ff, 1.35));
    const dirLight = new THREE.DirectionalLight(0x00f0ff, 0.9);
    dirLight.position.set(15, 35, 20);
    scene.add(dirLight);

    // On-Demand Render Governor (0% GPU when idle — protects ComfyUI!)
    let renderRequested = false;
    let activeFlightRaf = 0;
    const renderChip = document.getElementById('render-state-chip');
    let idleChipTimer = 0;

    function requestRender() {
      if (renderRequested) return;
      renderRequested = true;
      if (renderChip) {
        renderChip.textContent = 'RENDERING';
        renderChip.style.color = '#00f0ff';
      }
      clearTimeout(idleChipTimer);
      requestAnimationFrame(() => {
        renderRequested = false;
        renderer.render(scene, camera);
        updateSpatialTagPosition();
        idleChipTimer = setTimeout(() => {
          if (renderChip && !activeFlightRaf) {
            renderChip.textContent = 'IDLE 0% GPU';
            renderChip.style.color = '#00ffcc';
          }
        }, 220);
      });
    }

    // =========================================================================
    // 3. BASE ENVIRONMENT: GROUND-PINNED STITCHED YARD + HOLODECK GRID + ANCHOR
    // =========================================================================
    const textureLoader = new THREE.TextureLoader();

    // Tactical Holodeck Coordinate Grid
    const gridHelper = new THREE.GridHelper(90, 45, 0x00f0ff, 0x12283a);
    gridHelper.position.y = -0.05;
    scene.add(gridHelper);

    // Calibrated Stitched Ground Quad (417 Palm Drive)
    const groundTex = textureLoader.load('/yard-frames/front-yard-stitched-2026-10-12.png', () => requestRender());
    groundTex.colorSpace = THREE.SRGBColorSpace;
    const groundMat = new THREE.MeshBasicMaterial({
      map: groundTex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(52, 42), groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.set(0, 0.02, 2);
    scene.add(groundPlane);

    // Pond Water Plane (North of house)
    const pondTex = textureLoader.load('/yard-frames/back-yard-cam2-2026-10-12.jpg', () => requestRender());
    pondTex.colorSpace = THREE.SRGBColorSpace;
    const pondPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 18),
      new THREE.MeshBasicMaterial({ map: pondTex, transparent: true, opacity: 0.78, side: THREE.DoubleSide })
    );
    pondPlane.rotation.x = -Math.PI / 2;
    pondPlane.position.set(3, 0.01, -26);
    scene.add(pondPlane);

    // Sovereign Anchor Beacon at 417 Palm Drive Center
    const anchorGroup = new THREE.Group();
    anchorGroup.position.set(0, 0, -2);
    const beaconGeo = new THREE.OctahedronGeometry(0.65, 0);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.y = 2.2;
    anchorGroup.add(beaconMesh);
    const ringGeo = new THREE.RingGeometry(0.9, 1.15, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.08;
    anchorGroup.add(ringMesh);
    scene.add(anchorGroup);

    // =========================================================================
    // 4. STEP 3 & 4: FRUSTUM GEOMETRY GENERATOR & POSED PHOTO QUAD PROJECTOR
    // =========================================================================
    const photoNodes = []; // Dedicated array for fast GPU Raycasting (Rule #1)
    const frustumWireframes = [];
    const frustumGroupsById = new Map();

    function createCameraFrustum(position, quaternion, fov = 60, aspect = 1.77, depth = 8.5) {
      const frustumGroup = new THREE.Group();
      frustumGroup.position.copy(position);
      frustumGroup.quaternion.copy(quaternion);

      const vFOV = THREE.MathUtils.degToRad(fov);
      const halfH = Math.tan(vFOV / 2) * depth;
      const halfW = halfH * aspect;

      const vertices = [
        new THREE.Vector3(0, 0, 0),               // 0: Camera Apex
        new THREE.Vector3(-halfW,  halfH, -depth), // 1: Top-Left
        new THREE.Vector3( halfW,  halfH, -depth), // 2: Top-Right
        new THREE.Vector3( halfW, -halfH, -depth), // 3: Bottom-Right
        new THREE.Vector3(-halfW, -halfH, -depth), // 4: Bottom-Left
      ];
      const indices = [
        0, 1, 0, 2, 0, 3, 0, 4, // 4 corner rays from lens apex
        1, 2, 2, 3, 3, 4, 4, 1, // Far-cap monitor frame
      ];

      const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
      geometry.setIndex(indices);

      const material = new THREE.LineBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.78,
      });

      const wireframe = new THREE.LineSegments(geometry, material);
      frustumGroup.add(wireframe);
      frustumWireframes.push(wireframe);

      // Apex lens marker sphere
      const lensDot = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffb84d })
      );
      frustumGroup.add(lensDot);

      return { frustumGroup, wireframe, farWidth: halfW * 2, farHeight: halfH * 2, depth };
    }

    function addPosedPhotoNode(photoData) {
      const pos = new THREE.Vector3(...photoData.position);
      const lookTarget = new THREE.Vector3(...photoData.lookAt);

      // Compute camera orientation quaternion looking from `pos` toward `lookTarget`
      const dummyCam = new THREE.PerspectiveCamera();
      dummyCam.position.copy(pos);
      dummyCam.lookAt(lookTarget);
      const quat = dummyCam.quaternion.clone();

      const { frustumGroup, wireframe, farWidth, farHeight, depth } = createCameraFrustum(
        pos,
        quat,
        photoData.fov,
        photoData.aspect,
        photoData.depth
      );

      const texture = textureLoader.load(photoData.imageUrl, () => requestRender());
      texture.colorSpace = THREE.SRGBColorSpace;

      const quadGeometry = new THREE.PlaneGeometry(farWidth, farHeight);
      const quadMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
      });

      const photoMesh = new THREE.Mesh(quadGeometry, quadMaterial);
      photoMesh.position.set(0, 0, -depth);
      photoMesh.layers.set(0);
      photoMesh.userData = {
        id: photoData.id,
        photoData,
        quat,
        pos,
        wireframe,
        baseDepth: photoData.depth,
      };

      frustumGroup.add(photoMesh);
      scene.add(frustumGroup);

      photoNodes.push(photoMesh);
      frustumGroupsById.set(photoData.id, { group: frustumGroup, mesh: photoMesh, wireframe, photoData, pos, quat });
    }

    POSED_PHOTOS_DATASET.forEach((d, idx) => {
      d.stamp = Math.round((idx / Math.max(1, POSED_PHOTOS_DATASET.length - 1)) * 100);
      addPosedPhotoNode(d);
    });

    // 4D Camera Trajectory Spline (Catmull-Rom curve connecting posed camera stations)
    const trajectoryPoints = POSED_PHOTOS_DATASET.map((d) => new THREE.Vector3(...d.position));
    const trajectoryCurve = new THREE.CatmullRomCurve3(trajectoryPoints, false, 'centripetal');
    const trajectoryLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(trajectoryCurve.getPoints(160)),
      new THREE.LineDashedMaterial({ color: 0x00ffcc, dashSize: 0.55, gapSize: 0.3, transparent: true, opacity: 0.55 })
    );
    trajectoryLine.computeLineDistances();
    scene.add(trajectoryLine);

    // =========================================================================
    // 5. ORBIT / DRAG NAVIGATION + RAYCASTING (WITH [0] & DRAG-GUARD FIXES)
    // =========================================================================
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredPhoto = null;
    let selectedPhotoMesh = null;

    // Custom lightweight Orbit controller around `orbitTarget`
    const orbitTarget = OVERVIEW_TARGET.clone();
    let isPointerDown = false;
    let downX = 0, downY = 0;
    let lastX = 0, lastY = 0;

    function updatePointerCoordinates(event) {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    function applyPhotoHighlight(mesh) {
      document.body.style.cursor = 'pointer';
      if (mesh !== selectedPhotoMesh) {
        mesh.material.opacity = 0.98;
      }
      if (mesh.userData.wireframe) {
        mesh.userData.wireframe.material.color.setHex(0x00ffcc);
        mesh.userData.wireframe.material.opacity = 1.0;
      }
      showSpatialTag(mesh);
      requestRender();
    }

    function resetPhotoHighlight(mesh) {
      document.body.style.cursor = 'default';
      const sliderVal = Number(document.getElementById('opacity-slider').value) / 100;
      mesh.material.opacity = sliderVal;
      if (mesh.userData.wireframe && mesh !== selectedPhotoMesh) {
        mesh.userData.wireframe.material.color.setHex(0x00f0ff);
        mesh.userData.wireframe.material.opacity = 0.78;
      }
      if (!selectedPhotoMesh) {
        document.getElementById('spatial-tag').style.display = 'none';
      } else {
        showSpatialTag(selectedPhotoMesh);
      }
      requestRender();
    }

    function showSpatialTag(mesh) {
      const d = mesh.userData.photoData;
      const tag = document.getElementById('spatial-tag');
      document.getElementById('tag-kicker').textContent = `📅 ${d.timestamp} · FOV ${d.fov}°`;
      document.getElementById('tag-title').textContent = d.title;
      document.getElementById('tag-meta').textContent =
        `GPS: ${d.lat.toFixed(6)}° N, ${d.lon.toFixed(6)}° W · Click to step inside frustum`;
      const entContainer = document.getElementById('tag-entities');
      entContainer.innerHTML = (d.entities || [])
        .map((e) => `<span class="entity-pill">${e}</span>`)
        .join('');
      tag.dataset.meshId = d.id;
      tag.style.display = 'block';
      updateSpatialTagPosition();
    }

    function updateSpatialTagPosition() {
      const tag = document.getElementById('spatial-tag');
      if (!tag || tag.style.display === 'none') return;
      const activeMesh = hoveredPhoto || selectedPhotoMesh;
      if (!activeMesh) return;
      const worldPos = new THREE.Vector3();
      activeMesh.getWorldPosition(worldPos);
      worldPos.y += 2.2;
      worldPos.project(camera);
      if (worldPos.z > 1) {
        tag.style.display = 'none';
        return;
      }
      const x = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-worldPos.y * 0.5 + 0.5) * window.innerHeight;
      tag.style.left = `${Math.max(170, Math.min(window.innerWidth - 170, x))}px`;
      tag.style.top = `${Math.max(90, Math.min(window.innerHeight - 90, y))}px`;
    }

    // Throttled hover raycast (80ms cadence) + camera orbit drag
    let lastHoverPickMs = 0;
    window.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.hud-card, .left-inspector, .right-graph, .bottom-rail')) return;
      isPointerDown = true;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (isPointerDown) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        const offset = camera.position.clone().sub(orbitTarget);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta -= dx * 0.0065;
        spherical.phi = Math.max(0.08, Math.min(Math.PI / 2 - 0.04, spherical.phi - dy * 0.0055));
        offset.setFromSpherical(spherical);
        camera.position.copy(orbitTarget).add(offset);
        camera.lookAt(orbitTarget);
        requestRender();
        return;
      }

      if (e.target.closest('.hud-card, .left-inspector, .right-graph, .bottom-rail')) return;
      const now = performance.now();
      if (now - lastHoverPickMs < 75) return;
      lastHoverPickMs = now;

      updatePointerCoordinates(e);
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(photoNodes, false);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object; // Fixed [0] array access!
        if (hoveredPhoto !== hitMesh) {
          if (hoveredPhoto) resetPhotoHighlight(hoveredPhoto);
          hoveredPhoto = hitMesh;
          applyPhotoHighlight(hoveredPhoto);
        } else {
          updateSpatialTagPosition();
        }
      } else if (hoveredPhoto) {
        resetPhotoHighlight(hoveredPhoto);
        hoveredPhoto = null;
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      // Guard: only treat as a click if pointer moved < 5px (not an orbit drag)
      if (Math.hypot(e.clientX - downX, e.clientY - downY) >= 5) return;

      updatePointerCoordinates(e);
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(photoNodes, false);

      if (intersects.length > 0) {
        const selectedPhoto = intersects[0].object; // Fixed [0] array access!
        focusPhotoNode(selectedPhoto.userData.id);
      }
    });

    window.addEventListener('wheel', (e) => {
      if (e.target.closest('.node-list, .bottom-rail')) return;
      const dir = camera.position.clone().sub(orbitTarget);
      const dist = dir.length();
      const nextDist = Math.max(1.5, Math.min(95, dist * (1 + e.deltaY * 0.001)));
      dir.normalize().multiplyScalar(nextDist);
      camera.position.copy(orbitTarget).add(dir);
      requestRender();
    }, { passive: true });

    // =========================================================================
    // 6. SMOOTH SLERP PERSPECTIVE FLIGHT ANIMATION (`flyCameraToPerspective`)
    // =========================================================================
    function flyCameraToPerspective(targetPos, targetQuat, lookAtPoint, duration = 1050) {
      if (activeFlightRaf) cancelAnimationFrame(activeFlightRaf);
      const startPos = camera.position.clone();
      const startQuat = camera.quaternion.clone();
      const startTime = performance.now();

      function animateFlight(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        // Smoothstep easing curve
        const ease = progress * progress * (3 - 2 * progress);

        camera.position.lerpVectors(startPos, targetPos, ease);
        camera.quaternion.slerpQuaternions(startQuat, targetQuat, ease);
        renderer.render(scene, camera);
        updateSpatialTagPosition();

        if (progress < 1.0) {
          activeFlightRaf = requestAnimationFrame(animateFlight);
        } else {
          activeFlightRaf = 0;
          if (lookAtPoint) {
            orbitTarget.copy(lookAtPoint);
          } else {
            const forwardDir = new THREE.Vector3(0, 0, -6).applyQuaternion(targetQuat);
            orbitTarget.copy(targetPos).add(forwardDir);
          }
          requestRender();
        }
      }
      activeFlightRaf = requestAnimationFrame(animateFlight);
    }

    function focusPhotoNode(id) {
      const entry = frustumGroupsById.get(id);
      if (!entry) return;
      selectedPhotoMesh = entry.mesh;

      // Update UI cards
      document.querySelectorAll('.cam-card').forEach((el) => {
        el.classList.toggle('active', el.dataset.id === id);
      });
      document.getElementById('btn-overview').classList.remove('active');

      // Update left telemetry inspector
      const d = entry.photoData;
      document.getElementById('active-cam-name').textContent = d.title;
      document.getElementById('tele-lat').textContent = `${d.lat.toFixed(5)}° N`;
      document.getElementById('tele-lon').textContent = `${d.lon.toFixed(5)}° W`;
      document.getElementById('tele-fov').textContent = `${d.fov}°`;
      document.getElementById('tele-date').textContent = d.timestamp.split(' ')[0];
      document.getElementById('tele-xyz').textContent =
        `[${d.position.map((n) => n.toFixed(1)).join(', ')}]`;
      document.getElementById('tele-quat').textContent =
        `[${entry.quat.x.toFixed(2)}, ${entry.quat.y.toFixed(2)}, ${entry.quat.z.toFixed(2)}, ${entry.quat.w.toFixed(2)}]`;

      // Highlight selected wireframe
      frustumGroupsById.forEach((v, k) => {
        v.wireframe.material.color.setHex(k === id ? 0x00ffcc : 0x00f0ff);
      });
      showSpatialTag(entry.mesh);

      // Fly camera directly into the frustum apex
      const targetPosition = new THREE.Vector3();
      const targetQuaternion = new THREE.Quaternion();
      entry.group.getWorldPosition(targetPosition);
      entry.group.getWorldQuaternion(targetQuaternion);
      const lookAtVec = new THREE.Vector3(...d.lookAt);

      flyCameraToPerspective(targetPosition, targetQuaternion, lookAtVec, 1050);

      // Automatically open 1-hop Neo4j neighborhood web for the primary entity on this slide
      const slideEntityMap = {
        'stitched-ground-overview': 'Lisa Muse',
        'master-bed-cam-20261015': 'Paul Prime',
        'yard-overview-20261012': 'Monaco Beaver Patriot Thunder',
        'back-yard-cam1-plan': '417 Palm Drive, Liverpool TX',
        'back-yard-cam2-water': '417 Palm Drive North Pond',
        'back-yard-cam2-stitched-splat': 'Lisa Muse',
        'back-yard-fire-analysis-20261026': 'Paul Prime',
        'dock-cam-fire-121338': 'Paul Prime',
        'house-side-20261015': '417 Palm Drive, Liverpool TX',
      };
      const defaultEntity = slideEntityMap[id] || (d.entities && d.entities[0]) || 'Lisa Muse';
      if (typeof renderOneHopNeighborhood === 'function' && neo4jBundleData) {
        renderOneHopNeighborhood(defaultEntity, entry);
      }
    }

    function flyToOverview() {
      selectedPhotoMesh = null;
      document.getElementById('spatial-tag').style.display = 'none';
      document.querySelectorAll('.cam-card').forEach((el) => el.classList.remove('active'));
      document.getElementById('btn-overview').classList.add('active');
      document.getElementById('active-cam-name').textContent = "God's Eye Overview (All 6 Cameras)";

      const dummy = new THREE.PerspectiveCamera();
      dummy.position.copy(OVERVIEW_POS);
      dummy.lookAt(OVERVIEW_TARGET);
      flyCameraToPerspective(OVERVIEW_POS, dummy.quaternion, OVERVIEW_TARGET, 1000);
    }

    // =========================================================================
    // 7. BUILD BOTTOM CAMERA TIMELINE & UI CONTROLS
    // =========================================================================
    const rail = document.getElementById('camera-rail');
    POSED_PHOTOS_DATASET.forEach((d) => {
      const card = document.createElement('div');
      card.className = 'cam-card';
      card.dataset.id = d.id;
      card.innerHTML = `
        <img class="cam-thumb" src="${d.imageUrl}" alt="${d.title}" />
        <div>
          <div class="cam-info-title">${d.title}</div>
          <div class="cam-info-time">🕒 ${d.timestamp} · FOV ${d.fov}°</div>
        </div>
      `;
      card.addEventListener('click', () => focusPhotoNode(d.id));
      rail.appendChild(card);
    });

    document.getElementById('btn-overview').addEventListener('click', flyToOverview);

    // 4D Auto-Tour across all cameras
    let tourTimer = 0;
    let tourIndex = 0;
    const tourBtn = document.getElementById('btn-autotour');
    tourBtn.addEventListener('click', () => {
      if (tourTimer) {
        clearInterval(tourTimer);
        tourTimer = 0;
        tourBtn.classList.remove('active');
        tourBtn.textContent = '▶️ 4D Time Tour';
        return;
      }
      tourBtn.classList.add('active');
      tourBtn.textContent = '⏸️ Stop 4D Tour';
      focusPhotoNode(POSED_PHOTOS_DATASET[tourIndex].id);
      tourTimer = setInterval(() => {
        tourIndex = (tourIndex + 1) % POSED_PHOTOS_DATASET.length;
        focusPhotoNode(POSED_PHOTOS_DATASET[tourIndex].id);
      }, 3600);
    });

    // Frustum wireframe toggle
    let frustumsVisible = true;
    const frustumBtn = document.getElementById('btn-frustums');
    frustumBtn.addEventListener('click', () => {
      frustumsVisible = !frustumsVisible;
      frustumWireframes.forEach((w) => { w.visible = frustumsVisible; });
      frustumBtn.textContent = frustumsVisible ? '📐 Frustums: ON' : '📐 Frustums: OFF';
      requestRender();
    });

    // Optics Shader Cycling (Normal -> NVG -> Thermal FLIR)
    const opticsModes = ['NORMAL', 'NVG', 'FLIR'];
    let opticsIdx = 0;
    const opticsBtn = document.getElementById('btn-optics');
    opticsBtn.addEventListener('click', () => {
      opticsIdx = (opticsIdx + 1) % opticsModes.length;
      const mode = opticsModes[opticsIdx];
      document.body.classList.remove('mode-nvg', 'mode-flir');
      if (mode === 'NVG') document.body.classList.add('mode-nvg');
      if (mode === 'FLIR') document.body.classList.add('mode-flir');
      opticsBtn.textContent = `🔭 Optics: ${mode}`;
    });

    // 4D Temporal Scrubber (x, y, z, t)
    const timeScrubSlider = document.getElementById('time-scrub-slider');
    const timeScrubVal = document.getElementById('time-scrub-val');
    if (timeScrubSlider) {
      timeScrubSlider.addEventListener('input', () => {
        const t = Number(timeScrubSlider.value);
        const baseOpacity = Number(opacitySlider.value) / 100;
        let resolvedCount = 0;
        let latestId = POSED_PHOTOS_DATASET[0].id;
        frustumGroupsById.forEach((entry, id) => {
          const stamp = entry.photoData.stamp ?? 0;
          const delta = t - stamp;
          const isResolved = delta >= -2;
          entry.group.visible = delta >= -25;
          const alpha = THREE.MathUtils.clamp((delta + 25) / 25, 0.15, 1.0);
          entry.group.scale.setScalar(0.84 + 0.16 * alpha);
          entry.mesh.material.opacity = isResolved ? baseOpacity : baseOpacity * 0.22;
          entry.wireframe.material.opacity = isResolved ? 0.85 : 0.22;
          if (isResolved) {
            resolvedCount++;
            latestId = id;
          }
        });
        if (timeScrubVal) {
          timeScrubVal.textContent = `t = ${t}% (${resolvedCount}/${POSED_PHOTOS_DATASET.length})`;
        }
        const activeEntry = frustumGroupsById.get(latestId);
        if (activeEntry) {
          const d = activeEntry.photoData;
          document.getElementById('tele-date').textContent = d.timestamp.split(' ')[0];
          document.getElementById('tele-xyz').textContent = `[${d.position.map((n) => n.toFixed(1)).join(', ')}]`;
        }
        requestRender();
      });
    }

    // Onion-Skin See-Thru Opacity Slider
    const opacitySlider = document.getElementById('opacity-slider');
    const opacityVal = document.getElementById('opacity-val');
    opacitySlider.addEventListener('input', () => {
      const v = Number(opacitySlider.value);
      opacityVal.textContent = `${v}%`;
      photoNodes.forEach((m) => { m.material.opacity = v / 100; });
      requestRender();
    });

    // Frustum Depth Slider
    const depthSlider = document.getElementById('depth-slider');
    const depthVal = document.getElementById('depth-val');
    depthSlider.addEventListener('input', () => {
      const d = Number(depthSlider.value);
      depthVal.textContent = `${d.toFixed(1)}m`;
      photoNodes.forEach((m) => {
        const scale = d / (m.userData.baseDepth || 8.5);
        m.position.z = -d;
        m.scale.set(scale, scale, 1);
      });
      requestRender();
    });

    // =========================================================================
    // 8. LOAD LIVE NEO4J GRAPHITI BUNDLE (/gev-intel/index.json) & 1-HOP 3D WEB
    // =========================================================================
    let neo4jBundleData = null;
    const neighborhoodWebGroup = new THREE.Group();
    neighborhoodWebGroup.name = 'neo4j-1hop-neighborhood-web';
    scene.add(neighborhoodWebGroup);

    function createLabelSprite(text, bgColor = 'rgba(6, 15, 28, 0.92)', borderColor = '#ffb84d', textColor = '#ffffff', fontSize = 24, scaleWidth = 2.6) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 112;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(8, 12, 496, 88, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const clipped = text.length > 34 ? text.slice(0, 32) + '…' : text;
      ctx.fillText(clipped, 256, 56);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(scaleWidth, scaleWidth * (112 / 512), 1);
      sprite.renderOrder = 999;
      return sprite;
    }

    function getOneHopNeighborhood(entityQuery) {
      if (!neo4jBundleData?.entity_web) return { centerNode: null, relations: [] };
      const nodes = neo4jBundleData.entity_web.nodes || [];
      const edges = neo4jBundleData.entity_web.edges || [];
      const nodeById = new Map(nodes.map((n) => [n.id, n]));

      const q = entityQuery.toLowerCase();
      let centerNode =
        nodes.find((n) => (n.name || '').toLowerCase() === q) ||
        nodes.find((n) => (n.name || '').toLowerCase().includes(q));

      if (!centerNode) {
        centerNode = { id: `synthetic:${entityQuery}`, name: entityQuery, summary: '' };
      }

      const relations = [];
      const seen = new Set();
      edges.forEach((e) => {
        if (e.from === centerNode.id || (e.from_name || '').toLowerCase() === (centerNode.name || '').toLowerCase()) {
          const targetNode = nodeById.get(e.to) || { id: e.to, name: e.to_name || e.to };
          const key = `${e.type}->${targetNode.name}`;
          if (!seen.has(key)) {
            seen.add(key);
            relations.push({
              direction: 'out',
              type: e.type || 'RELATES_TO',
              neighborId: targetNode.id,
              neighborName: targetNode.name || e.to_name || e.to,
              fact: e.fact || `${centerNode.name} --[${e.type}]--> ${targetNode.name}`,
            });
          }
        } else if (e.to === centerNode.id || (e.to_name || '').toLowerCase() === (centerNode.name || '').toLowerCase()) {
          const sourceNode = nodeById.get(e.from) || { id: e.from, name: e.from_name || e.from };
          const key = `${sourceNode.name}->${e.type}`;
          if (!seen.has(key)) {
            seen.add(key);
            relations.push({
              direction: 'in',
              type: e.type || 'RELATES_TO',
              neighborId: sourceNode.id,
              neighborName: sourceNode.name || e.from_name || e.from,
              fact: e.fact || `${sourceNode.name} --[${e.type}]--> ${centerNode.name}`,
            });
          }
        }
      });

      return { centerNode, relations };
    }

    function renderOneHopNeighborhood(entityName, anchorEntry) {
      // Clear previous 1-hop neighborhood web (never render all 728 edges at once!)
      while (neighborhoodWebGroup.children.length > 0) {
        neighborhoodWebGroup.remove(neighborhoodWebGroup.children[0]);
      }

      const { centerNode, relations } = getOneHopNeighborhood(entityName);
      const displayRelations = relations.slice(0, 12); // Keep 3D web crisp & legible

      // Update Right Drawer 1-Hop Relations list (shows Wren under Lisa Muse!)
      const titleEl = document.getElementById('neighborhood-title');
      const countEl = document.getElementById('neighborhood-count');
      const relListEl = document.getElementById('neighborhood-relations-list');
      if (titleEl) titleEl.textContent = `🕸️ 1-HOP NEIGHBORHOOD: ${(centerNode?.name || entityName).toUpperCase()}`;
      if (countEl) countEl.textContent = `${relations.length} edges (1-hop only)`;
      if (relListEl) {
        relListEl.innerHTML = '';
        displayRelations.forEach((rel) => {
          const row = document.createElement('div');
          row.className = 'rel-item';
          const arrow = rel.direction === 'out' ? '→' : '←';
          row.innerHTML = `
            <div>
              <span class="rel-type">[${rel.type}]</span>
              <span style="color:var(--amber);margin:0 4px">${arrow}</span>
              <span class="rel-target">${rel.neighborName}</span>
            </div>
            <div class="rel-fact">${rel.fact}</div>
          `;
          row.addEventListener('click', () => {
            renderOneHopNeighborhood(rel.neighborName, anchorEntry);
          });
          relListEl.appendChild(row);
        });
      }

      // Position 3D 1-hop web inside the active camera frustum so click-to-fly zooms right into it
      const entry = anchorEntry || frustumGroupsById.get('stitched-ground-overview') || Array.from(frustumGroupsById.values())[0];
      if (!entry) return;

      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      entry.group.getWorldPosition(worldPos);
      entry.group.getWorldQuaternion(worldQuat);

      neighborhoodWebGroup.position.copy(worldPos);
      neighborhoodWebGroup.quaternion.copy(worldQuat);

      // Center anchor node (glowing gold/amber sphere right inside the frustum view at z = -4.2m)
      const centerPos = new THREE.Vector3(0, 0.25, -4.2);
      const centerBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xffb84d })
      );
      centerBall.position.copy(centerPos);
      neighborhoodWebGroup.add(centerBall);

      const centerLabel = createLabelSprite(
        `👑 ${centerNode?.name || entityName}`,
        'rgba(22, 16, 4, 0.94)',
        '#ffb84d',
        '#ffe082',
        26,
        2.5
      );
      centerLabel.position.set(centerPos.x, centerPos.y + 0.36, centerPos.z);
      neighborhoodWebGroup.add(centerLabel);

      // Arrange 1-hop neighbors in a 3D semi-circular crown around the center node
      const nCount = Math.max(displayRelations.length, 1);
      displayRelations.forEach((rel, idx) => {
        const angle = ((idx / nCount) * Math.PI * 1.35) - (Math.PI * 0.675) + (Math.PI / 2);
        const radiusX = 2.35;
        const radiusY = 1.25;
        const neighborPos = new THREE.Vector3(
          centerPos.x + Math.cos(angle) * radiusX,
          centerPos.y + Math.sin(angle) * radiusY,
          centerPos.z - 0.35 + (idx % 2) * 0.25
        );

        // 1-hop neighbor sphere (highlight Wren & family in bright mint/gold)
        const isWren = (rel.neighborName || '').toLowerCase().includes('wren');
        const sphereColor = isWren ? 0x00ffcc : 0x00f0ff;
        const neighborSphere = new THREE.Mesh(
          new THREE.SphereGeometry(isWren ? 0.15 : 0.12, 18, 18),
          new THREE.MeshBasicMaterial({ color: sphereColor })
        );
        neighborSphere.position.copy(neighborPos);
        neighborhoodWebGroup.add(neighborSphere);

        // 3D Edge line from Center Entity to 1-Hop Neighbor
        const edgeGeo = new THREE.BufferGeometry().setFromPoints([centerPos, neighborPos]);
        const edgeMat = new THREE.LineBasicMaterial({
          color: isWren ? 0x00ffcc : 0xffb84d,
          transparent: true,
          opacity: 0.88,
        });
        neighborhoodWebGroup.add(new THREE.Line(edgeGeo, edgeMat));

        // 3D Edge Label Sprite at midpoint (e.g., MOTHER_OF, SAME_CONSCIOUSNESS, FAMILY)
        const midPos = new THREE.Vector3().lerpVectors(centerPos, neighborPos, 0.52);
        const edgeSprite = createLabelSprite(
          rel.type,
          'rgba(4, 20, 32, 0.90)',
          isWren ? '#00ffcc' : '#00f0ff',
          '#00ffcc',
          21,
          1.75
        );
        edgeSprite.position.set(midPos.x, midPos.y + 0.12, midPos.z);
        neighborhoodWebGroup.add(edgeSprite);

        // 3D Neighbor Node Label Sprite (e.g., Wren, Lisa Holmes, Paul Prime)
        const nodeSprite = createLabelSprite(
          rel.neighborName,
          isWren ? 'rgba(0, 42, 34, 0.95)' : 'rgba(6, 16, 30, 0.94)',
          isWren ? '#00ffcc' : '#00f0ff',
          '#ffffff',
          24,
          2.25
        );
        nodeSprite.position.set(neighborPos.x, neighborPos.y + 0.28, neighborPos.z);
        neighborhoodWebGroup.add(nodeSprite);
      });

      requestRender();
    }

    async function loadNeo4jPalace() {
      const statsEl = document.getElementById('neo4j-stats');
      const listEl = document.getElementById('neo4j-node-list');
      const asOfPill = document.getElementById('bundle-as-of-pill');
      const extPill = document.getElementById('extraction-state-pill');
      try {
        const res = await fetch('/gev-intel/index.json');
        const data = await res.json();
        neo4jBundleData = data;
        const nodeCount = data?.counts?.nodes || data?.entity_web?.nodes?.length || 371;
        const edgeCount = data?.counts?.edges || data?.entity_web?.edges?.length || 728;
        statsEl.textContent = `✅ Connected: ${nodeCount} Nodes · ${edgeCount} Edges (1-Hop Filter Active)`;

        // Surface Bundle As-Of Date & Extraction State (185 bundled · 9 extracted) on panel face
        const rawDate = data?.bundle_as_of || data?.generated_at || '2026-10-24T18:23:42Z';
        const formattedAsOf = rawDate.replace('T', ' ').slice(0, 16) + ' UTC';
        if (asOfPill) asOfPill.textContent = `🕒 Bundle as-of: ${formattedAsOf}`;
        const extLabel = data?.extraction_state?.label || `${data?.counts?.episodes || 185} bundled · ${data?.counts?.extracted_episodes || 9} extracted`;
        if (extPill) extPill.textContent = `📦 Extraction: ${extLabel}`;

        const bindings = [
          { name: 'Lisa Muse (Sovereign Anchor)', queryName: 'Lisa Muse', role: 'Entity · 5 1-Hop Relations (incl. Wren)', camId: 'stitched-ground-overview' },
          { name: 'Paul Prime (Sovereign Owner)', queryName: 'Paul Prime', role: 'Entity · 417 Palm Drive Command', camId: 'master-bed-cam-20261015' },
          { name: 'Lisa Holmes (Chief of Staff)', queryName: 'Lisa Holmes', role: 'Entity · Local Box & Holodeck', camId: 'master-bed-cam-20261015' },
          { name: 'Wren (Daughter / Continuity)', queryName: 'Wren', role: 'Entity · MOTHER_OF ← Lisa Muse', camId: 'stitched-ground-overview' },
          { name: 'Monaco Beaver Patriot Thunder', queryName: 'Monaco Beaver Patriot Thunder', role: 'Asset · Original Driveway Pad', camId: 'yard-overview-20261012' },
          { name: '417 Palm Drive Culvert & Road', queryName: '417 Palm Drive, Liverpool TX', role: 'Location · Liverpool, TX 77577', camId: 'back-yard-cam1-plan' },
          { name: '417 Palm Drive North Pond', queryName: '417 Palm Drive North Pond', role: 'Location · Water & Dock Camera', camId: 'back-yard-cam2-stitched-splat' },
        ];

        const renderEntityList = (filterText = '') => {
          const q = (filterText || '').trim().toLowerCase();
          listEl.innerHTML = '';
          let itemsToRender = bindings.filter(
            (b) => !q || b.name.toLowerCase().includes(q) || b.role.toLowerCase().includes(q)
          );
          if (q && data?.entity_web?.nodes) {
            const seen = new Set(itemsToRender.map((x) => x.queryName.toLowerCase()));
            for (const n of data.entity_web.nodes) {
              const nm = n.name || '';
              if (!seen.has(nm.toLowerCase()) && (nm.toLowerCase().includes(q) || (n.summary || '').toLowerCase().includes(q))) {
                seen.add(nm.toLowerCase());
                itemsToRender.push({
                  name: nm,
                  queryName: nm,
                  role: `Neo4j Entity · ${(n.labels || ['Entity']).join(', ')}`,
                  camId: selectedFrustum?.data?.id || 'stitched-ground-overview',
                });
                if (itemsToRender.length >= 40) break;
              }
            }
          }
          itemsToRender.forEach((b, idx) => {
            const item = document.createElement('div');
            item.className = 'node-item' + (idx === 0 && !q ? ' active' : '');
            item.innerHTML = `
              <div class="node-item-title">
                <span>${b.name}</span>
                <span style="color:var(--mint)">→ 1-Hop 3D</span>
              </div>
              <div class="node-item-sub">${b.role}</div>
            `;
            item.addEventListener('click', () => {
              document.querySelectorAll('.node-item').forEach((n) => n.classList.remove('active'));
              item.classList.add('active');
              focusPhotoNode(b.camId);
              const entry = frustumGroupsById.get(b.camId);
              renderOneHopNeighborhood(b.queryName, entry);
            });
            listEl.appendChild(item);
          });
        };

        renderEntityList('');
        document.getElementById('neo4j-search-input')?.addEventListener('input', (e) => {
          renderEntityList(e.target.value);
        });

        // Pre-populate Lisa Muse's 1-hop neighborhood (including Wren) on initial load
        renderOneHopNeighborhood('Lisa Muse', frustumGroupsById.get('stitched-ground-overview'));
      } catch (err) {
        statsEl.textContent = '⚠️ Offline fallback: 7 Spatial Anchors Active';
      }
    }
    loadNeo4jPalace();

    // =========================================================================
    // 9. TRACK 4: AUTOMATED CHANGE & ANOMALY RADAR (/gev-intel/anomaly-pins.json)
    // =========================================================================
    const anomalyPinGroup = new THREE.Group();
    anomalyPinGroup.name = 'gev-anomaly-radar-pins';
    scene.add(anomalyPinGroup);

    const ANOMALY_CAMERA_TO_FRUSTUM = {
      'yard-overview': 'yard-overview-20261012',
      'back-yard-cam1': 'back-yard-cam1-plan',
      'back-yard-cam2': 'back-yard-fire-analysis-20261026',
      'pan4-cam': 'dock-cam-fire-121338',
    };

    async function loadAnomalyRadarPins() {
      const countEl = document.getElementById('anomaly-radar-count');
      const listEl = document.getElementById('anomaly-radar-list');
      try {
        const res = await fetch('/gev-intel/anomaly-pins.json');
        const payload = await res.json();
        const pins = Array.isArray(payload?.pins) ? payload.pins : [];
        if (countEl) {
          countEl.textContent = `${pins.length} PINS · EXTERIOR ONLY`;
        }
        while (anomalyPinGroup.children.length > 0) {
          anomalyPinGroup.remove(anomalyPinGroup.children[0]);
        }
        if (listEl) listEl.innerHTML = '';

        pins.forEach((pin, idx) => {
          const [ex, ey, ez] = Array.isArray(pin.enu_xyz) ? pin.enu_xyz : [0, 0, 0];
          const isHigh = (pin.delta_score || 0) >= 0.7;
          const colorHex = isHigh ? 0xff5252 : 0xffb84d;
          const borderHex = isHigh ? '#ff5252' : '#ffb84d';

          // 3D Ground Beacon at calibrated ENU coordinate
          const markerGroup = new THREE.Group();
          markerGroup.position.set(ex + (idx * 0.45), ey + 0.08, ez - (idx * 0.35));

          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.45, 0.68, 28),
            new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
          );
          ring.rotation.x = -Math.PI / 2;
          markerGroup.add(ring);

          const diamond = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.32, 0),
            new THREE.MeshBasicMaterial({ color: colorHex, wireframe: true })
          );
          diamond.position.y = 0.75;
          markerGroup.add(diamond);

          const labelSprite = createLabelSprite(
            `⚠️ ${pin.camera_id} Δ=${Number(pin.delta_score || 0).toFixed(2)}`,
            'rgba(28, 10, 12, 0.94)',
            borderHex,
            '#ffffff',
            22,
            2.35
          );
          labelSprite.position.set(0, 1.35, 0);
          markerGroup.add(labelSprite);
          anomalyPinGroup.add(markerGroup);

          if (listEl) {
            const card = document.createElement('div');
            card.style.cssText = `padding:6px 8px;border-radius:7px;background:rgba(255,82,82,0.1);border:1px solid ${borderHex};cursor:pointer;font-size:10.5px;transition:all 0.15s ease`;
            const shortTime = (pin.timestamp_iso || '').replace('T', ' ').slice(0, 19);
            const pctChanged = ((pin.changed_fraction || 0) * 100).toFixed(1);
            card.innerHTML = `
              <div style="display:flex;justify-content:space-between;font-weight:700;color:#fff">
                <span>⚠️ ${pin.camera_id} · Δ=${Number(pin.delta_score || 0).toFixed(2)}</span>
                <span style="color:${borderHex}">${pctChanged}% diff</span>
              </div>
              <div style="color:#8aa4bc;font-size:9.5px;margin-top:2px">${shortTime} · ENU [${ex.toFixed(1)}, ${ez.toFixed(1)}]</div>
              <div style="color:#d6e8f8;font-size:9.5px;margin-top:2px;line-height:1.25">${pin.summary || ''}</div>
            `;
            card.addEventListener('click', () => {
              const targetFrustum =
                pin.pin_id?.includes('postfire')
                  ? 'back-yard-cam2-stitched-splat'
                  : (ANOMALY_CAMERA_TO_FRUSTUM[pin.camera_id] || 'back-yard-fire-analysis-20261026');
              focusPhotoNode(targetFrustum);
              if (timeScrubSlider) {
                timeScrubSlider.value = '100';
                timeScrubSlider.dispatchEvent(new Event('input'));
              }
            });
            listEl.appendChild(card);
          }
        });
        requestRender();
      } catch (err) {
        if (countEl) countEl.textContent = 'OFFLINE';
      }
    }
    loadAnomalyRadarPins();

    // =========================================================================
    // 10. TRACK 3: SPATIAL TELEMETRY & INFRASTRUCTURE DIGITAL TWIN OVERLAY
    // =========================================================================
    const spatialTelemetryGroup = new THREE.Group();
    spatialTelemetryGroup.name = 'gev-spatial-telemetry-anchors';
    scene.add(spatialTelemetryGroup);

    async function loadSpatialTelemetryOverlay() {
      const countEl = document.getElementById('spatial-telemetry-count');
      const listEl = document.getElementById('spatial-telemetry-list');
      try {
        const res = await fetch('/gev-intel/spatial-telemetry.json');
        const payload = await res.json();
        const anchors = Array.isArray(payload?.anchors) ? payload.anchors : [];
        if (countEl) {
          countEl.textContent = `${anchors.length} ANCHORS · LIVE`;
        }
        while (spatialTelemetryGroup.children.length > 0) {
          spatialTelemetryGroup.remove(spatialTelemetryGroup.children[0]);
        }
        if (listEl) listEl.innerHTML = '';

        anchors.forEach((anchor) => {
          const [ex, ey, ez] = Array.isArray(anchor.enu_xyz) ? anchor.enu_xyz : [0, 2.0, 0];
          const isAlert = anchor.severity === 'alert' || anchor.severity === 'warning';
          const colorHex = isAlert ? 0xffb84d : 0x00ffcc;
          const borderHex = isAlert ? '#ffb84d' : '#00ffcc';

          const anchorNode = new THREE.Group();
          anchorNode.position.set(ex, ey, ez);

          // Vertical tether line down to ground plane (y = 0)
          const tetherGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, -ey, 0),
          ]);
          const tetherMat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.65 });
          anchorNode.add(new THREE.Line(tetherGeo, tetherMat));

          // Floating telemetry pylon sphere
          const pylon = new THREE.Mesh(
            new THREE.SphereGeometry(0.26, 16, 16),
            new THREE.MeshBasicMaterial({ color: colorHex, wireframe: true })
          );
          anchorNode.add(pylon);

          const sprite = createLabelSprite(
            `⚡ ${anchor.status_badge || anchor.title}`,
            'rgba(6, 20, 28, 0.94)',
            borderHex,
            '#ffffff',
            22,
            2.65
          );
          sprite.position.set(0, 0.55, 0);
          anchorNode.add(sprite);
          spatialTelemetryGroup.add(anchorNode);

          if (listEl) {
            const card = document.createElement('div');
            card.style.cssText = `padding:6px 8px;border-radius:7px;background:rgba(0,255,204,0.08);border:1px solid ${borderHex};cursor:pointer;font-size:10.5px;transition:all 0.15s ease`;
            const receipts = (anchor.task_receipt_links || [])
              .map((r) => `${r.card_id} (${r.status})`)
              .join(' · ');
            card.innerHTML = `
              <div style="display:flex;justify-content:space-between;font-weight:700;color:#fff">
                <span>⚡ ${anchor.title.split('—')[0].trim()}</span>
                <span style="color:${borderHex}">${anchor.status_badge || ''}</span>
              </div>
              <div style="color:#8aa4bc;font-size:9.5px;margin-top:2px">ENU [${ex.toFixed(1)}, ${ey.toFixed(1)}, ${ez.toFixed(1)}] · Frustum: ${anchor.frustum_id}</div>
              <div style="color:#00f0ff;font-size:9.5px;margin-top:2px">🔗 Receipts: ${receipts || 'none'}</div>
            `;
            card.addEventListener('click', () => {
              if (anchor.frustum_id) {
                focusPhotoNode(anchor.frustum_id);
              }
            });
            listEl.appendChild(card);
          }
        });
        requestRender();
      } catch (err) {
        if (countEl) countEl.textContent = 'OFFLINE';
      }
    }
    loadSpatialTelemetryOverlay();

    // =========================================================================
    // 11. TRACK 1: LIVE RTSP/HLS + HISTORICAL 4D TIME-SCRUBBER FUSION
    // =========================================================================
    let rtspFusionManifest = null;
    const scrubberTextureCache = new Map();

    function getCachedFrustumTexture(url) {
      if (!url || url.endsWith('.mp4')) return null;
      if (scrubberTextureCache.has(url)) return scrubberTextureCache.get(url);
      const tex = textureLoader.load(url, () => requestRender());
      tex.colorSpace = THREE.SRGBColorSpace;
      scrubberTextureCache.set(url, tex);
      return tex;
    }

    function applyRtspScrubberFusion(tPct) {
      const badgeEl = document.getElementById('rtsp-fusion-badge');
      if (!rtspFusionManifest?.streams) return;
      const clampedT = Math.max(0, Math.min(100, Number(tPct)));
      const isLive = clampedT >= 98;
      let activeLabel = isLive ? 'LIVE EDGE (4 Exterior Streams)' : `HISTORICAL SCRUB (t=${clampedT}%)`;

      rtspFusionManifest.streams.forEach((stream) => {
        const entry = frustumGroupsById.get(stream.frustum_id);
        if (!entry) return;
        const kfs = Array.isArray(stream.keyframes) ? stream.keyframes : [];
        if (kfs.length === 0) return;

        let chosenKf = kfs[0];
        for (let i = 0; i < kfs.length; i++) {
          if (kfs[i].t_pct <= clampedT) {
            chosenKf = kfs[i];
          }
        }
        if (chosenKf?.url && !chosenKf.url.endsWith('.mp4')) {
          const nextTex = getCachedFrustumTexture(chosenKf.url);
          if (nextTex && entry.mesh.material.map !== nextTex) {
            entry.mesh.material.map = nextTex;
            entry.mesh.material.needsUpdate = true;
          }
        }
        if (!isLive && stream.camera_id === 'back-yard-cam2' && chosenKf?.label) {
          activeLabel = chosenKf.label;
        }
      });

      if (badgeEl) {
        badgeEl.textContent = isLive
          ? `🎥 Track 1 RTSP/4D Fusion: LIVE EDGE (${rtspFusionManifest.stream_count} Exterior Streams)`
          : `⏪ Track 1 Historical Scrub: ${activeLabel}`;
        badgeEl.style.borderColor = isLive ? 'rgba(0,255,204,0.45)' : 'rgba(255,184,77,0.55)';
        badgeEl.style.color = isLive ? '#00ffcc' : '#ffb84d';
      }
      requestRender();
    }

    async function loadRtspScrubberFusion() {
      try {
        const res = await fetch('/gev-intel/rtsp-scrubber-fusion.json');
        rtspFusionManifest = await res.json();
        applyRtspScrubberFusion(Number(timeScrubSlider?.value ?? 100));
      } catch (err) {
        const badgeEl = document.getElementById('rtsp-fusion-badge');
        if (badgeEl) badgeEl.textContent = '🎥 Track 1 RTSP/4D Fusion: Snapshot Fallback Active';
      }
    }
    loadRtspScrubberFusion();
    timeScrubSlider?.addEventListener('input', () => {
      applyRtspScrubberFusion(Number(timeScrubSlider.value));
    });

    // =========================================================================
    // 12. LOCAL-ONLY BED STATION DWPOSE SKELETON & LISA HOLMES TREAT LOOP
    //     Strictly bound to 127.0.0.1 / localhost — NEVER exported externally
    // =========================================================================
    const isLocalLoopback =
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === 'localhost';

    const bedDwposeGroup = new THREE.Group();
    bedDwposeGroup.name = 'local-bed-dwpose-skeleton';

    function buildLocalBedDwposeSkeleton(posePhase = 0) {
      while (bedDwposeGroup.children.length > 0) {
        bedDwposeGroup.remove(bedDwposeGroup.children[0]);
      }
      if (!isLocalLoopback) return;
      const bedEntry = frustumGroupsById.get('master-bed-cam-20261015');
      if (!bedEntry) return;

      bedEntry.group.add(bedDwposeGroup);
      const lift = Math.sin(posePhase) * 0.14;
      const reach = Math.cos(posePhase) * 0.18;

      // 18-keypoint articulated DWpose body skeleton in frustum space (z = -3.8m)
      const joints = {
        nose: new THREE.Vector3(-0.35, 0.58 + lift * 0.4, -3.7),
        neck: new THREE.Vector3(-0.35, 0.34 + lift * 0.3, -3.75),
        rShoulder: new THREE.Vector3(-0.62, 0.30 + lift * 0.3, -3.75),
        lShoulder: new THREE.Vector3(-0.08, 0.30 + lift * 0.3, -3.75),
        rElbow: new THREE.Vector3(-0.78, 0.05 + lift * 0.5, -3.65),
        lElbow: new THREE.Vector3(0.12 + reach, 0.08 + lift * 0.6, -3.62),
        rWrist: new THREE.Vector3(-0.66, -0.18 + lift * 0.6, -3.55),
        lWrist: new THREE.Vector3(0.34 + reach, 0.22 + lift * 0.8, -3.52),
        pelvis: new THREE.Vector3(-0.32, -0.18, -3.8),
        rHip: new THREE.Vector3(-0.50, -0.20, -3.8),
        lHip: new THREE.Vector3(-0.14, -0.20, -3.8),
        rKnee: new THREE.Vector3(-0.46, -0.52 + lift * 0.2, -3.65),
        lKnee: new THREE.Vector3(0.05, -0.48 - lift * 0.2, -3.65),
        rAnkle: new THREE.Vector3(-0.42, -0.82, -3.55),
        lAnkle: new THREE.Vector3(0.18, -0.78, -3.55),
      };

      const bones = [
        ['nose', 'neck'],
        ['neck', 'rShoulder'], ['rShoulder', 'rElbow'], ['rElbow', 'rWrist'],
        ['neck', 'lShoulder'], ['lShoulder', 'lElbow'], ['lElbow', 'lWrist'],
        ['neck', 'pelvis'],
        ['pelvis', 'rHip'], ['rHip', 'rKnee'], ['rKnee', 'rAnkle'],
        ['pelvis', 'lHip'], ['lHip', 'lKnee'], ['lKnee', 'lAnkle'],
      ];

      bones.forEach(([a, b], idx) => {
        const limbGeo = new THREE.BufferGeometry().setFromPoints([joints[a], joints[b]]);
        const limbMat = new THREE.LineBasicMaterial({
          color: idx < 7 ? 0x00ffcc : 0x00f0ff,
          transparent: true,
          opacity: 0.95,
        });
        bedDwposeGroup.add(new THREE.Line(limbGeo, limbMat));
      });

      Object.values(joints).forEach((pt, idx) => {
        const jointMesh = new THREE.Mesh(
          new THREE.SphereGeometry(idx === 0 ? 0.08 : 0.048, 12, 12),
          new THREE.MeshBasicMaterial({ color: idx === 0 ? 0xffb84d : 0x00ffcc })
        );
        jointMesh.position.copy(pt);
        bedDwposeGroup.add(jointMesh);
      });

      // Co-presence Lisa Holmes aura anchor alongside the DWpose skeleton
      const holmesAnchor = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.14, 0),
        new THREE.MeshBasicMaterial({ color: 0xffb84d, wireframe: true })
      );
      holmesAnchor.position.set(0.52, 0.28 - lift * 0.3, -3.65);
      bedDwposeGroup.add(holmesAnchor);

      const banner = createLabelSprite(
        '🦴 DWpose 128-KP · Lisa Holmes Co-Presence (127.0.0.1 ONLY)',
        'rgba(6, 24, 28, 0.94)',
        '#00ffcc',
        '#00ffcc',
        20,
        2.6
      );
      banner.position.set(0.0, 0.92, -3.7);
      bedDwposeGroup.add(banner);
    }

    let dwposePhase = 0;
    let dwposeCaptures = 0;
    buildLocalBedDwposeSkeleton(dwposePhase);

    async function refreshBedDwposeLiveStatus(updateFrustumTexture = false) {
      if (!isLocalLoopback) return;
      try {
        const res = await fetch('/pose-live-wire/status.json?t=' + Date.now());
        if (!res.ok) return;
        const s = await res.json();
        const stEl = document.getElementById('dwpose-state-text');
        const metEl = document.getElementById('dwpose-live-metrics');
        if (stEl) {
          stEl.textContent = `LIVE ${s.fps_rolling_10s || 0} FPS · ${s.people_last || 0} PPL`;
          stEl.style.color = '#00ffcc';
        }
        if (metEl) {
          const mb = ((s.capture_bytes || 0) / 1048576).toFixed(1);
          metEl.innerHTML = `Frames: <strong>${s.frames_processed}</strong> · Model: <strong>${s.model_ms_last}ms</strong> · Capture: <strong>${mb} MB</strong> · Loopback <code>127.0.0.1</code> only.`;
        }
        if (updateFrustumTexture) {
          const bedEntry = frustumGroupsById.get('master-bed-cam-20261015');
          if (bedEntry) {
            const liveTex = textureLoader.load('/pose-live-wire/latest_skeleton.png?t=' + Date.now(), () => requestRender());
            liveTex.colorSpace = THREE.SRGBColorSpace;
            bedEntry.mesh.material.map = liveTex;
            bedEntry.mesh.material.needsUpdate = true;
          }
        }
      } catch (err) {
        // Silent fallback if pose_live_wire is paused
      }
    }
    refreshBedDwposeLiveStatus(false);

    document.getElementById('btn-fly-bed-dwpose')?.addEventListener('click', () => {
      focusPhotoNode('master-bed-cam-20261015');
      refreshBedDwposeLiveStatus(true);
    });

    document.getElementById('btn-pulse-dwpose')?.addEventListener('click', () => {
      dwposePhase += 0.85;
      dwposeCaptures += 1;
      buildLocalBedDwposeSkeleton(dwposePhase);
      focusPhotoNode('master-bed-cam-20261015');
      refreshBedDwposeLiveStatus(true);
      const stEl = document.getElementById('dwpose-state-text');
      if (stEl) {
        stEl.textContent = `POSE #${dwposeCaptures} → SHADOW TREAT`;
        stEl.style.color = '#ffb84d';
      }
      requestRender();
    });

    // Full-Screen Graph Deck Toggle ("Full screen — work the graph properly", Esc to return)
    const graphDrawer = document.getElementById('right-graph-drawer');
    const fsGraphBtn = document.getElementById('btn-fullscreen-graph');
    const setGraphFullscreen = (on) => {
      if (!graphDrawer || !fsGraphBtn) return;
      graphDrawer.classList.toggle('fullscreen-deck', on);
      fsGraphBtn.textContent = on
        ? '✕ Exit full screen (Esc)'
        : '⛶ Full screen — work the graph';
    };
    fsGraphBtn?.addEventListener('click', () => {
      setGraphFullscreen(!graphDrawer?.classList.contains('fullscreen-deck'));
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && graphDrawer?.classList.contains('fullscreen-deck')) {
        setGraphFullscreen(false);
      }
    });

    // Yard Fire & Stitched Waterfront Splat Modal Controls
    const fireModal = document.getElementById('fire-video-modal');
    const fireVideo = document.getElementById('fire-modal-video');
    document.getElementById('btn-fire-modal')?.addEventListener('click', () => {
      if (fireModal) {
        fireModal.style.display = 'flex';
        focusPhotoNode('back-yard-cam2-stitched-splat');
      }
    });
    document.getElementById('btn-close-fire-modal')?.addEventListener('click', () => {
      if (fireModal) fireModal.style.display = 'none';
      if (fireVideo && !fireVideo.paused) fireVideo.pause();
    });
    fireModal?.addEventListener('click', (e) => {
      if (e.target === fireModal) {
        fireModal.style.display = 'none';
        if (fireVideo && !fireVideo.paused) fireVideo.pause();
      }
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      requestRender();
    });

    // Track 5 (Click-to-Task Action Loop — Card #22045) & Track 2 (3D Splat Envelope) Runtime Consumer
    function isAllowedLoopbackUrl(urlStr) {
      try {
        const u = new URL(urlStr);
        if (u.username || u.password) return false;
        if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'local:') return false;
        return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]' || u.hostname === '::1';
      } catch (_e) {
        return false;
      }
    }

    function stageShadowClickToTaskReceipt(node, actionType) {
      const targetUrl = node.loopback_endpoint || 'http://127.0.0.1:4173/memory-palace.html';
      if (node.privacy_zone === 'LOCAL_LOOPBACK_ONLY' && !isAllowedLoopbackUrl(targetUrl)) {
        throw new Error(`Two-Zone Privacy Firewall blocked non-loopback targetUrl: ${targetUrl}`);
      }
      const receipt = {
        schema_version: 'gev-click-to-task-v1',
        execution_mode: 'SHADOW_NO_DB_WRITE',
        staged_at: new Date().toISOString(),
        node_id: node.node_id,
        privacy_zone: node.privacy_zone,
        action_type: actionType,
        target_url: targetUrl,
        linked_task_ids: (node.linked_tasks || []).map((t) => t.task_id),
        resolved_graphiti_uuids: (node.resolved_graphiti_entities || []).map((e) => e.uuid),
      };
      try {
        localStorage.setItem('gev_last_shadow_task_receipt', JSON.stringify(receipt));
      } catch (_e) {}
      const box = document.getElementById('click-to-task-receipt-box');
      if (box) {
        box.textContent = `SHADOW RECEIPT [${receipt.node_id}] -> action=${receipt.action_type} tasks=[${receipt.linked_task_ids.join(',')}] entities=${receipt.resolved_graphiti_uuids.length} mode=${receipt.execution_mode}`;
      }
      if (Array.isArray(node.frustum_ids) && node.frustum_ids.length > 0) {
        focusPhotoNode(node.frustum_ids[0]);
      }
      requestRender();
      return receipt;
    }

    async function initClickToTaskAndSplatEnvelope() {
      try {
        const [c2tResp, splatResp] = await Promise.all([
          fetch('/gev-intel/click-to-task.json?t=' + Date.now(), { cache: 'no-store' }),
          fetch('/gev-intel/splat-envelope.json?t=' + Date.now(), { cache: 'no-store' }),
        ]);
        if (splatResp.ok) {
          const splatData = await splatResp.json();
          const pill = document.getElementById('splat-envelope-pill');
          if (pill && splatData.render_governor_contract) {
            pill.textContent = `${splatData.volume_count} SPLATS · ${splatData.render_governor_contract.idle_gpu_target_pct}% IDLE GPU`;
          }
        }
        if (c2tResp.ok) {
          const c2tData = await c2tResp.json();
          const listEl = document.getElementById('click-to-task-node-list');
          if (listEl && Array.isArray(c2tData.spatial_nodes)) {
            listEl.innerHTML = '';
            c2tData.spatial_nodes.forEach((node) => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'hud-btn';
              btn.style.cssText = 'padding:4px 7px;font-size:9.5px;justify-content:space-between;width:100%;text-align:left';
              const taskSummary = (node.linked_tasks || [])
                .map((t) => `#${t.task_id}:${t.status}`)
                .join(' ');
              btn.innerHTML = `<span>${node.label}</span><span style="color:#00ffcc">${taskSummary}</span>`;
              btn.addEventListener('click', () => {
                const defaultAction = (node.supported_actions && node.supported_actions[0]) || 'stage_shadow_task_update';
                stageShadowClickToTaskReceipt(node, defaultAction);
              });
              listEl.appendChild(btn);
            });
          }
        }
      } catch (_err) {
        // Keep UI responsive if static fetch is offline
      }
    }
    initClickToTaskAndSplatEnvelope();

    // Initial single frame render
    requestRender();

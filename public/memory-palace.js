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
    // 8. LOAD LIVE NEO4J GRAPHITI BUNDLE (/gev-intel/index.json)
    // =========================================================================
    async function loadNeo4jPalace() {
      const statsEl = document.getElementById('neo4j-stats');
      const listEl = document.getElementById('neo4j-node-list');
      try {
        const res = await fetch('/gev-intel/index.json');
        const data = await res.json();
        const nodeCount = data?.counts?.nodes || data?.nodes?.length || 371;
        const edgeCount = data?.counts?.edges || data?.edges?.length || 728;
        statsEl.textContent = `✅ Connected: ${nodeCount} Nodes · ${edgeCount} Edges (Graphiti Neo4j)`;

        const bindings = [
          { name: 'Paul Prime (Sovereign Owner)', role: 'Entity · 417 Palm Drive Command', camId: 'master-bed-cam-20261015' },
          { name: 'Lisa Muse (Sovereign Anchor)', role: 'Entity · 29.2475°N, -95.2314°W', camId: 'stitched-ground-overview' },
          { name: 'Lisa Holmes (Chief of Staff)', role: 'Entity · Local Box & Holodeck', camId: 'master-bed-cam-20261015' },
          { name: 'Monaco Beaver Patriot Thunder', role: 'Asset · Original Driveway Pad', camId: 'yard-overview-20261012' },
          { name: '417 Palm Drive Culvert & Road', role: 'Location · Liverpool, TX 77577', camId: 'back-yard-cam1-plan' },
          { name: '417 Palm Drive North Pond', role: 'Location · Water & Dock Camera', camId: 'back-yard-cam2-water' },
          { name: 'EcoFlow Solar & Miners Bank', role: 'Infrastructure · West Utility Wall', camId: 'house-side-20261015' },
        ];

        listEl.innerHTML = '';
        bindings.forEach((b) => {
          const item = document.createElement('div');
          item.className = 'node-item';
          item.innerHTML = `
            <div class="node-item-title">
              <span>${b.name}</span>
              <span style="color:var(--mint)">→ 3D</span>
            </div>
            <div class="node-item-sub">${b.role}</div>
          `;
          item.addEventListener('click', () => {
            document.querySelectorAll('.node-item').forEach((n) => n.classList.remove('active'));
            item.classList.add('active');
            focusPhotoNode(b.camId);
          });
          listEl.appendChild(item);
        });
      } catch (err) {
        statsEl.textContent = '⚠️ Offline fallback: 7 Spatial Anchors Active';
      }
    }
    loadNeo4jPalace();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      requestRender();
    });

    // Initial single frame render
    requestRender();

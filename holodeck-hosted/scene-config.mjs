const DEFAULT_BOUNDS = {
    minX: -50.0,
    maxX: 50.0,
    minZ: -50.0,
    maxZ: 50.0,
};

/** Build safe navigation defaults for a scene that is not in the database. */
export function createFallbackScene(file) {
    const normalizedFile = file.toLowerCase();
    const label = file.split('/').pop().replace(/\.[^/.]+$/, '');
    const scene = {
        label,
        file,
        rot: normalizedFile.endsWith('.spz') ? 'cw180z' : 'none',
        floorY: -3.0,
        startX: 0.0,
        startZ: 3.0,
        yaw: 0.0,
        pitch: 0.0,
        ...DEFAULT_BOUNDS,
        bounds: false,
    };

    if (normalizedFile.endsWith('/scene1.spz') || normalizedFile === 'scene1.spz') {
        scene.rot = 'yup';
    } else if (normalizedFile.endsWith('/take2-alternate-angle.spz') || normalizedFile === 'take2-alternate-angle.spz') {
        Object.assign(scene, {
            rot: 'cw90z',
            floorY: -1.64,
            startX: -0.8,
            startZ: 0.04,
            minX: -8.0,
            maxX: 8.0,
            minZ: -8.0,
            maxZ: 8.0,
            bounds: true,
        });
    } else if (normalizedFile.includes('classroom')) {
        Object.assign(scene, {
            rot: 'yup',
            floorY: -3.0,
            startX: 0.0,
            startZ: 3.0,
        });
    } else if (normalizedFile.includes('arcade')) {
        Object.assign(scene, {
            rot: 'cw180z',
            floorY: -10.0,
            minX: -8.0,
            maxX: 8.0,
            minZ: -8.0,
            maxZ: 8.0,
            bounds: true,
        });
    }

    return scene;
}

/** Whether database fine-tuning should replace the named rotation preset. */
export function hasFineTunedRotation(scene) {
    return ['rotX', 'rotY', 'rotZ'].some((key) => {
        const value = Number(scene[key]);
        return Number.isFinite(value) && value !== 0;
    });
}

/** Apply FPS look without carrying roll in from another camera mode. */
export function applyFpsCameraRotation(camera, pitch, yaw) {
    camera.rotation.set(pitch, yaw, 0);
}

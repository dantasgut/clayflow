import {
    CloudLayer,
    DirectionalLight,
    PlaneGeometry,
    Sky,
    StandardMaterial,
    Transform,
} from 'clayflow/web';
import type { SceneImplementation } from '../../core/types';
import type { ClayflowHandle } from '../../engines/clayflow';

/** O sol, o céu, a camada de cúmulos e um chão de 2 km; a câmera na altitude da variante. */
const impl: SceneImplementation<ClayflowHandle> = {
    limitations: ['sem equivalente no Three.js (nuvens volumétricas)'],
    setup({ engine, variant }) {
        const world = engine.app.world;
        const e = ((variant.params.sun as number) * Math.PI) / 180;
        const sun = new DirectionalLight({
            direction: [-Math.cos(e) * 0.8, -Math.sin(e), -Math.cos(e) * 0.6, 0],
            intensity: 100000,
            castShadow: true,
        });
        world.insert(sun);
        world.insert(new Sky({ sun }));
        world.insert(new CloudLayer({ coverage: 0.5, type: 0.5, wind: [10, 0] }));
        engine.app.defaults.renderer.output.data.exposure = -11;
        world.insert(
            new PlaneGeometry({ size: [2000, 2000] })
                .add(new StandardMaterial({ albedo: [0.35, 0.4, 0.3, 1], roughness: 0.95 }))
                .add(new Transform()),
        );
        const altitude = variant.params.altitude as number;
        const transform = engine.camera.attached.find(
            (r): r is Transform => r instanceof Transform,
        );
        if (transform !== undefined && altitude > 10) {
            transform.data.position = [0, altitude, 0, 1];
            transform.data.rotation = Transform.lookRotation(
                [0, altitude, 0],
                [1000, altitude + 120, 300],
            );
        }
        engine.camera.data.far = 200_000;
    },
};

export default impl;

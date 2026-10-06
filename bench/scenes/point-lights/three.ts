import { gridScatter } from '../../core/rng';
import type { SceneImplementation } from '../../core/types';
import type { ThreeHandle } from '../../engines/three';
import { LIGHTS_EXTENT } from './scene';

/** Plano + 200 objetos + 256 `PointLight` com cores e posições do `rng`. */
const impl: SceneImplementation<ThreeHandle> = {
    setup({ engine, variant, rng }) {
        const { THREE } = engine;
        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(LIGHTS_EXTENT, LIGHTS_EXTENT),
            new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 }),
        );
        plane.rotation.x = -Math.PI / 2;
        engine.scene.add(plane);
        const box = new THREE.BoxGeometry(1, 1, 1);
        for (const p of gridScatter(rng, Number(variant.params.objects), LIGHTS_EXTENT)) {
            const mesh = new THREE.Mesh(
                box,
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color(...p.color),
                    roughness: 0.5,
                }),
            );
            mesh.position.set(p.position[0], 1 + p.position[1], p.position[2]);
            mesh.quaternion.set(...p.rotation);
            mesh.scale.setScalar(1 + p.scale);
            engine.scene.add(mesh);
        }
        for (const p of gridScatter(rng, Number(variant.params.lights), LIGHTS_EXTENT)) {
            const light = new THREE.PointLight(new THREE.Color(...p.color), 20, 12, 2);
            light.position.set(p.position[0], 2 + p.position[1] * 4, p.position[2]);
            engine.scene.add(light);
        }
    },
};

export default impl;

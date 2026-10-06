import type { SceneImplementation } from '../../core/types';
import type { ThreeHandle } from '../../engines/three';
import { uniqueObjects } from './scene';

/** 1k `Mesh`, cada um com geometria e `MeshStandardMaterial` próprios. */
const impl: SceneImplementation<ThreeHandle> = {
    setup({ engine, variant, rng }) {
        const { THREE } = engine;
        for (const o of uniqueObjects(rng, Number(variant.params.count))) {
            const geometry =
                o.shape.kind === 'box'
                    ? new THREE.BoxGeometry(...o.shape.size)
                    : new THREE.SphereGeometry(
                          o.shape.radius,
                          o.shape.lonSegments,
                          o.shape.latSegments,
                      );
            const p = o.placement;
            const mesh = new THREE.Mesh(
                geometry,
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color(p.color[0], p.color[1], p.color[2]),
                    roughness: o.roughness,
                    metalness: 0,
                }),
            );
            mesh.position.set(...p.position);
            mesh.quaternion.set(...p.rotation);
            engine.scene.add(mesh);
        }
    },
};

export default impl;

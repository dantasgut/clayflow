import type { SceneImplementation } from '../../core/types';
import type { ThreeHandle } from '../../engines/three';
import { SURFACE_HALF, SURFACE_SEGMENTS, waveHeight } from './scene';

let geometry: ThreeHandle['THREE']['PlaneGeometry']['prototype'] | null = null;
let t = 0;

/** A mesma onda numa `PlaneGeometry` de 256² segmentos deslocada na CPU a cada quadro, normais recalculadas. */
const impl: SceneImplementation<ThreeHandle> = {
    limitations: [
        'onda na CPU (o Three não avalia superfícies na GPU); sem malha adaptativa: referência',
    ],
    setup({ engine }) {
        const { THREE } = engine;
        geometry = new THREE.PlaneGeometry(
            2 * SURFACE_HALF,
            2 * SURFACE_HALF,
            SURFACE_SEGMENTS,
            SURFACE_SEGMENTS,
        );
        geometry.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ color: 0x598ccc, roughness: 0.6, metalness: 0 }),
        );
        mesh.frustumCulled = false;
        engine.scene.add(mesh);
        const light = new THREE.DirectionalLight(0xffffff, 1.1);
        light.position.set(0.3, 1, 0.4);
        engine.scene.add(light);
    },
    update(dt) {
        if (geometry === null) return;
        t += dt;
        const pos = geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) pos.setY(i, waveHeight(pos.getX(i), pos.getZ(i), t));
        pos.needsUpdate = true;
        geometry.computeVertexNormals();
    },
};

export default impl;

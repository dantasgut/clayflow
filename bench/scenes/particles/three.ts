import type { InstancedMesh, Object3D } from 'three/webgpu';
import type { SceneImplementation } from '../../core/types';
import type { ThreeHandle } from '../../engines/three';
import { blockOf, blockPositions, TANK_HALF } from './scene';

let mesh: InstancedMesh | null = null;
let dummy: Object3D | null = null;
let pos: Float32Array = new Float32Array(0);
let vel: Float32Array = new Float32Array(0);

/**
 * O mesmo número de partículas num `InstancedMesh` de esferas de baixa resolução, movidas na CPU por uma integração
 * simples (gravidade, chão e paredes do tanque) — o Three não tem SPH: é a referência do custo de desenhar e atualizar N
 * partículas por quadro, não de simular fluido.
 */
const impl: SceneImplementation<ThreeHandle> = {
    limitations: [
        'sem simulação de fluido: integração balística na CPU (referência de custo de desenho)',
    ],
    setup({ engine, variant, rng }) {
        const { THREE } = engine;
        const count = Number(variant.params.count);
        const { spacing } = blockOf(count);
        pos = Float32Array.from(blockPositions(rng, count));
        vel = new Float32Array(pos.length);
        mesh = new THREE.InstancedMesh(
            new THREE.IcosahedronGeometry(spacing * 0.5, 0),
            new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.5, 1) }),
            pos.length / 3,
        );
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        dummy = new THREE.Object3D();
        engine.scene.add(mesh);
        impl.update?.(0);
    },
    update(dt) {
        if (mesh === null || dummy === null) return;
        const step = dt > 0 ? 1 / 60 : 0;
        for (let p = 0; p < pos.length / 3; p++) {
            const i = p * 3;
            let x = pos[i] ?? 0;
            let y = pos[i + 1] ?? 0;
            let z = pos[i + 2] ?? 0;
            let vx = vel[i] ?? 0;
            let vy = (vel[i + 1] ?? 0) - 9.81 * step;
            let vz = vel[i + 2] ?? 0;
            x += vx * step;
            y += vy * step;
            z += vz * step;
            if (y < 0) {
                y = 0;
                vy = -vy * 0.2;
            }
            if (Math.abs(x) > TANK_HALF) {
                x = Math.sign(x) * TANK_HALF;
                vx = -vx * 0.2;
            }
            if (Math.abs(z) > TANK_HALF) {
                z = Math.sign(z) * TANK_HALF;
                vz = -vz * 0.2;
            }
            pos.set([x, y, z], i);
            vel.set([vx, vy, vz], i);
            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            mesh.setMatrixAt(p, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    },
};

export default impl;

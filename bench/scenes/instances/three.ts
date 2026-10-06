import { gridScatter, motionAt, type Placement } from '../../core/rng';
import type { SceneImplementation } from '../../core/types';
import type { ThreeHandle } from '../../engines/three';
import { countOf, INSTANCES_EXTENT, isMoving } from './scene';

let placements: Placement[] = [];
let mesh: ThreeHandle['THREE']['InstancedMesh']['prototype'] | null = null;
let dummy: ThreeHandle['THREE']['Object3D']['prototype'] | null = null;
let moving = false;
let t = 0;

function place(
    target: NonNullable<typeof dummy>,
    pos: readonly number[],
    rot: readonly number[],
    s: number,
): void {
    target.position.set(pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0);
    target.quaternion.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0, rot[3] ?? 1);
    target.scale.setScalar(s);
    target.updateMatrix();
}

/** Um `InstancedMesh` com `MeshStandardMaterial` — o que um usuário de Three faria (R8). */
const impl: SceneImplementation<ThreeHandle> = {
    setup({ engine, variant, rng }) {
        const { THREE } = engine;
        moving = isMoving(variant.params);
        placements = gridScatter(rng, countOf(variant.params), INSTANCES_EXTENT);
        mesh = new THREE.InstancedMesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 }),
            placements.length,
        );
        if (moving) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        dummy = new THREE.Object3D();
        const color = new THREE.Color();
        placements.forEach((p, i) => {
            if (mesh === null || dummy === null) return;
            place(dummy, p.position, p.rotation, p.scale);
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, color.setRGB(p.color[0], p.color[1], p.color[2]));
        });
        mesh.frustumCulled = false;
        engine.scene.add(mesh);
    },
    update(dt) {
        if (!moving || mesh === null || dummy === null) return;
        t += dt;
        for (let i = 0; i < placements.length; i++) {
            const p = placements[i] as Placement;
            const m = motionAt(p, i, t);
            place(dummy, m.position, m.rotation, p.scale);
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    },
};

export default impl;

import RAPIER from '@dimforge/rapier3d-compat';
import type { InstancedMesh, Object3D } from 'three/webgpu';
import type { SceneImplementation } from '../../core/types';
import type { ThreeHandle } from '../../engines/three';
import { BALL_RADIUS, ballPositions, GROUND_HALF } from './scene';

let world: RAPIER.World | null = null;
let bodies: RAPIER.RigidBody[] = [];
let mesh: InstancedMesh | null = null;
let dummy: Object3D | null = null;

/** Rapier (WASM, CPU, passo fixo 1/60) + render `InstancedMesh` sincronizado das poses. */
const impl: SceneImplementation<ThreeHandle> = {
    async setup({ engine, variant, rng }) {
        const { THREE } = engine;
        await RAPIER.init();
        world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        world.timestep = 1 / 60;
        const groundBody = world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
        );
        world.createCollider(
            RAPIER.ColliderDesc.cuboid(GROUND_HALF, 0.5, GROUND_HALF)
                .setFriction(0.5)
                .setRestitution(0.2),
            groundBody,
        );
        const ground = new THREE.Mesh(
            new THREE.BoxGeometry(GROUND_HALF * 2, 1, GROUND_HALF * 2),
            new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.4, 0.45) }),
        );
        ground.position.set(0, -0.5, 0);
        engine.scene.add(ground);

        const positions = ballPositions(rng, Number(variant.params.count));
        bodies = positions.map(([x, y, z]) => {
            const body = (world as RAPIER.World).createRigidBody(
                RAPIER.RigidBodyDesc.dynamic()
                    .setTranslation(x, y, z)
                    .setLinearDamping(0.05)
                    .setAngularDamping(0.05),
            );
            (world as RAPIER.World).createCollider(
                RAPIER.ColliderDesc.ball(BALL_RADIUS)
                    .setFriction(0.5)
                    .setRestitution(0.2)
                    .setMass(1),
                body,
            );
            return body;
        });
        mesh = new THREE.InstancedMesh(
            new THREE.SphereGeometry(BALL_RADIUS, 32, 16),
            new THREE.MeshStandardMaterial({ color: new THREE.Color(0.9, 0.5, 0.1) }),
            bodies.length,
        );
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        dummy = new THREE.Object3D();
        engine.scene.add(mesh);
        impl.update?.(0);
    },
    update(dt) {
        if (world === null || mesh === null || dummy === null) return;
        if (dt > 0) world.step();
        for (let i = 0; i < bodies.length; i++) {
            const b = bodies[i] as RAPIER.RigidBody;
            const p = b.translation();
            const q = b.rotation();
            dummy.position.set(p.x, p.y, p.z);
            dummy.quaternion.set(q.x, q.y, q.z, q.w);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    },
};

export default impl;

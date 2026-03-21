/**
 * Exemplo 02 — Cena com física
 *
 * Demonstra:
 * - RigidBody dinâmico respondendo à gravidade
 * - Collider (SphereShape, BoxShape, PlaneShape) para detecção de colisão
 * - PhysicsWorld configurado com solver e força global
 * - Registro automático via connectScene (event-driven)
 */

import { Scene }              from '../scene/core/Scene';
import { Mesh }               from '../scene/objects/Mesh';
import { Transform }          from '../scene/math/Transform';
import { WebGPURenderer }     from '../presentation/renderers/WebGPURenderer';
import { BoxGeometry }        from '../elements/geometry/BoxGeometry';
import { SphereGeometry }     from '../elements/geometry/SphereGeometry';
import { PlaneGeometry }      from '../elements/geometry/PlaneGeometry';
import { StandardMaterial }   from '../elements/materials/StandardMaterial';
import { PhysicsWorld }       from '../elements/physics/PhysicsWorld';
import { RigidBody }          from '../elements/physics/RigidBody';
import { CPURigidBodySolver } from '../elements/physics/solvers/CPURigidBodySolver';
import { ConstantForce }      from '../elements/physics/forces/ConstantForce';
import { SphereShape }        from '../elements/physics/shapes/SphereShape';
import { BoxShape }           from '../elements/physics/shapes/BoxShape';
import { PlaneShape }         from '../elements/physics/shapes/PlaneShape';
import { vec3 }               from 'gl-matrix';

async function main(canvas: HTMLCanvasElement): Promise<void> {
    const scene = new Scene();

    // Configura o mundo físico
    const world = new PhysicsWorld();
    world.setSolver('RigidBody', new CPURigidBodySolver());
    world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));

    const renderer = new WebGPURenderer(world);

    // Chão estático
    const ground = new Mesh(
        new PlaneGeometry(20, 20),
        new StandardMaterial({ color: [0.4, 0.4, 0.4, 1] }),
    );
    ground.add(new Transform());
    ground.addPhysics(new RigidBody({ mass: 0, isKinematic: true }));
    ground.addPhysics(new PlaneShape());
    scene.add(ground);

    // Esfera dinâmica — cai e colide com o chão
    const sphere = new Mesh(
        new SphereGeometry(0.5),
        new StandardMaterial({ color: [0.9, 0.3, 0.1, 1] }),
    );
    const sphereTransform = new Transform();
    sphereTransform.position[1] = 5;
    sphere.add(sphereTransform);
    sphere.addPhysics(new RigidBody({ mass: 1.0 }));
    sphere.addPhysics(new SphereShape(0.5));
    scene.add(sphere);

    // Cubo dinâmico — cai ao lado da esfera
    const box = new Mesh(
        new BoxGeometry(),
        new StandardMaterial({ color: [0.2, 0.6, 0.9, 1] }),
    );
    const boxTransform = new Transform();
    boxTransform.position[0] = 1.5;
    boxTransform.position[1] = 4;
    box.add(boxTransform);
    box.addPhysics(new RigidBody({ mass: 2.0 }));
    box.addPhysics(new BoxShape(0.5, 0.5, 0.5));
    scene.add(box);

    // Ouve colisões na esfera
    sphere.addEventListener('collision', (e: any) => {
        console.log('Esfera colidiu com:', e.other.name);
    });

    renderer.setSize(canvas.width, canvas.height);

    // const camera = new Camera(...)
    // requestAnimationFrame(() => renderer.render(scene, camera));
}

export { main };

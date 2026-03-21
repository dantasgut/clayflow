/**
 * Exemplo 01 — Cena básica
 *
 * Demonstra a montagem mínima de uma cena:
 * - Scene + câmera
 * - Mesh com BoxGeometry e StandardMaterial
 * - Transform para posicionar objetos
 * - WebGPURenderer para renderizar
 */

import { Scene }              from '../scene/core/Scene';
import { Mesh }               from '../scene/objects/Mesh';
import { Transform }          from '../scene/math/Transform';
import { WebGPURenderer }     from '../presentation/renderers/WebGPURenderer';
import { BoxGeometry }        from '../elements/geometry/BoxGeometry';
import { SphereGeometry }     from '../elements/geometry/SphereGeometry';
import { PlaneGeometry }      from '../elements/geometry/PlaneGeometry';
import { StandardMaterial }   from '../elements/materials/StandardMaterial';

async function main(canvas: HTMLCanvasElement): Promise<void> {
    const scene    = new Scene();
    const renderer = new WebGPURenderer();

    // Chão
    const ground = new Mesh(
        new PlaneGeometry(10, 10),
        new StandardMaterial({ color: [0.3, 0.3, 0.3, 1] }),
    );
    const groundTransform = new Transform();
    ground.add(groundTransform);
    scene.add(ground);

    // Cubo vermelho
    const box = new Mesh(
        new BoxGeometry(),
        new StandardMaterial({ color: [0.8, 0.2, 0.2, 1] }),
    );
    const boxTransform = new Transform();
    boxTransform.position[1] = 1;
    box.add(boxTransform);
    scene.add(box);

    // Esfera azul
    const sphere = new Mesh(
        new SphereGeometry(0.5),
        new StandardMaterial({ color: [0.2, 0.4, 0.9, 1], roughness: 0.3, metallic: 0.6 }),
    );
    const sphereTransform = new Transform();
    sphereTransform.position[0] = 2;
    sphereTransform.position[1] = 0.5;
    sphere.add(sphereTransform);
    scene.add(sphere);

    renderer.setSize(canvas.width, canvas.height);

    // Loop de render
    // const camera = new Camera(...)
    // requestAnimationFrame(() => renderer.render(scene, camera));
}

export { main };

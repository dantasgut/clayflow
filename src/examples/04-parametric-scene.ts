/**
 * Exemplo 04 — Geometria paramétrica
 *
 * Demonstra:
 * - ParametricGeometry com função f(u, v) customizada
 * - Toro, superfície de Klein e plano inclinado como exemplos
 * - WireframeDecorator e ThickWireframeDecorator
 * - EdgeGeometry para visualização de wireframe espesso
 */

import { Scene }                  from '../scene/core/Scene';
import { Mesh }                   from '../scene/objects/Mesh';
import { Transform }              from '../scene/math/Transform';
import { WebGPURenderer }         from '../presentation/renderers/WebGPURenderer';
import { ParametricGeometry }     from '../elements/geometry/ParametricGeometry';
import { SphereGeometry }         from '../elements/geometry/SphereGeometry';
import { EdgeGeometry }           from '../elements/geometry/EdgeGeometry';
import { BoxGeometry }            from '../elements/geometry/BoxGeometry';
import { StandardMaterial }       from '../elements/materials/StandardMaterial';
import { WireframeDecorator }     from '../elements/materials/WireframeDecorator';
import { ThickWireframeDecorator } from '../elements/materials/ThickWireframeDecorator';

async function main(canvas: HTMLCanvasElement): Promise<void> {
    const scene    = new Scene();
    const renderer = new WebGPURenderer();

    // Toro — f(u, v) em coordenadas toroidais
    const R = 1.0, r = 0.3;
    const torus = new Mesh(
        new ParametricGeometry((u, v) => {
            const theta = u * Math.PI * 2;
            const phi   = v * Math.PI * 2;
            const nx = Math.cos(phi) * Math.cos(theta);
            const ny = Math.sin(phi);
            const nz = Math.cos(phi) * Math.sin(theta);
            return {
                position: [
                    (R + r * Math.cos(phi)) * Math.cos(theta),
                    r * Math.sin(phi),
                    (R + r * Math.cos(phi)) * Math.sin(theta),
                ],
                normal: [nx, ny, nz],
                uv:     [u, v],
            };
        }, 64, 32),
        new StandardMaterial({ color: [0.7, 0.5, 0.9, 1], roughness: 0.4 }),
    );
    const torusTransform = new Transform();
    torusTransform.position[0] = -3;
    torus.add(torusTransform);
    scene.add(torus);

    // Cubo com wireframe fino (line-list, 1px)
    const wireBox = new Mesh(
        new BoxGeometry(),
        new WireframeDecorator(new StandardMaterial({ color: [0.2, 1.0, 0.4, 1] })),
    );
    const wireBoxTransform = new Transform();
    wireBoxTransform.position[0] = 0;
    wireBoxTransform.position[1] = 1;
    wireBox.add(wireBoxTransform);
    scene.add(wireBox);

    // Esfera com wireframe espesso (quad expansion via EdgeGeometry)
    const sphereGeo = new SphereGeometry(0.8, 24, 16);
    const thickWireSphere = new Mesh(
        new EdgeGeometry(sphereGeo),
        new ThickWireframeDecorator(new StandardMaterial({ color: [1.0, 0.6, 0.1, 1] }), 3.0),
    );
    const thickWireTransform = new Transform();
    thickWireTransform.position[0] = 3;
    thickWireSphere.add(thickWireTransform);
    scene.add(thickWireSphere);

    // Superfície ondulada — função de onda senoidal
    const wave = new Mesh(
        new ParametricGeometry((u, v) => {
            const x  = (u - 0.5) * 4;
            const z  = (v - 0.5) * 4;
            const y  = Math.sin(x * 2) * Math.cos(z * 2) * 0.3;
            const nx = -Math.cos(x * 2) * 2 * Math.cos(z * 2) * 0.3;
            const nz = Math.sin(x * 2) * Math.sin(z * 2) * 2 * 0.3;
            const len = Math.sqrt(nx * nx + 1 + nz * nz);
            return {
                position: [x, y, z],
                normal:   [nx / len, 1 / len, nz / len],
                uv:       [u, v],
            };
        }, 48, 48),
        new StandardMaterial({ color: [0.3, 0.7, 0.9, 1], roughness: 0.6 }),
    );
    const waveTransform = new Transform();
    waveTransform.position[2] = -3;
    wave.add(waveTransform);
    scene.add(wave);

    renderer.setSize(canvas.width, canvas.height);

    // const camera = new Camera(...)
    // requestAnimationFrame(() => renderer.render(scene, camera));
}

export { main };

// Demo standalone das 4 camadas — gate de validação cross-layer #91.
//
// Exercita:
//  - C1 (Hardware): GpuEngineCore criado via Application.create.
//  - C2 (Sync): World/EventBus/ResourceSystem/ExecutionSystem/FlowRegistry instanciados.
//  - C3 (Elements): SphereGeometry + StandardMaterial + Camera + DirectionalLight (castShadow);
//    RigidBody com LCPFlow integrando gravidade no GPU; SoftBody com XPBDFlow.
//  - C4 (Presentation): Application + GameLoop + ForwardFlow real + ShadowFlow ativo +
//    OrbitController (auto-rotate) + InteractionSystem.
//
// O laço RAF emite frameTick continuamente; cada flow ativo dispatcha seus passes
// dentro de um único core.record('frame', ...). O frame é encerrado com core.submit().

import {
    Application,
    InteractionSystem,
    OrbitController,
} from './presentation/index';
import {
    BoxGeometry,
    Camera,
    DirectionalLight,
    GravityField,
    LCPFlow,
    PlaneGeometry,
    RigidBody,
    SoftBody,
    SphereGeometry,
    StandardMaterial,
    Transform,
    XPBDFlow,
} from './elements/index';

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);

    const app = await Application.create({ canvas });

    const interaction = new InteractionSystem({ canvas, window }, app.events);
    interaction.attach();

    const aspect = canvas.width / canvas.height;
    const camera = new Camera({ aspect });
    app.world.insert(camera);

    interaction.addController(new OrbitController(camera, {
        target: [0, 0.5, 0],
        distance: 7,
        autoRotate: true,
        autoRotateSpeed: 0.4,
    }));

    const sun = new DirectionalLight({ direction: [0.4, -1, 0.6, 0], color: [1, 1, 0.95, 1], castShadow: true });
    app.world.insert(sun);

    const ground = new PlaneGeometry({ size: [12, 12] });
    ground.add(new StandardMaterial({ albedo: [0.4, 0.5, 0.55, 1], roughness: 0.9 }));
    ground.add(new Transform({ position: [0, -0.5, 0, 1] }));
    app.world.insert(ground);

    const cube = new BoxGeometry({ size: [1, 1, 1] });
    cube.add(new StandardMaterial({ albedo: [0.85, 0.4, 0.25, 1], roughness: 0.4 }));
    cube.add(new Transform({ position: [-1.5, 0, 0, 1] }));
    app.world.insert(cube);

    const sphere = new SphereGeometry({ radius: 0.6, latSegments: 24, lonSegments: 32 });
    sphere.add(new StandardMaterial({ albedo: [0.25, 0.65, 0.85, 1], roughness: 0.3 }));
    sphere.add(new Transform({ position: [1.5, 0, 0, 1] }));
    app.world.insert(sphere);

    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));

    app.world.insert(new RigidBody({ position: [0, 4, 0, 1], mass: 1.0, restitution: 0.3 }));
    app.world.insert(new SoftBody({ position: [0, 6, 0, 1], mass: 1.0 }));

    app.flows.register(new LCPFlow(app.core, app.world, app.resources));
    app.flows.register(new XPBDFlow(app.core, app.world, app.resources));

    app.start();
    console.log('[demo] Application started — 4 camadas ativas');
}

main().catch(err => {
    console.error('[demo] FAIL:', err);
    const el = document.getElementById('log');
    if (el) el.textContent = `FAIL: ${err?.message ?? err}`;
});

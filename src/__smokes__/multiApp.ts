// Fase M.3 — Multi-Application smoke.
//
// Valida que 2 Applications em 2 canvases distintos com SceneContext próprios
// (via createScene()) operam isoladas: queries não cruzam, eventos não cruzam.
//
// Para rodar: `cp src/__smokes__/multiApp.ts src/main.ts && npm run dev`
import { Application } from '../presentation/index';
import { createScene } from '../scene/index';
import {
    BoxGeometry,
    SphereGeometry,
    StandardMaterial,
    Camera,
    DirectionalLight,
    Transform,
} from '../elements/index';

const log = (m: string): void => {
    console.log(`[multiApp] ${m}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += m + '\n';
};

async function main(): Promise<void> {
    const root = document.body;
    // Cria 2 canvases lado-a-lado.
    const c1 = document.createElement('canvas');
    c1.width = 400;
    c1.height = 300;
    c1.style.border = '1px solid #555';
    root.appendChild(c1);
    const c2 = document.createElement('canvas');
    c2.width = 400;
    c2.height = 300;
    c2.style.border = '1px solid #555';
    root.appendChild(c2);

    const scene1 = createScene();
    const scene2 = createScene();

    const app1 = await Application.create({ canvas: c1, scene: scene1, autoResize: false });
    log('app1 created (scene1)');
    const app2 = await Application.create({ canvas: c2, scene: scene2, autoResize: false });
    log('app2 created (scene2)');

    // Cena 1: cubo
    const box = new BoxGeometry({ size: [2, 2, 2] });
    box.add(new StandardMaterial({ albedo: [0.7, 0.3, 0.2, 1], roughness: 0.4 }));
    box.add(new Transform({ position: [0, 0, 0, 1] }));
    app1.world.insert(box);
    app1.world.insert(
        new Camera({
            position: [0, 3, 6, 1],
            fov: Math.PI / 4,
            aspect: c1.width / c1.height,
            near: 0.1,
            far: 100,
        }),
    );
    app1.world.insert(
        new DirectionalLight({
            direction: [-0.4, -1, 0.6, 0],
            color: [1, 1, 1, 1],
            intensity: 1.5,
        }),
    );

    // Cena 2: esfera
    const sphere = new SphereGeometry({ radius: 1.0, segments: 32 });
    sphere.add(new StandardMaterial({ albedo: [0.2, 0.4, 0.7, 1], roughness: 0.5 }));
    sphere.add(new Transform({ position: [0, 0, 0, 1] }));
    app2.world.insert(sphere);
    app2.world.insert(
        new Camera({
            position: [0, 2, 5, 1],
            fov: Math.PI / 4,
            aspect: c2.width / c2.height,
            near: 0.1,
            far: 100,
        }),
    );
    app2.world.insert(
        new DirectionalLight({
            direction: [-0.4, -1, 0.6, 0],
            color: [1, 1, 1, 1],
            intensity: 1.5,
        }),
    );

    // ─── Asserts de isolamento ─────────────────────────────────────────────
    const app1Boxes = app1.world.queryBySchemaName('BoxVertex');
    const app1Spheres = app1.world.queryBySchemaName('SphereVertex');
    const app2Boxes = app2.world.queryBySchemaName('BoxVertex');
    const app2Spheres = app2.world.queryBySchemaName('SphereVertex');

    log(`app1: BoxVertex=${app1Boxes.length}, SphereVertex=${app1Spheres.length}`);
    log(`app2: BoxVertex=${app2Boxes.length}, SphereVertex=${app2Spheres.length}`);

    if (app1Boxes.length !== 1)
        throw new Error(`expected app1 BoxVertex=1, got ${app1Boxes.length}`);
    if (app1Spheres.length !== 0)
        throw new Error(`expected app1 SphereVertex=0, got ${app1Spheres.length}`);
    if (app2Boxes.length !== 0)
        throw new Error(`expected app2 BoxVertex=0, got ${app2Boxes.length}`);
    if (app2Spheres.length !== 1)
        throw new Error(`expected app2 SphereVertex=1, got ${app2Spheres.length}`);
    log('queries isoladas OK');

    // Eventos isolados: emit no app1.events não dispara handler em app2.events.
    let app1Ticks = 0;
    let app2Ticks = 0;
    app1.events.on('frameTick', () => {
        app1Ticks++;
    });
    app2.events.on('frameTick', () => {
        app2Ticks++;
    });
    app1.events.emit('frameTick', { dt: 1 / 60, elapsed: 0 });
    if (app1Ticks !== 1) throw new Error(`app1Ticks expected 1, got ${app1Ticks}`);
    if (app2Ticks !== 0)
        throw new Error(`app2Ticks should be 0 (events isolados), got ${app2Ticks}`);
    log('eventos isolados OK');

    // Roda alguns frames reais em ambos.
    let frames1 = 0;
    let frames2 = 0;
    app1.events.on('frameComplete', () => {
        frames1++;
    });
    app2.events.on('frameComplete', () => {
        frames2++;
    });
    app1.start();
    app2.start();
    await new Promise((r) => setTimeout(r, 500)); // ~30 frames a 60fps
    app1.stop();
    app2.stop();
    log(`real frames: app1=${frames1}, app2=${frames2}`);
    if (frames1 < 5 || frames2 < 5) {
        throw new Error(`poucos frames (${frames1}/${frames2}) — RAF não rodou`);
    }
    log('MULTI-APP SMOKE PASSED');

    // Cleanup
    app1.dispose();
    app2.dispose();
}

main().catch((err: unknown) => {
    console.error('[multiApp] FATAL:', err);
    log(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
});

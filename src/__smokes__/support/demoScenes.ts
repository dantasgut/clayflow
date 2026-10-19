// Cenas de apresentação para os vídeos (`npm run video`, carregadas por `bench/page/demo.ts`): as mesmas montagens dos smokes da 033, com câmera e luz em
// movimento e a exposição ajustada para ver (os smokes medem o HDR e não ajustam a exposição).
import {
    FogVolume,
    GlobalIllumination,
    SphereGeometry,
    StandardMaterial,
    Transform,
    type Application,
} from 'clayflow';
import { settle } from './extensionScenes';
import {
    buildGiScene,
    cornellBox,
    giApp,
    insertCloth,
    insertCurtain,
    insertGraphTerrain,
    livingStage,
    sunFrom,
    windowRoom,
    type GiScene,
    type Vec3,
} from './giScenes';
import { closureFn } from './materialScenes';

/** Resolução dos vídeos. */
export const VIDEO_SIZE = { width: 1280, height: 720 } as const;

/** Cena pronta: o app, o canvas e o estado dela no instante `t ∈ [0, 1]` do vídeo (chamado antes de cada passo). */
export interface Demo {
    readonly title: string;
    readonly seconds: number;
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
    readonly tick: (t: number) => void;
}

interface Opened {
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
    readonly view: Transform;
    readonly sun: ReturnType<typeof buildGiScene>['sun'];
}

/** Monta a cena com a iluminação global e espera as compilações e a GI estabilizarem (como os smokes). */
async function open(
    scene: GiScene,
    quality: 'medium' | 'high',
    exposure: number,
    extra?: (app: Application) => void,
): Promise<Opened> {
    const errors: string[] = [];
    const { app, canvas } = await giApp(VIDEO_SIZE.width, VIDEO_SIZE.height, errors);
    const built = buildGiScene(app, scene, VIDEO_SIZE.width / VIDEO_SIZE.height);
    app.defaults.presentation.data.exposure = exposure;
    extra?.(app);
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    app.world.insert(
        new GlobalIllumination({
            quality,
            bounces: 3,
            probeSpacing: scene.probeSpacing ?? 0.3,
            cascades: 1,
            center: scene.probeCenter,
        }),
    );
    await settle(app, 3000);
    const limit = performance.now() + 120000;
    while ((ready.revision < 0 || performance.now() - ready.at < 1000) && performance.now() < limit)
        await settle(app, 100);
    if (errors.length > 0) throw new Error(errors.join(' | '));
    return { app, canvas, view: built.view, sun: built.sun };
}

function look(view: Transform, position: Vec3, target: Vec3): void {
    view.data.position = [...position, 1];
    view.data.rotation = Transform.lookRotation(position, target);
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

const GLASS = `return closure_add(
        closure_dielectric(data.ior, vec3f(1.0), 0.0, 0.0, vec3f(0.0)),
        closure_transmission(data.ior, vec3f(1.0), 0.0, 0.0, 0.0),
    );`;

/** As cenas por nome. Exposição: sol de 100 klx ≈ −10 EV; 100 lx em superfície clara ≈ −4 EV. */
export const DEMOS: Record<string, () => Promise<Demo>> = {
    async cornell() {
        const o = await open(cornellBox(), 'high', 0);
        return {
            ...o,
            title: 'Cornell box — iluminação global, 3 rebatimentos',
            seconds: 10,
            tick(t) {
                const a = (smooth(t) - 0.5) * 0.9;
                look(
                    o.view,
                    [Math.sin(a) * 4.2, 1 + 0.2 * Math.sin(t * Math.PI), Math.cos(a) * 4.2],
                    [0, 1, 0],
                );
            },
        };
    },
    async day() {
        const o = await open(windowRoom(), 'medium', -10);
        return {
            ...o,
            title: 'Cômodo com janela ao longo do dia — céu físico, sol e luz rebatida',
            seconds: 12,
            tick(t) {
                if (o.sun === undefined) return;
                o.sun.data.direction = [
                    ...sunFrom(20 + 30 * Math.sin(t * Math.PI), -35 + 70 * t),
                    0,
                ];
            },
        };
    },
    async fog() {
        const room = windowRoom();
        const o = await open(room, 'medium', -10, (app) => {
            app.world.insert(
                new FogVolume({
                    shape: { box: [4, 2.5, 4] },
                    center: [0, 1.25, 0],
                    density: 0.15,
                    albedo: [0.9, 0.9, 0.9],
                    anisotropy: 0.3,
                }),
            );
        });
        return {
            ...o,
            title: 'Névoa volumétrica ao longo do dia — feixes do sol pela janela, câmera andando',
            seconds: 12,
            tick(t) {
                const s = smooth(t);
                look(o.view, [-1.7 + 0.8 * s, 1.5, 1.7 - 1.0 * s], room.camera.target);
                if (o.sun !== undefined)
                    o.sun.data.direction = [
                        ...sunFrom(20 + 30 * Math.sin(t * Math.PI), -35 + 70 * t),
                        0,
                    ];
            },
        };
    },
    async living() {
        let curtain: ReturnType<typeof insertCurtain> | undefined;
        const o = await open(livingStage(), 'medium', -4, (app) => {
            curtain = insertCurtain(app, -1.2);
            insertCloth(app);
            insertGraphTerrain(app);
        });
        return {
            ...o,
            title: 'Geometria viva — cortina paramétrica, pano XPBD e terreno de grafo na GPU',
            seconds: 12,
            tick(t) {
                if (curtain === undefined) return;
                curtain.values.offset = -1.2 + 1.4 * smooth(t < 0.5 ? t * 2 : 2 - t * 2);
                curtain.values.phase = t * 8;
            },
        };
    },
    async caustics() {
        const R = 0.2;
        const ior = 1.5;
        const focal = (ior * R) / (2 * (ior - 1));
        const scene: GiScene = {
            slabs: [{ id: 1, min: [-2, -0.05, -2], max: [2, 0, 2], color: [0.5, 0.5, 0.5] }],
            sun: { direction: [0, -1, 0], illuminance: 100 },
            camera: { position: [0, 0.5, 1.4], target: [0, 0.1, 0], fovY: Math.PI / 4 },
            probeCenter: [0, 0.5, 0],
            regions: new Map([[1, 'chão']]),
        };
        const o = await open(scene, 'high', -5.5, (app) => {
            app.world.insert(
                new SphereGeometry({ radius: R })
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [0, focal, 0, 1] }))
                    .add(closureFn(GLASS, ['specular', 'transmission'], { ior: 'f32' }, { ior })),
            );
        });
        return {
            ...o,
            title: 'Cáusticas por fótons — esfera de vidro (IOR 1,5) focando o sol',
            seconds: 10,
            tick(t) {
                const a = (smooth(t) - 0.5) * 1.6;
                look(o.view, [Math.sin(a) * 1.4, 0.55, Math.cos(a) * 1.4], [0, 0.12, 0]);
                if (o.sun !== undefined)
                    o.sun.data.direction = [0.3 * Math.sin(t * Math.PI * 2), -1, 0.1, 0];
            },
        };
    },
};

// Spec 034 — Cenas dos vídeos (US6): a página que o `npm run video` abre. Monta a cena pedida (`?scene=`), espera o motor
// pronto e, quadro a quadro com passo fixo de 1/60 s, lê o quadro apresentado direto da GPU (`readCanvas`) e o entrega ao
// runner (`__videoFrame`), que o escreve no ffmpeg. Nada passa pelo canvas 2D nem por JPEG. `?bits=16` usa o canvas em
// `rgba16float` (mapeamento de tons sem quantizar em 8 bits) para o vídeo de 10 bits.
//
// Cenas: lente (esfera de vidro sobre um xadrez emissor, a bola laranja passando atrás), dispersao (esfera de Abbe 20,
// câmera orbitando), agua (barragem no tanque, câmera parada), causticas (água agitada vista de cima, fundo de areia), cornell (caixa de
// Cornell com a luz global), dia (cômodo com janela, o sol andando), nevoa (o mesmo cômodo com névoa e a luz global,
// o feixe do sol), pano (tecido XPBD caindo sob o sol, com a sombra). A refração dos vidros é a do motor no momento da
// gravação — o título não promete mais do que isso.
import * as clayflow from 'clayflow';
import {
    Application,
    createScene,
    FogVolume,
    GlobalIllumination,
    SphereGeometry,
    StandardMaterial,
    Transform,
} from 'clayflow';
import {
    buildGiScene,
    cornellBox,
    diffuseFunction,
    insertCloth,
    sunFrom,
    windowRoom,
    type GiScene,
    type Slab,
    type Vec3,
} from './support/giScenes';
import { closureFn } from './support/materialScenes';
import { waterScene } from './support/waterScene';

declare global {
    interface Window {
        /** O runner recebe cada quadro (base64 dos pixels, sem preenchimento) e o escreve no ffmpeg. */
        __videoFrame?: (index: number, base64: string) => Promise<void>;
        /** O runner recebe as dimensões e o formato antes do primeiro quadro (para abrir o ffmpeg). */
        __videoStart?: (
            width: number,
            height: number,
            format: string,
            frames: number,
        ) => Promise<void>;
    }
}

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 1280);
const H = Number(q.get('h') ?? 720);
const BITS = q.get('bits') === '16' ? 16 : 8;

function log(msg: string): void {
    console.log(`[videoScenes] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null)
        el.textContent += `${msg}
`;
}

/** Uma cena: quadros padrão e a montagem, que devolve o movimento por quadro. */
interface Shot {
    readonly frames: number;
    build(app: Application): (i: number) => void;
}

/** Câmera móvel por `Transform`. */
function camera(
    app: Application,
    fovY: number,
    position: Vec3,
    target: Vec3,
): (p: Vec3, t: Vec3) => void {
    const view = new Transform({
        position: [...position, 1],
        rotation: Transform.lookRotation(position, target),
    });
    app.world.insert(
        new clayflow.Camera({
            fov: fovY,
            aspect: W / H,
            aspectMode: 'fixed',
            near: 0.05,
            far: 60,
        }).add(view),
    );
    return (p, t) => {
        view.data.position = [...p, 1];
        view.data.rotation = Transform.lookRotation(p, t);
    };
}

/** Painel emissor quadriculado 2 × 2 m em z = −2. */
function checker(): Slab[] {
    const out: Slab[] = [];
    const n = 8;
    const side = 2 / n;
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
            out.push({
                id: 1,
                min: [-1 + i * side, -1 + j * side, -2.05],
                max: [-1 + (i + 1) * side, -1 + (j + 1) * side, -2],
                color: [0, 0, 0],
                emission: (i + j) % 2 === 0 ? [4, 4, 4] : [0.5, 0.5, 0.5],
            });
    return out;
}

/** Esfera de vidro (dielétrico + transmissão; índice e número de Abbe). */
function glassSphere(
    app: Application,
    center: Vec3,
    radius: number,
    ior: number,
    abbe: number,
): void {
    app.world.insert(
        new SphereGeometry({ radius, latSegments: 96, lonSegments: 192 })
            .add(new StandardMaterial())
            .add(new Transform({ position: [...center, 1] }))
            .add(
                closureFn(
                    `return closure_add(closure_dielectric(${ior.toFixed(3)}, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(${ior.toFixed(3)}, vec3f(1.0), 0.0, ${abbe.toFixed(1)}, 0.0));`,
                    ['specular', 'transmission'],
                ),
            ),
    );
}

function checkerScene(app: Application): GiScene {
    const scene: GiScene = {
        slabs: checker(),
        camera: { position: [0, 0, 1.5], target: [0, 0, -1], fovY: (40 * Math.PI) / 180 },
        probeCenter: [0, 0, -0.5],
        regions: new Map(),
    };
    buildGiScene(app, scene, W / H);
    return scene;
}

const SHOTS: Record<string, Shot> = {
    lente: {
        frames: 360,
        build(app) {
            checkerScene(app);
            const look = camera(app, (40 * Math.PI) / 180, [0, 0, 1.6], [0, 0, -1]);
            glassSphere(app, [0, 0, 0.2], 0.45, 1.5, 0);
            const ball = new Transform({ position: [-0.8, 0, -1, 1] });
            app.world.insert(
                new SphereGeometry({ radius: 0.12, latSegments: 48, lonSegments: 96 })
                    .add(new StandardMaterial({ albedo: [1, 0.5, 0.1, 1], roughness: 1 }))
                    .add(diffuseFunction([3, 1.2, 0.2]))
                    .add(ball),
            );
            return (i) => {
                const t = i / 359;
                ball.data.position = [
                    -0.8 + 1.6 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t)),
                    0,
                    -1,
                    1,
                ];
                look([0, 0, 1.6 - 0.6 * Math.sin(Math.PI * t)], [0, 0, -1]);
            };
        },
    },
    dispersao: {
        frames: 300,
        build(app) {
            checkerScene(app);
            const look = camera(app, (40 * Math.PI) / 180, [0, 0, 1.5], [0, 0, -1]);
            glassSphere(app, [0, 0, 0.2], 0.45, 1.7, 20);
            return (i) => {
                const a = (2 * Math.PI * i) / 300;
                look([0.5 * Math.sin(a), 0.25 * Math.cos(a), 1.5], [0, 0, -1]);
            };
        },
    },
    agua: {
        frames: 420,
        build(app) {
            // A câmera é a da cena do tanque (parada): o movimento é o da barragem.
            waterScene(app, { width: W, height: H, box: true, eye: [1.3, 1.25, 1.9] });
            return () => undefined;
        },
    },
    causticas: {
        frames: 360,
        build(app) {
            waterScene(app, {
                width: W,
                height: H,
                dam: [24, 24, 32],
                floor: 'sand',
                eye: [0, 2.1, 0.01],
            });
            return () => undefined;
        },
    },
    cornell: {
        frames: 300,
        build(app) {
            const scene = cornellBox();
            buildGiScene(app, scene, W / H);
            app.world.insert(
                new GlobalIllumination({
                    quality: 'medium',
                    probeSpacing: scene.probeSpacing ?? 0.3,
                    center: scene.probeCenter,
                }),
            );
            return () => undefined;
        },
    },
    dia: {
        frames: 480,
        build(app) {
            const scene = windowRoom();
            const built = buildGiScene(app, scene, W / H);
            app.world.insert(
                new GlobalIllumination({
                    quality: 'medium',
                    probeSpacing: scene.probeSpacing ?? 0.3,
                    center: scene.probeCenter,
                }),
            );
            app.defaults.presentation.data.exposure = -10;
            return (i) => {
                const d = sunFrom(20 + 30 * (i / 479), -25 + 50 * (i / 479));
                if (built.sun !== undefined) built.sun.data.direction = [...d, 0];
            };
        },
    },
    nevoa: {
        frames: 480,
        build(app) {
            // O cômodo com janela inteiro (paredes claras, céu físico e a luz global): o feixe do sol na névoa e a sala
            // iluminada pelo rebatimento.
            const scene = windowRoom();
            const built = buildGiScene(app, scene, W / H);
            app.world.insert(
                new GlobalIllumination({
                    quality: 'medium',
                    probeSpacing: scene.probeSpacing ?? 0.3,
                    center: scene.probeCenter,
                }),
            );
            app.world.insert(
                new FogVolume({
                    shape: { box: [4, 2.5, 4] },
                    center: [0, 1.25, 0],
                    density: 0.15,
                    albedo: [0.9, 0.9, 0.9],
                    anisotropy: 0.3,
                }),
            );
            app.defaults.presentation.data.exposure = -10;
            return (i) => {
                const d = sunFrom(20 + 30 * (i / 479), -25 + 50 * (i / 479));
                if (built.sun !== undefined) built.sun.data.direction = [...d, 0];
            };
        },
    },
    pano: {
        frames: 300,
        build(app) {
            app.world.insert(
                new clayflow.DirectionalLight({
                    direction: [-0.3, -1, -0.4, 0],
                    intensity: 3,
                    castShadow: true,
                    shadow: { size: [2048, 2048] },
                }),
            );
            app.world.insert(
                new clayflow.PlaneGeometry({ size: [6, 6] })
                    .add(new StandardMaterial({ albedo: [0.6, 0.6, 0.62, 1], roughness: 0.9 }))
                    .add(new Transform({ position: [-0.9, 0, -0.6, 1] })),
            );
            insertCloth(app);
            camera(app, Math.PI / 4, [0.4, 1.4, 1.2], [-0.9, 0.7, -0.6]);
            return () => undefined;
        },
    },
};

/** Base64 de bytes grandes (em blocos, sem estourar a pilha). */
function toBase64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

async function main(): Promise<void> {
    const name = q.get('scene') ?? '';
    const shot = SHOTS[name];
    if (shot === undefined)
        throw new Error(`cena desconhecida: ${name} (há ${Object.keys(SHOTS).join(', ')})`);
    const frames = Number(q.get('frames') ?? shot.frames);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        canvasOptions: {
            capture: true,
            ...(BITS === 16 ? { format: 'rgba16float' as const } : {}),
        },
    });
    const errors: string[] = [];
    app.events.on('engineError', (e) => errors.push(`${e.stage}: ${e.message}`));
    const update = shot.build(app);
    update(0);
    await app.whenReady({ timeoutMs: 120_000 });
    for (let i = 0; i < frames; i++) {
        update(i);
        app.step(1 / 60);
        // Na mesma tarefa do quadro: a textura do canvas ainda é a apresentada.
        const pixels = await app.core.readCanvas();
        if (i === 0)
            await window.__videoStart?.(pixels.width, pixels.height, pixels.format, frames);
        await window.__videoFrame?.(i, toBase64(pixels.data));
        if (errors.length > 0) throw new Error(errors.join(' | '));
    }
    app.dispose();
    canvas.remove();
    log(`${name}: ${frames} quadros ${W}×${H} lidos da GPU (${BITS} bits)`);
    log('VIDEO DONE');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

// Spec 034 — Cenas dos vídeos (US6): a página que o `npm run video` abre. Monta a cena pedida (`?scene=`), espera o motor
// pronto e, quadro a quadro com passo fixo de 1/60 s, lê o quadro apresentado direto da GPU (`readCanvas`) e o entrega ao
// runner (`__videoFrame`), que o escreve no ffmpeg. Nada passa pelo canvas 2D nem por JPEG. `?bits=16` usa o canvas em
// `rgba16float` (mapeamento de tons sem quantizar em 8 bits) para o vídeo de 10 bits.
//
// Cenas: lente (esfera de vidro num palco ao ar livre — céu físico, sol, piso quadriculado e colunas —, uma esfera
// branca opaca rolando atrás dela e a câmera se aproximando), dispersao (o mesmo palco, esfera de Abbe 20, câmera
// orbitando), agua (barragem no tanque, câmera parada), causticas (água agitada vista de cima, fundo de areia), cornell (caixa de
// Cornell com a luz global), dia (cômodo com janela, o sol andando), nevoa (o mesmo cômodo com névoa e a luz global,
// o feixe do sol), pano (tecido XPBD caindo sob o sol, com a sombra), sprites (partículas atravessando a cena e os
// vértices de uma esfera como sprites girando, sobre o xadrez), ondulacao (o palco da lente com uma lâmina de água de
// ondulações pelo grafo e a esfera de vidro meio mergulhada). A refração dos vidros é a do motor no momento da
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
    insertCloth,
    sunFrom,
    windowRoom,
    type Vec3,
} from './support/giScenes';
import { materialGraph } from './support/materialScenes';
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
/** Diagnóstico: `?aa=off|temporal|msaa|accumulate` troca o antisserrilhado (padrão: o do motor). */
const AA = q.get('aa');

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

/**
 * Esfera de vidro pelo grafo de nós (`bsdf.dielectric` + `bsdf.transmission`; índice e número de Abbe; a prioridade do
 * meio por `closure.mediumPriority`, quando dada).
 */
function glassSphere(
    app: Application,
    center: Vec3,
    radius: number,
    ior: number,
    abbe: number,
    priority?: number,
): void {
    const graph: Parameters<typeof materialGraph>[0] = {
        reflect: clayflow.nodes.bsdf.dielectric.with({ ior, roughness: 0 }),
        transmit: clayflow.nodes.bsdf.transmission.with({ ior, abbe }),
        glass: clayflow.nodes.closure.add,
    };
    const links: [string, string][] = [
        ['reflect.value', 'glass.a'],
        ['transmit.value', 'glass.b'],
    ];
    let out = 'glass.value';
    if (priority !== undefined) {
        graph.priority = clayflow.nodes.closure.mediumPriority.with({ priority });
        links.push([out, 'priority.c']);
        out = 'priority.value';
    }
    app.world.insert(
        new SphereGeometry({ radius, latSegments: 96, lonSegments: 192 })
            .add(new StandardMaterial())
            .add(new Transform({ position: [...center, 1] }))
            .add(materialGraph(graph, links, out)),
    );
}

/**
 * Palco das cenas de vidro: o céu físico com o sol a 40° vindo da frente e da direita da câmera, a luz global, um piso quadriculado de 12 × 12 m (ladrilhos de 0,25 m),
 * quatro colunas coloridas ao fundo e a esfera de vidro de raio 0,45 apoiada no piso (índice e número de Abbe). O
 * raio que escapa do vidro vê o céu; o que acerta o piso ou as colunas, a luz do sol com sombra.
 */
function glassStage(app: Application, ior: number, abbe: number, priority?: number): void {
    const sun = new clayflow.DirectionalLight({
        direction: [...sunFrom(40, 60), 0],
        intensity: 100000,
        castShadow: true,
        shadow: { size: [2048, 2048] },
    });
    app.world.insert(sun);
    app.world.insert(new clayflow.Sky({ sun, sunDisk: false, night: [0, 0, 0] }));
    // A luz do céu e a rebatida nas faces e sombras do raster (o traçado do vidro já as tem): cena aberta, as cascatas
    // acompanham a câmera.
    app.world.insert(new GlobalIllumination({ quality: 'medium', probeSpacing: 0.5 }));
    // Ar livre ao sol (EV100 ≈ 14–15, a regra do "sunny 16"), contra o −10 do cômodo com janela.
    app.defaults.presentation.data.exposure = -14;
    app.world.insert(
        new clayflow.PlaneGeometry({ size: [12, 12] })
            .add(new StandardMaterial({ albedo: [0.7, 0.7, 0.7, 1], roughness: 0.9 }))
            .add(new Transform())
            .add(
                new clayflow.MaterialFunction({
                    code: 'fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n    let c = (floor(s.world_position.x * 4.0) + floor(s.world_position.z * 4.0)) % 2.0;\n    return closure_diffuse(mix(vec3f(0.12), vec3f(0.75), abs(c)), 0.0);\n}',
                }),
            ),
    );
    const columns: readonly [number, readonly [number, number, number]][] = [
        [-1.5, [0.63, 0.065, 0.05]],
        [-0.5, [0.14, 0.45, 0.091]],
        [0.5, [0.1, 0.2, 0.6]],
        [1.5, [0.8, 0.6, 0.1]],
    ];
    for (const [x, color] of columns)
        app.world.insert(
            new clayflow.BoxGeometry({ size: [0.4, 1.4, 0.4] })
                .add(new StandardMaterial({ albedo: [...color, 1], roughness: 0.8 }))
                .add(new Transform({ position: [x, 0.7, -2.2, 1] })),
        );
    glassSphere(app, [0, 0.45, 0], 0.45, ior, abbe, priority);
}

/**
 * Lâmina de água pelo grafo (spec 034, T065b): o dielétrico de índice 1,33 com a absorção do meio (`bsdf.transmission`:
 * a cor atingida a 2 m) e as ondulações (`surface.ripple` na posição, normal e tempo simulado da amostra, até
 * `closure.normal`) — uma caixa de malha, ainda sem a simulação (a água das partículas pelo traçado é a T065d–f).
 */
function rippledWater(app: Application, size: Vec3, center: Vec3): void {
    app.world.insert(
        new clayflow.BoxGeometry({ size: [...size] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [...center, 1] }))
            .add(
                materialGraph(
                    {
                        s: clayflow.nodes.input.surfaceSample(),
                        reflect: clayflow.nodes.bsdf.dielectric.with({ ior: 1.33, roughness: 0 }),
                        transmit: clayflow.nodes.bsdf.transmission.with({
                            ior: 1.33,
                            abbe: 55.7,
                            color: [0.55, 0.8, 0.85],
                            depth: 2,
                        }),
                        water: clayflow.nodes.closure.add,
                        ripple: clayflow.nodes.surface.ripple.with({
                            strength: 0.25,
                            size: 0.3,
                            speed: 1,
                        }),
                        bump: clayflow.nodes.closure.normal,
                    },
                    [
                        ['reflect.value', 'water.a'],
                        ['transmit.value', 'water.b'],
                        ['s.world_position', 'ripple.position'],
                        ['s.normal', 'ripple.normal'],
                        ['s.time', 'ripple.time'],
                        ['water.value', 'bump.c'],
                        ['ripple.value', 'bump.normal'],
                    ],
                    'bump.value',
                ),
            ),
    );
}

const SHOTS: Record<string, Shot> = {
    lente: {
        frames: 360,
        build(app) {
            const look = camera(app, (40 * Math.PI) / 180, [0, 0.9, 2.4], [0, 0.45, 0]);
            glassStage(app, 1.5, 0);
            const ball = new Transform({ position: [-1.4, 0.18, -1.1, 1] });
            app.world.insert(
                new SphereGeometry({ radius: 0.18, latSegments: 48, lonSegments: 96 })
                    .add(new StandardMaterial({ albedo: [0.85, 0.85, 0.85, 1], roughness: 0.6 }))
                    .add(ball),
            );
            return (i) => {
                const t = i / 359;
                ball.data.position = [
                    -1.4 + 2.8 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t)),
                    0.18,
                    -1.1,
                    1,
                ];
                look(
                    [0, 0.9 - 0.2 * Math.sin(Math.PI * t), 2.4 - 0.8 * Math.sin(Math.PI * t)],
                    [0, 0.45, 0],
                );
            };
        },
    },
    dispersao: {
        frames: 300,
        build(app) {
            const look = camera(app, (40 * Math.PI) / 180, [0, 0.9, 2.2], [0, 0.45, 0]);
            glassStage(app, 1.7, 20);
            return (i) => {
                const a = (2 * Math.PI * i) / 300;
                look(
                    [2.2 * Math.sin(0.5 * a), 0.9 + 0.2 * Math.cos(a), 2.2 * Math.cos(0.5 * a)],
                    [0, 0.45, 0],
                );
            };
        },
    },
    ondulacao: {
        frames: 360,
        build(app) {
            // A esfera de vidro (prioridade 1: dentro dela a borda da água não é interface) apoiada no piso, quase metade
            // dentro de uma lâmina de água de 0,4 m com ondulações; a câmera gira devagar.
            const look = camera(app, (40 * Math.PI) / 180, [0, 1.1, 2.6], [0, 0.3, 0]);
            glassStage(app, 1.5, 0, 1);
            rippledWater(app, [4, 0.4, 3], [0, 0.19, 0]);
            return (i) => {
                const a = (0.6 * Math.PI * i) / 359;
                look([2.6 * Math.sin(a - 0.3), 1.1, 2.6 * Math.cos(a - 0.3)], [0, 0.3, 0]);
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
    sprites: {
        frames: 300,
        build(app) {
            // Sprites em movimento sobre o xadrez (spec 034, T031): 400 partículas (SPH, sem gravidade) atravessando a
            // cena a 1 m/s e os vértices de uma esfera como sprites girando em volta do centro.
            app.world.insert(
                new clayflow.DirectionalLight({
                    direction: [-0.4, -1, -0.3, 0],
                    intensity: 3,
                    castShadow: true,
                    shadow: { size: [2048, 2048] },
                }),
            );
            app.world.insert(
                new clayflow.PlaneGeometry({ size: [8, 8] })
                    .add(new StandardMaterial({ albedo: [0.7, 0.7, 0.7, 1], roughness: 0.9 }))
                    .add(new Transform())
                    .add(
                        new clayflow.MaterialFunction({
                            code: 'fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n    let c = (floor(s.world_position.x * 10.0) + floor(s.world_position.z * 10.0)) % 2.0;\n    return closure_diffuse(mix(vec3f(0.1), vec3f(0.8), abs(c)), 0.0);\n}',
                        }),
                    ),
            );
            app.world.insert(new clayflow.GravityField({ acceleration: [0, 0, 0, 0] }));
            const position: number[] = [];
            const velocity: number[] = [];
            for (let k = 0; k < 400; k++) {
                position.push(
                    -2.4 + 1.2 * ((k * 0.618) % 1),
                    0.5 + 0.6 * ((k * 0.381) % 1),
                    -0.6 + 1.2 * ((k * 0.271) % 1),
                );
                velocity.push(1, 0, 0);
            }
            app.world.insert(
                new clayflow.FluidBody({ algorithm: 'SPH', position, velocity }).add(
                    new clayflow.PointSpriteMaterial({ color: [1, 0.8, 0.2, 1], radius: 0.04 }),
                ),
            );
            const ball = new Transform({ position: [0, 0.4, 0, 1] });
            app.world.insert(
                new SphereGeometry({ radius: 0.25, latSegments: 8, lonSegments: 16 })
                    .add(
                        new clayflow.PointSpriteMaterial({ color: [0.2, 0.6, 1, 1], radius: 0.03 }),
                    )
                    .add(ball),
            );
            camera(app, 0.8, [0, 1, 3], [0, 0.4, 0]);
            return (i) => {
                const a = (2 * Math.PI * i) / 150;
                ball.data.position = [0.9 * Math.cos(a), 0.4, 0.9 * Math.sin(a), 1];
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
        ...(AA !== null ? { antialias: AA as clayflow.AntialiasingMode } : {}),
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

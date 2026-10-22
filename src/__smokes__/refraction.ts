// Spec 034 — Smoke da refração (US1; SC-001, SC-002; T039). Nasce vermelho: a refração traçada é das T040–T047.
//
// Cada cena é montada igual no motor e no traçador de caminhos da CPU (`reference/pathTracer`, com dielétricos e pilha
// de meios próprios — a referência independente, rodada em workers). Um cômodo fechado de paredes emissoras (albedo 0:
// nenhuma luz rebatida, nenhum céu, nenhum ambiente — o hemisfério padrão desligado) com o chão e a parede do fundo em
// xadrez emissor; o que se vê pelo vidro é só geometria, Fresnel e absorção. A imagem do motor é a média de 256 quadros
// do alvo HDR no modo `accumulate` (as 256 posições da amostra dentro do pixel: a mesma integral do pixel da
// referência, de 256 amostras). Medida por região: o objeto visto no centro do pixel na referência, só os pixels a 2 px
// de qualquer outro, e em quatro quadrantes do retângulo da região — o erro relativo por canal da média.
//   - sphere: esfera de vidro IOR 1,5 sobre o xadrez fino (US1-1) — ≤ 3 %.
//   - immersed: esfera de vidro (prioridade 1) meio mergulhada num tanque d'água (US1-2): ar → água → vidro → água → ar;
//     a borda da água dentro do vidro não é interface — ≤ 3 %.
//   - rough: bloco de vidro de rugosidade 0,3 (US1-3) — ≤ 5 %.
//   - prism: prisma de base quadrada, IOR 1,7 e Abbe 20 (US1-4): cada canal no próprio caminho — ≤ 3 % por canal.
//   - underwater: a câmera dentro d'água olhando a superfície por baixo, além e aquém do ângulo crítico (US1-5) — ≤ 3 %.
//   - pane: vidro fino (um plano, espessura zero) girado 30° (US1-7): o que se vê vem do raio — ≤ 3 %.
//   - lit: parede do fundo difusa em xadrez, iluminada por uma luz pontual, vista pela esfera (a luz direta recalculada
//     no acerto) — ≤ 3 %.
//   - lens: esfera de vidro como lupa de 4× sobre o xadrez de 2 cm (US1-1): ≤ 3 % e nenhum degrau de pixel na borda do
//     xadrez vista pela lente (por linha e por coluna, a posição subpixel de cada cruzamento da borda contra a da
//     referência: nenhum deslocado ≥ 1 px; controles da medida: a referência em blocos de 4 px tem degraus, outra
//     referência de amostras independentes não tem); a fração da energia contada como absorvida
//     no limite de interfaces ≤ 0,1 % (o contador do `Refraction`).
//   - gi: a cena `sphere` sem a iluminação global, com ela desligada e com ela ligada: as médias por região iguais a
//     ≤ 0,5 % (SC-002; albedo 0, nenhuma luz indireta a descontar) (US1-6).
// Em todas: nenhum quadro com o passe de cópia da tela (`sceneCopy`): 0 leituras dela pelos transmissivos (SC-001).
// Diagnóstico: `--query dump=1` grava a referência, o motor e a diferença de cada cena (`zz-refraction-*.png`).
// Para rodar: `npm run smoke -- refraction [--query case=sphere]`. Resultado: `REFRACTION SMOKE PASSED` ou `FAIL: …`.
import * as clayflow from 'clayflow';
import {
    Application,
    BoxGeometry,
    Camera,
    createScene,
    GlobalIllumination,
    PlaneGeometry,
    PointLight,
    SphereGeometry,
    StandardMaterial,
    Transform,
    type GpuFrameTimedPayload,
    type LobeName,
} from 'clayflow';
import type {
    PtCamera,
    PtDielectric,
    PtImage,
    PtObject,
    PtScene,
} from '../elements/lighting/reference/pathTracer';
import { readHdrTexture } from './support/imageMeasures';
import { closureFn } from './support/materialScenes';
import { renderPathTracedParallel } from './support/pathTraceParallel';
import { writeFixture } from './support/fixtures';

function log(msg: string): void {
    console.log(`[refraction] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

type Vec3 = readonly [number, number, number];

const W = 320;
const H = 240;
/** Quadros do motor e amostras por pixel da referência. */
const SAMPLES = 256;
const pct = (v: number): string => `${(v * 100).toFixed(2)} %`;

// ── Cenas ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Xadrez pela posição no mundo nos eixos dados (0 = x, 1 = y, 2 = z). */
interface Checker {
    readonly size: number;
    readonly axes: readonly [number, number];
    readonly emission?: readonly [Vec3, Vec3];
    readonly albedo?: readonly [Vec3, Vec3];
}

/** Forma de um sólido: caixa (girada em y), esfera ou plano fino (centro, largura × altura, girado em y). */
type Shape =
    | { readonly kind: 'box'; readonly min: Vec3; readonly max: Vec3; readonly yaw?: number }
    | { readonly kind: 'sphere'; readonly center: Vec3; readonly radius: number }
    | {
          readonly kind: 'pane';
          readonly center: Vec3;
          readonly width: number;
          readonly height: number;
          readonly yaw: number;
      };

/** Sólido da cena: vidro (dielétrico), emissor ou difuso; com xadrez opcional. */
interface Solid {
    readonly id: number;
    readonly shape: Shape;
    readonly glass?: PtDielectric;
    readonly emission?: Vec3;
    readonly albedo?: Vec3;
    readonly checker?: Checker;
}

interface RefractionScene {
    readonly name: string;
    readonly solids: readonly Solid[];
    readonly camera: { readonly position: Vec3; readonly target: Vec3; readonly fovY: number };
    /** Luzes pontuais (posição, candela). */
    readonly points?: readonly { readonly position: Vec3; readonly intensity: number }[];
    /** Limite do erro por região (padrão 3 %). */
    readonly limit?: number;
}

/** Cômodo de 4 × 3 × 4 m de paredes emissoras (albedo 0); chão em xadrez emissor de lado `floorCell`. */
function room(floorCell = 0.1, back: 'emissive' | 'diffuse' = 'emissive'): Solid[] {
    const t = 0.1;
    return [
        {
            id: 1,
            shape: { kind: 'box', min: [-2 - t, -t, -2 - t], max: [2 + t, 0, 2 + t] },
            checker: {
                size: floorCell,
                axes: [0, 2],
                emission: [
                    [0.9, 0.9, 0.9],
                    [0.05, 0.05, 0.05],
                ],
            },
        },
        {
            id: 2,
            shape: { kind: 'box', min: [-2 - t, 3, -2 - t], max: [2 + t, 3 + t, 2 + t] },
            emission: [0.6, 0.6, 0.6],
        },
        {
            id: 3,
            shape: { kind: 'box', min: [-2 - t, 0, -2 - t], max: [2 + t, 3, -2] },
            checker:
                back === 'emissive'
                    ? {
                          size: 0.2,
                          axes: [0, 1],
                          emission: [
                              [0.8, 0.5, 0.3],
                              [0.1, 0.05, 0.02],
                          ],
                      }
                    : {
                          size: 0.2,
                          axes: [0, 1],
                          albedo: [
                              [0.8, 0.8, 0.8],
                              [0.1, 0.1, 0.1],
                          ],
                      },
        },
        {
            id: 4,
            shape: { kind: 'box', min: [-2 - t, 0, 2], max: [2 + t, 3, 2 + t] },
            emission: [0.2, 0.3, 0.5],
        },
        {
            id: 5,
            shape: { kind: 'box', min: [-2 - t, 0, -2 - t], max: [-2, 3, 2 + t] },
            emission: [0.5, 0.2, 0.2],
        },
        {
            id: 6,
            shape: { kind: 'box', min: [2, 0, -2 - t], max: [2 + t, 3, 2 + t] },
            emission: [0.2, 0.5, 0.25],
        },
    ];
}

/** Lupa de 4×: esfera de raio R, foco efetivo nR/(2(n − 1)) = 1,5R; o xadrez a 0,75 do foco do centro (m = 4). */
const LENS_R = 0.3;
const LENS_CENTER_Y = 0.75 * 1.5 * LENS_R;

const SCENES: readonly RefractionScene[] = [
    {
        name: 'sphere',
        solids: [
            ...room(0.1),
            {
                id: 10,
                shape: { kind: 'sphere', center: [0, 0.55, 0], radius: 0.4 },
                glass: { ior: 1.5 },
            },
        ],
        camera: { position: [0, 1.6, 1.6], target: [0, 0.4, 0], fovY: 0.7 },
    },
    {
        name: 'immersed',
        solids: [
            ...room(0.1),
            {
                id: 20,
                // O fundo do tanque um pouco dentro do chão: o chão (opaco) é atingido dentro d'água, sem lâmina de ar.
                shape: { kind: 'box', min: [-1, -0.01, -0.8], max: [1, 0.5, 0.8] },
                glass: { ior: 1.33, color: [0.6, 0.85, 0.9], depth: 2 },
            },
            {
                id: 10,
                shape: { kind: 'sphere', center: [0, 0.5, 0], radius: 0.35 },
                glass: { ior: 1.5, priority: 1 },
            },
        ],
        camera: { position: [0, 1.4, 1.7], target: [0, 0.35, 0], fovY: 0.75 },
    },
    {
        name: 'rough',
        solids: [
            ...room(0.1),
            {
                id: 10,
                shape: { kind: 'box', min: [-0.5, 0.3, -0.15], max: [0.5, 0.9, 0.15] },
                glass: { ior: 1.5, roughness: 0.3 },
            },
        ],
        camera: { position: [0, 0.9, 1.8], target: [0, 0.55, 0], fovY: 0.7 },
        limit: 0.05,
    },
    {
        name: 'prism',
        solids: [
            ...room(0.1),
            {
                id: 10,
                shape: {
                    kind: 'box',
                    min: [-0.25, 0.1, -0.25],
                    max: [0.25, 1.0, 0.25],
                    yaw: Math.PI / 4,
                },
                glass: { ior: 1.7, abbe: 20 },
            },
        ],
        camera: { position: [0, 0.8, 1.6], target: [0, 0.55, -0.5], fovY: 0.7 },
    },
    {
        name: 'underwater',
        solids: [
            ...room(0.1),
            {
                id: 20,
                // A água entra nas paredes e no chão: dentro dela só há opacos e a superfície de cima.
                shape: { kind: 'box', min: [-2.05, -0.01, -2.05], max: [2.05, 1.2, 2.05] },
                glass: { ior: 1.33 },
            },
        ],
        camera: { position: [0, 0.6, 1.2], target: [0, 1.5, -1], fovY: 1.0 },
    },
    {
        name: 'pane',
        solids: [
            ...room(0.1),
            {
                id: 10,
                shape: {
                    kind: 'pane',
                    center: [0, 0.9, 0],
                    width: 1.2,
                    height: 0.9,
                    yaw: Math.PI / 6,
                },
                glass: { ior: 1.5 },
            },
        ],
        camera: { position: [0.3, 1.0, 1.8], target: [0, 0.8, -0.5], fovY: 0.7 },
    },
    {
        name: 'lit',
        solids: [
            ...room(0.1, 'diffuse'),
            {
                id: 10,
                shape: { kind: 'sphere', center: [0, 1, 0], radius: 0.35 },
                glass: { ior: 1.5 },
            },
        ],
        camera: { position: [0, 1, 2], target: [0, 1, -1], fovY: 0.7 },
        // Entre a esfera e a parede do fundo: a esfera não faz sombra no que se vê por ela.
        points: [{ position: [1.8, 1, -0.5], intensity: 4 }],
    },
];

const LENS: RefractionScene = {
    name: 'lens',
    solids: [
        ...room(0.02),
        {
            id: 10,
            shape: { kind: 'sphere', center: [0, LENS_CENTER_Y, 0], radius: LENS_R },
            glass: { ior: 1.5 },
        },
    ],
    camera: { position: [0, 1.5, 0.3], target: [0, LENS_CENTER_Y, 0], fovY: 0.5 },
};

// ── O motor ──────────────────────────────────────────────────────────────────────────────────────────────────────

const fmt = (v: Vec3): string => `vec3f(${v.map((x) => x.toFixed(6)).join(', ')})`;
const AXES = ['x', 'y', 'z'] as const;

/** Quatérnio (x, y, z, w) de `angle` em torno de `axis`. */
const quatAxis = (axis: Vec3, angle: number): [number, number, number, number] => {
    const s = Math.sin(angle / 2);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};
const quatMul = (a: readonly number[], b: readonly number[]): [number, number, number, number] => [
    a[3]! * b[0]! + a[0]! * b[3]! + a[1]! * b[2]! - a[2]! * b[1]!,
    a[3]! * b[1]! - a[0]! * b[2]! + a[1]! * b[3]! + a[2]! * b[0]!,
    a[3]! * b[2]! + a[0]! * b[1]! - a[1]! * b[0]! + a[2]! * b[3]!,
    a[3]! * b[3]! - a[0]! * b[0]! - a[1]! * b[1]! - a[2]! * b[2]!,
];

/** A função `material` do sólido: o mesmo material da referência. */
function materialOf(s: Solid): ReturnType<typeof closureFn> {
    const g = s.glass;
    if (g !== undefined) {
        const rough = (g.roughness ?? 0).toFixed(4);
        const ior = g.ior.toFixed(4);
        const body = `closure_add(closure_dielectric(${ior}, vec3f(1.0), ${rough}, 0.0, vec3f(0.0)), closure_transmission(${ior}, ${fmt(g.color ?? [1, 1, 1])}, ${(g.depth ?? 0).toFixed(4)}, ${(g.abbe ?? 0).toFixed(2)}, ${rough}))`;
        const withPriority =
            g.priority === undefined
                ? body
                : `closure_medium_priority(${body}, ${g.priority.toFixed(1)})`;
        return closureFn(`    return ${withPriority};`, ['specular', 'transmission']);
    }
    const lobes: LobeName[] = [];
    const lines: string[] = [];
    let albedo = fmt(s.albedo ?? [0, 0, 0]);
    let emission = fmt(s.emission ?? [0, 0, 0]);
    const c = s.checker;
    if (c !== undefined) {
        const [a, b] = c.axes;
        lines.push(
            `    let q = floor(s.world_position.${AXES[a]} / ${c.size.toFixed(4)}) + floor(s.world_position.${AXES[b]} / ${c.size.toFixed(4)});`,
            '    let odd = q - 2.0 * floor(q * 0.5) > 0.5;',
        );
        if (c.albedo !== undefined)
            albedo = `select(${fmt(c.albedo[0])}, ${fmt(c.albedo[1])}, odd)`;
        if (c.emission !== undefined)
            emission = `select(${fmt(c.emission[0])}, ${fmt(c.emission[1])}, odd)`;
    }
    const emits = s.emission !== undefined || c?.emission !== undefined;
    const reflects = s.albedo !== undefined || c?.albedo !== undefined;
    if (reflects) lobes.push('diffuse');
    if (emits) lobes.push('emission');
    const parts = [
        reflects ? `closure_diffuse(${albedo}, 0.0)` : 'closure_diffuse(vec3f(0.0), 0.0)',
        ...(emits ? [`closure_emission(${emission}, 1.0)`] : []),
    ];
    const closure = parts.length === 1 ? parts[0]! : `closure_add(${parts.join(', ')})`;
    return closureFn(
        [...lines, `    return ${closure};`].join('\n'),
        lobes.length > 0 ? lobes : ['diffuse'],
    );
}

/** Monta a cena no motor; devolve a câmera. */
function buildEngine(app: Application, scene: RefractionScene): Camera {
    for (const s of scene.solids) {
        const sh = s.shape;
        let entity;
        if (sh.kind === 'box') {
            const size = [0, 1, 2].map((k) => sh.max[k]! - sh.min[k]!);
            const center = [0, 1, 2].map((k) => (sh.max[k]! + sh.min[k]!) / 2);
            entity = new BoxGeometry({ size }).add(
                new Transform({
                    position: [...center, 1],
                    rotation: quatAxis([0, 1, 0], sh.yaw ?? 0),
                }),
            );
        } else if (sh.kind === 'sphere') {
            entity = new SphereGeometry({
                radius: sh.radius,
                latSegments: 128,
                lonSegments: 256,
            }).add(new Transform({ position: [...sh.center, 1] }));
        } else {
            // O plano em XZ (normal +y) de pé (normal +z) e girado em y.
            const rotation = quatMul(quatAxis([0, 1, 0], sh.yaw), quatAxis([1, 0, 0], Math.PI / 2));
            entity = new PlaneGeometry({ size: [sh.width, sh.height] }).add(
                new Transform({ position: [...sh.center, 1], rotation }),
            );
        }
        app.world.insert(
            entity
                .add(new StandardMaterial({ albedo: [1, 1, 1, 1], roughness: 1 }))
                .add(materialOf(s)),
        );
    }
    for (const p of scene.points ?? [])
        app.world.insert(
            new PointLight({ position: [...p.position, 1], intensity: p.intensity, range: 0 }),
        );
    const c = scene.camera;
    const camera = new Camera({
        fov: c.fovY,
        aspect: W / H,
        aspectMode: 'fixed',
        near: 0.02,
        far: 30,
    }).add(
        new Transform({
            position: [...c.position, 1],
            rotation: Transform.lookRotation(c.position, c.target),
        }),
    );
    app.world.insert(camera);
    return camera;
}

/** Imagem do motor: a média do alvo HDR em `SAMPLES` quadros, e os quadros que gravaram a cópia da tela. */
interface EngineImage {
    readonly rgb: Float32Array;
    readonly sceneCopyFrames: number;
    readonly app: Application;
    close(): void;
}

/** Desenha a cena no motor (`gi`: sem a iluminação global, com ela desligada ou ligada) e devolve a média. */
async function renderEngine(
    scene: RefractionScene,
    gi: 'absent' | 'off' | 'on' = 'absent',
): Promise<EngineImage> {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        antialias: 'accumulate',
        profiling: 'passes',
    });
    app.events.on('engineError', (e) =>
        engineErrors.push(`${scene.name}: ${e.stage}: ${e.message}`),
    );
    app.events.on('extensionRejected', (e) =>
        engineErrors.push(`${scene.name}: extensionRejected ${e.point}:${e.line}: ${e.message}`),
    );
    app.defaults.antialiasing.data.sequence = SAMPLES;
    app.defaults.ambient.data.intensity = 0;
    const camera = buildEngine(app, scene);
    const ready = { revision: -1, at: 0 };
    if (gi !== 'absent') {
        app.events.on('globalIlluminationReady', (e) => {
            ready.revision = e.revision;
            ready.at = performance.now();
        });
        app.world.insert(
            new GlobalIllumination({
                quality: 'high',
                bounces: 3,
                probeSpacing: 0.3,
                cascades: 1,
                center: [0, 1.5, 0],
                enabled: gi === 'on',
            }),
        );
    }
    await app.whenReady({ timeoutMs: 60_000 });
    if (gi === 'on') {
        const limit = performance.now() + 120_000;
        while (ready.revision < 0 || performance.now() - ready.at < 1000) {
            if (performance.now() > limit)
                throw new Error('a iluminação global não ficou pronta em 120 s');
            app.step(1 / 60);
            await new Promise((r) => setTimeout(r, 50));
        }
    }
    let sceneCopyFrames = 0;
    const off = app.events.on('gpuFrameTimed', (e: GpuFrameTimedPayload) => {
        if (Object.keys(e.passesMs).some((k) => k.includes('sceneCopy'))) sceneCopyFrames++;
    });
    // A acumulação recomeça no corte: os SAMPLES quadros seguintes são as posições da amostra 1 a SAMPLES.
    camera.cut();
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    const rgb = new Float32Array(W * H * 3);
    for (let f = 0; f < SAMPLES; f++) {
        app.step(1 / 60);
        const img = await readHdrTexture(app, texture);
        for (let i = 0; i < W * H; i++)
            for (let k = 0; k < 3; k++) rgb[i * 3 + k]! += img.data[i * 4 + k]! / SAMPLES;
    }
    // Os tempos chegam alguns quadros depois.
    await new Promise((r) => setTimeout(r, 300));
    off();
    return {
        rgb,
        sceneCopyFrames,
        app,
        close() {
            app.dispose();
            canvas.remove();
        },
    };
}

// ── A referência ─────────────────────────────────────────────────────────────────────────────────────────────────

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

/** A mesma cena no traçador da CPU. */
function referenceScene(scene: RefractionScene): { scene: PtScene; camera: PtCamera } {
    const objects: PtObject[] = scene.solids.map((s) => {
        const sh = s.shape;
        let shape: PtObject['shape'];
        if (sh.kind === 'box')
            shape = { kind: 'box', min: sh.min, max: sh.max, rotationY: sh.yaw ?? 0 };
        else if (sh.kind === 'sphere')
            shape = { kind: 'sphere', center: sh.center, radius: sh.radius };
        else {
            // O plano de pé, girado `yaw` em y: x local → (cos, 0, −sen).
            const u: Vec3 = [sh.width * Math.cos(sh.yaw), 0, -sh.width * Math.sin(sh.yaw)];
            const v: Vec3 = [0, sh.height, 0];
            shape = {
                kind: 'quad',
                corner: sub3(sub3(sh.center, scale3(u, 0.5)), scale3(v, 0.5)),
                u,
                v,
            };
        }
        return {
            id: s.id,
            shape,
            material: {
                albedo: s.albedo ?? [0, 0, 0],
                ...(s.emission !== undefined ? { emission: s.emission } : {}),
                ...(s.glass !== undefined ? { dielectric: s.glass } : {}),
                ...(s.checker !== undefined ? { checker: s.checker } : {}),
            },
        };
    });
    return {
        scene: {
            objects,
            lights: (scene.points ?? []).map((p) => ({
                kind: 'point' as const,
                position: p.position,
                intensity: [p.intensity, p.intensity, p.intensity] as Vec3,
            })),
        },
        camera: {
            position: scene.camera.position,
            target: scene.camera.target,
            fovY: scene.camera.fovY,
        },
    };
}

/** A referência de `SAMPLES` amostras por pixel (`firstSample`: outra sequência, independente). */
async function renderReference(scene: RefractionScene, firstSample = 0): Promise<PtImage> {
    const { scene: pt, camera } = referenceScene(scene);
    return renderPathTracedParallel(pt, camera, {
        width: W,
        height: H,
        samples: SAMPLES,
        bounces: 0,
        firstSample,
    });
}

// ── Medidas ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Pixels de cada região (id visto no centro na referência) a ≥ 2 px de qualquer outro id. */
function interiorRegions(ids: Int32Array): Map<number, number[]> {
    const out = new Map<number, number[]>();
    for (let y = 2; y < H - 2; y++)
        for (let x = 2; x < W - 2; x++) {
            const id = ids[y * W + x]!;
            if (id < 0) continue;
            let inside = true;
            for (let dy = -2; dy <= 2 && inside; dy++)
                for (let dx = -2; dx <= 2; dx++)
                    if (ids[(y + dy) * W + x + dx] !== id) {
                        inside = false;
                        break;
                    }
            if (!inside) continue;
            let list = out.get(id);
            if (list === undefined) out.set(id, (list = []));
            list.push(y * W + x);
        }
    return out;
}

const meanOf = (rgb: Float32Array, pixels: readonly number[]): Vec3 => {
    const s = [0, 0, 0];
    for (const p of pixels) for (let k = 0; k < 3; k++) s[k]! += rgb[p * 3 + k]!;
    return [s[0]! / pixels.length, s[1]! / pixels.length, s[2]! / pixels.length];
};

/** Erro relativo por canal (o piso: 5 % da luminância, para canais quase pretos). */
function relError(a: Vec3, ref: Vec3): number {
    const lum = 0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2];
    let worst = 0;
    for (let k = 0; k < 3; k++)
        worst = Math.max(worst, Math.abs(a[k]! - ref[k]!) / Math.max(ref[k]!, 0.05 * lum, 1e-6));
    return worst;
}

/** Os quatro quadrantes do retângulo de uma região (os que têm ≥ 50 pixels). */
function quadrants(pixels: readonly number[]): number[][] {
    const xs = pixels.map((p) => p % W);
    const ys = pixels.map((p) => Math.floor(p / W));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const q: number[][] = [[], [], [], []];
    pixels.forEach((p, i) => q[(xs[i]! < cx ? 0 : 1) + (ys[i]! < cy ? 0 : 2)]!.push(p));
    return q.filter((list) => list.length >= 50);
}

/** O pior erro das regiões e dos quadrantes de `img` contra `ref` (as regiões com ≥ 100 pixels). */
function regionErrors(
    img: Float32Array,
    ref: Float32Array,
    regions: Map<number, number[]>,
): { worst: number; where: string; lines: string[] } {
    let worst = 0;
    let where = '';
    const lines: string[] = [];
    for (const [id, pixels] of regions) {
        if (pixels.length < 100) continue;
        const parts = [pixels, ...quadrants(pixels)];
        const errs = parts.map((p) => relError(meanOf(img, p), meanOf(ref, p)));
        const e = Math.max(...errs);
        lines.push(
            `região ${id} (${pixels.length} px): ${pct(errs[0]!)}; quadrantes até ${pct(e)}`,
        );
        if (e > worst) {
            worst = e;
            where = `região ${id}`;
        }
    }
    return { worst, where, lines };
}

/** Luminância de uma linha (`transpose`: de uma coluna) da imagem. */
function lineOf(rgb: Float32Array, v: number, transpose: boolean): Float32Array {
    const n = transpose ? H : W;
    const out = new Float32Array(n);
    for (let u = 0; u < n; u++) {
        const i = (transpose ? u * W + v : v * W + u) * 3;
        out[u] = 0.2126 * rgb[i]! + 0.7152 * rgb[i + 1]! + 0.0722 * rgb[i + 2]!;
    }
    return out;
}

/**
 * Degraus da borda vista pela lente contra a referência. Na referência, por linha e por coluna, as bordas nítidas que
 * atravessam a linha: onde a luminância cruza o meio entre o claro e o escuro a 3 px de cada lado (dentro da região;
 * contraste ≥ 4×, diferença ≥ 0,3, o salto entre os dois pixels ≥ 25 % dela), e só as resolvidas (nenhum outro cruzamento
 * desse meio a < 6 px: junto da beirada da lente o xadrez comprimido tem casas de 2–4 px). Na imagem medida, onde a
 * mesma linha cruza o mesmo nível mais perto (até 3 px; sem cruzamento, conta como degrau). Degrau: a borda deslocada
 * ≥ 1 px de onde a referência a põe. Devolve os degraus, as bordas medidas e o percentil 99 do deslocamento.
 */
function edgeSteps(
    rgb: Float32Array,
    ref: Float32Array,
    pixels: readonly number[],
): { steps: number; crossings: number; p99: number } {
    const inside = new Uint8Array(W * H);
    for (const p of pixels) inside[p] = 1;
    const offsets: number[] = [];
    let steps = 0;
    /** Cruzamentos do nível `mid` na linha `l` entre `a` e `b` (posição subpixel). */
    const crossingsOf = (l: Float32Array, mid: number, a: number, b: number): number[] => {
        const out: number[] = [];
        for (let u = Math.max(0, a); u < Math.min(l.length - 1, b); u++) {
            const p = l[u]! - mid;
            const q = l[u + 1]! - mid;
            if (p !== q && (p === 0 || Math.sign(p) !== Math.sign(q))) out.push(u + p / (p - q));
        }
        return out;
    };
    for (const transpose of [false, true]) {
        const [nu, nv] = transpose ? [H, W] : [W, H];
        const ok = (u: number, v: number): boolean =>
            (transpose ? inside[u * W + v] : inside[v * W + u]) === 1;
        for (let v = 0; v < nv; v++) {
            const r = lineOf(ref, v, transpose);
            const m = lineOf(rgb, v, transpose);
            for (let u = 3; u < nu - 4; u++) {
                if (!ok(u - 3, v) || !ok(u + 4, v)) continue;
                const lo = Math.min(r[u - 3]!, r[u + 4]!);
                const hi = Math.max(r[u - 3]!, r[u + 4]!);
                if (hi < 4 * lo || hi - lo < 0.3) continue;
                const mid = 0.5 * (lo + hi);
                const a = r[u]! - mid;
                const b = r[u + 1]! - mid;
                if (a === 0 || Math.sign(a) === Math.sign(b) || Math.abs(b - a) < 0.25 * (hi - lo))
                    continue;
                const x = u + a / (a - b);
                if (
                    crossingsOf(r, mid, u - 6, u + 7).some(
                        (y) => Math.abs(y - x) > 1e-6 && Math.abs(y - x) < 6,
                    )
                )
                    continue;
                const near = crossingsOf(m, mid, u - 4, u + 5);
                const d = Math.min(3, ...near.map((y) => Math.abs(y - x)));
                if (d >= 1) steps++;
                offsets.push(d);
            }
        }
    }
    offsets.sort((p, q) => p - q);
    const p99 = offsets.length === 0 ? 0 : offsets[Math.floor(0.99 * (offsets.length - 1))]!;
    return { steps, crossings: offsets.length, p99 };
}

/**
 * Diagnóstico (`?dump=1`): a referência, o motor e a diferença × 4 lado a lado, com mapeamento x/(1 + x) e gama 2,2
 * (fixture `zz-refraction-<cena>.png`, fora do commit).
 */
async function dump(name: string, ref: Float32Array, img: Float32Array): Promise<void> {
    if (new URLSearchParams(location.search).get('dump') !== '1') return;
    const data = new ImageData(W * 3, H);
    const tone = (v: number): number =>
        Math.round(255 * Math.pow(Math.max(0, v) / (1 + Math.max(0, v)), 1 / 2.2));
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 3;
            for (let k = 0; k < 3; k++) {
                data.data[(y * W * 3 + x) * 4 + k] = tone(ref[i + k]!);
                data.data[(y * W * 3 + W + x) * 4 + k] = tone(img[i + k]!);
                data.data[(y * W * 3 + 2 * W + x) * 4 + k] = tone(
                    4 * Math.abs(img[i + k]! - ref[i + k]!),
                );
            }
            for (let c = 0; c < 3; c++) data.data[(y * W * 3 + c * W + x) * 4 + 3] = 255;
        }
    const c = new OffscreenCanvas(W * 3, H);
    c.getContext('2d')!.putImageData(data, 0, 0);
    await writeFixture(
        `zz-refraction-${name}.png`,
        new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()),
    );
}

// ── Casos ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Compara uma cena; devolve as regiões e a imagem do motor (para quem mede mais). */
async function compareScene(
    scene: RefractionScene,
): Promise<{ ref: PtImage; regions: Map<number, number[]>; engine: EngineImage }> {
    const ref = await renderReference(scene);
    const engine = await renderEngine(scene);
    const regions = interiorRegions(ref.ids);
    const limit = scene.limit ?? 0.03;
    const { worst, where, lines } = regionErrors(engine.rgb, ref.rgb, regions);
    await dump(scene.name, ref.rgb, engine.rgb);
    for (const l of lines) log(`  ${scene.name}: ${l}`);
    log(
        `${scene.name}: pior erro por região ${pct(worst)} (${where}; limite ${pct(limit)}); quadros com a cópia da tela ${engine.sceneCopyFrames}`,
    );
    check(
        worst <= limit,
        `${scene.name}: erro por região ${pct(worst)} em ${where} > ${pct(limit)}`,
    );
    check(
        engine.sceneCopyFrames === 0,
        `${scene.name}: ${engine.sceneCopyFrames} quadros com o passe de cópia da tela`,
    );
    return { ref, regions, engine };
}

async function caseLens(): Promise<void> {
    const { ref, regions, engine } = await compareScene(LENS);
    try {
        const lens = regions.get(10) ?? [];
        // Controle da medida: a referência em blocos de 4 px (a imagem ampliada 4× sem filtro) tem degraus.
        const blocky = new Float32Array(ref.rgb.length);
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const sy = Math.min(H - 1, 4 * Math.floor(y / 4) + 2);
                const sx = Math.min(W - 1, 4 * Math.floor(x / 4) + 2);
                blocky.set(
                    ref.rgb.subarray((sy * W + sx) * 3, (sy * W + sx) * 3 + 3),
                    (y * W + x) * 3,
                );
            }
        const b = edgeSteps(blocky, ref.rgb, lens);
        // E não acusa o ruído: outra referência, de amostras independentes, não tem degrau.
        const other = edgeSteps((await renderReference(LENS, SAMPLES)).rgb, ref.rgb, lens);
        log(
            `lens: controle — outra referência (amostras independentes): ${other.steps} degraus em ${other.crossings} cruzamentos (p99 ${other.p99.toFixed(3)} px)`,
        );
        check(
            other.steps === 0,
            `lens: a medida dos degraus acusa o ruído da referência (${other.steps} de ${other.crossings})`,
        );
        log(
            `lens: controle — a referência em blocos de 4 px: ${b.steps} degraus em ${b.crossings} cruzamentos (p99 ${b.p99.toFixed(3)} px)`,
        );
        check(
            b.steps > b.crossings / 10,
            `lens: a medida dos degraus não acusa a imagem em blocos (${b.steps} de ${b.crossings})`,
        );
        const e = edgeSteps(engine.rgb, ref.rgb, lens);
        log(
            `lens: degraus da borda do xadrez vista pela lente — ${e.steps} em ${e.crossings} cruzamentos (p99 ${e.p99.toFixed(3)} px)`,
        );
        check(
            e.crossings > 200 && e.steps === 0,
            `lens: ${e.steps} degraus de pixel na borda vista pela lente (de ${e.crossings} cruzamentos)`,
        );
        // A energia contada como absorvida no limite de interfaces (o contador do `Refraction`, T040/T044).
        const RefractionClass = (clayflow as Record<string, unknown>).Refraction;
        if (typeof RefractionClass !== 'function') {
            check(
                false,
                'lens: `Refraction` ausente — a fração da energia no limite de interfaces não foi medida',
            );
        } else {
            const stats = (
                engine.app as unknown as {
                    refractionStats?: () => Promise<{ truncatedEnergy: number }>;
                }
            ).refractionStats;
            if (stats === undefined)
                check(false, 'lens: sem a leitura do contador do limite de interfaces');
            else {
                const { truncatedEnergy } = await stats.call(engine.app);
                log(`lens: energia no limite de interfaces ${pct(truncatedEnergy)}`);
                check(
                    truncatedEnergy <= 0.001,
                    `lens: energia no limite de interfaces ${pct(truncatedEnergy)} > 0,1 %`,
                );
            }
        }
    } finally {
        engine.close();
    }
}

async function caseGi(): Promise<void> {
    const scene = SCENES[0]!;
    const ref = await renderReference(scene);
    const regions = interiorRegions(ref.ids);
    const images: Record<string, Float32Array> = {};
    for (const gi of ['absent', 'off', 'on'] as const) {
        const e = await renderEngine(scene, gi);
        images[gi] = e.rgb;
        check(
            e.sceneCopyFrames === 0,
            `gi ${gi}: ${e.sceneCopyFrames} quadros com o passe de cópia da tela`,
        );
        e.close();
    }
    for (const [a, b] of [
        ['off', 'absent'],
        ['on', 'absent'],
    ] as const) {
        const { worst, where } = regionErrors(images[a]!, images[b]!, regions);
        log(
            `gi: ${a} contra ${b} — maior diferença por região ${pct(worst)}${where === '' ? '' : ` (${where})`}; limite 0,50 %`,
        );
        check(worst <= 0.005, `gi: ${a} contra ${b} difere ${pct(worst)} em ${where} > 0,5 %`);
    }
}

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const scene of SCENES) {
        if (only !== null && only !== scene.name) continue;
        log(`── ${scene.name}`);
        const { engine } = await compareScene(scene);
        engine.close();
    }
    if (only === null || only === 'lens') {
        log('── lens');
        await caseLens();
    }
    if (only === null || only === 'gi') {
        log('── gi');
        await caseGi();
    }
    check(engineErrors.length === 0, `erros do motor: ${engineErrors.slice(0, 5).join(' | ')}`);
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('REFRACTION SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

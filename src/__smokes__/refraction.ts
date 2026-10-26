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
//     xadrez vista pela lente (por linha e por coluna, a posição subpixel de cada cruzamento da borda contra a de uma
//     referência de 1024 amostras: nenhum deslocado ≥ 1 px; controles da medida: a referência em blocos de 4 px tem
//     degraus, outra referência de 1024 amostras independentes não tem — com 256, o ruído dela desloca 1 cruzamento em
//     3401); a fração da energia contada como absorvida no limite de interfaces ≤ 0,1 % (o alfa da radiância traçada).
//   - cost: a cena `lens` a 1280 × 720 no modo temporal (o traçado de todo pixel do vidro, o filtro do sinal traçado e
//     a marca de movimento): o tempo de parede de um quadro (blocos de 40 quadros seguidos com a fila da GPU esvaziada no fim; a
//     mediana de três blocos) com a refração ligada menos a desligada ≤ 3 ms (SC-011, 18 % do quadro de 60 Hz no M4; o filtro e a
//     marca são da refração, não do antisserrilhado — decisão de 2026-10-24). Não os carimbos por passe: no M4 os
//     passes se sobrepõem e o intervalo de um conta o fim do outro.
//   - glint: a cena `dispersed` com o teto 10× mais claro (o céu de dia contra o chão visto pela água) — ≤ 3 %; e os
//     vagalumes do sinal traçado na esfera (T065i): sem o antisserrilhado (a amostra no centro do pixel, a única
//     aleatoriedade é a do caminho), as amostras acima de 4× a média do pixel ≤ 0,05 % das amostras.
//   - gi: a cena `sphere` sem a iluminação global, com ela desligada e com ela ligada: as médias por região iguais a
//     ≤ 0,5 % (SC-002; albedo 0, nenhuma luz indireta a descontar) (US1-6).
// Em todas: nenhum quadro com o passe de cópia da tela (`sceneCopy`): 0 leituras dela pelos transmissivos (SC-001).
// Diagnóstico: `--query dump=1` grava a referência, o motor e a diferença de cada cena (`zz-refraction-*.png`).
// Para rodar: `npm run smoke -- refraction [--query case=sphere]`. Resultado: `REFRACTION SMOKE PASSED` ou `FAIL: …`.
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
    nodes,
    type GraphArgument,
    type MaterialFunction,
    type NodeUse,
    type StagingBufferSpec,
    type AntialiasingMode,
} from 'clayflow';
import type {
    PtCamera,
    PtDielectric,
    PtImage,
    PtObject,
    PtScene,
} from '../elements/lighting/reference/pathTracer';
import { readHdrTexture } from './support/imageMeasures';
import { materialGraph } from './support/materialScenes';
import { renderPathTracedParallel } from './support/pathTraceParallel';
import { writeFixture } from './support/fixtures';
import { luminanceLinear } from './support/images';

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

/**
 * Cômodo de 4 × 3 × 4 m de paredes emissoras (albedo 0); chão em xadrez emissor de lado `floorCell`; o teto com a
 * emissão `ceiling`.
 */
function room(floorCell = 0.1, back: 'emissive' | 'diffuse' = 'emissive', ceiling = 0.6): Solid[] {
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
            emission: [ceiling, ceiling, ceiling],
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

/**
 * T065a: placa de vidro com relevo (a normal do material pelo nó `closure.normal`) sobre o xadrez — o relevo entorta as
 * casas vistas por ela. A média por região quase não vê o relevo (ele só redistribui a luz dentro da placa); a medida
 * dele é a dos degraus da borda, como na lente.
 */
const RELIEF_GLASS: PtDielectric = {
    ior: 1.5,
    bump: { kind: 'sines', amplitude: 0.01, wavenumber: (2 * Math.PI) / 0.2 },
};
const RELIEF: RefractionScene = {
    name: 'relief',
    solids: [
        ...room(0.1),
        {
            id: 10,
            shape: { kind: 'box', min: [-0.6, 0.2, -0.4], max: [0.6, 0.35, 0.4] },
            glass: RELIEF_GLASS,
        },
    ],
    camera: { position: [0, 1.3, 1.2], target: [0, 0.25, 0], fovY: 0.7 },
};

/**
 * T065b: tanque de água (IOR 1,33) com as ondulações do nó `surface.ripple` (paradas, `speed` 0: o motor acumula
 * quadros e a referência é um instante) sobre o xadrez; as paredes do tanque ficam lisas (o peso das ondulações é 0 nas
 * faces de lado).
 */
const RIPPLE_WATER: PtDielectric = {
    ior: 1.33,
    bump: { kind: 'ripple', strength: 0.3, size: 0.15, speed: 0, time: 0, up: [0, 1, 0] },
};
const RIPPLE: RefractionScene = {
    name: 'ripple',
    solids: [
        ...room(0.1),
        {
            id: 20,
            shape: { kind: 'box', min: [-0.8, -0.01, -0.6], max: [0.8, 0.3, 0.6] },
            glass: RIPPLE_WATER,
        },
    ],
    camera: { position: [0, 1.3, 1.2], target: [0, 0.2, 0], fovY: 0.7 },
};

/**
 * T065g: a esfera de vidro sem dispersão (prioridade 1) meio dentro da água com a dispersão dela (Abbe 55,7) — a
 * primeira interface dispersiva do caminho é a segunda ou a terceira, não a primeira. O ruído do sinal traçado (variância
 * entre quadros sobre o quadrado da média, na região da esfera) contra o da mesma cena com a água sem dispersão:
 * ≤ 1,25× (antes da T065g, 16×).
 */
const DISPERSED_WATER: PtDielectric = { ior: 1.33, abbe: 55.7 };
const DISPERSED: RefractionScene = {
    name: 'dispersed',
    solids: [
        ...room(0.1),
        {
            id: 20,
            shape: { kind: 'box', min: [-1, -0.01, -0.8], max: [1, 0.5, 0.8] },
            glass: DISPERSED_WATER,
        },
        {
            id: 10,
            shape: { kind: 'sphere', center: [0, 0.5, 0], radius: 0.35 },
            glass: { ior: 1.5, priority: 1 },
        },
    ],
    // Câmera baixa, como no vídeo `ondulacao`: pela metade de cima da esfera o raio sai para o ar e só a terceira
    // interface (a superfície da água atrás) é dispersiva; pela de baixo, a segunda (a saída do vidro na água).
    camera: { position: [0, 0.8, 1.7], target: [0, 0.5, 0], fovY: 0.75 },
};

/**
 * T065i: a cena `dispersed` com o teto 10× mais claro — o céu de dia contra o chão visto pela água, como no vídeo
 * `ondulacao`. Da terceira interface em diante o caminho escolhe um lobo pela roleta de Fresnel; o raro (a reflexão de
 * 2–4 % na água vista de cima) leva o peso 1/F e vê o teto: o vagalume.
 */
const GLINT: RefractionScene = {
    ...DISPERSED,
    name: 'glint',
    solids: [...room(0.1, 'emissive', 6), ...DISPERSED.solids.filter((x) => x.id >= 10)],
};

// ── O motor ──────────────────────────────────────────────────────────────────────────────────────────────────────

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

/** Constante escalar e de cor como nós. */
const scalarNode = (value: number) => nodes.math.value.with({ value });
const colorNode = (value: Vec3) => nodes.math.value3.with({ value: [...value] });

/**
 * A função `material` do sólido montada pelo grafo de nós (o caminho de autoria do desenvolvedor): o mesmo material da
 * referência — o vidro por `bsdf.dielectric` + `bsdf.transmission`, com a prioridade do meio e a parede fina pelos nós
 * de fechamento; o opaco por `bsdf.diffuse` e `bsdf.emission`, o xadrez pela posição de mundo.
 */
function materialOf(s: Solid): MaterialFunction {
    const g = s.glass;
    if (g !== undefined) {
        const roughness = g.roughness ?? 0;
        const graph: Record<string, NodeUse | GraphArgument> = {
            reflect: nodes.bsdf.dielectric.with({
                ior: g.ior,
                tint: [1, 1, 1],
                roughness,
                anisotropy: 0,
                tangent: [0, 0, 0],
            }),
            transmit: nodes.bsdf.transmission.with({
                ior: g.ior,
                color: [...(g.color ?? [1, 1, 1])],
                depth: g.depth ?? 0,
                abbe: g.abbe ?? 0,
                roughness,
            }),
            glass: nodes.closure.add,
        };
        const links: [string, string][] = [
            ['reflect.value', 'glass.a'],
            ['transmit.value', 'glass.b'],
        ];
        let out = 'glass.value';
        if (g.bump?.kind === 'sines') {
            // O relevo (T065a): h = A · sen(k·x) · sen(k·z); a normal de sombreamento n − (∇h − (∇h·n) n), normalizada,
            // pelo nó `closure.normal` — a mesma conta de `bumpNormal` da referência.
            const k = g.bump.wavenumber;
            Object.assign(graph, {
                s: nodes.input.surfaceSample(),
                xyz: nodes.math.split3,
                k: scalarNode(k),
                ak: scalarNode(g.bump.amplitude * k),
                zero: scalarNode(0),
                kx: nodes.math.mul,
                kz: nodes.math.mul,
                sx: nodes.math.sin,
                cx: nodes.math.cos,
                sz: nodes.math.sin,
                cz: nodes.math.cos,
                cxsz: nodes.math.mul,
                sxcz: nodes.math.mul,
                gx: nodes.math.mul,
                gz: nodes.math.mul,
                grad: nodes.math.combine3,
                gn: nodes.math.dot,
                along: nodes.math.scale3,
                tangent: nodes.math.sub3,
                bent: nodes.math.sub3,
                shading: nodes.math.normalize,
                bump: nodes.closure.normal,
            });
            links.push(
                ['s.world_position', 'xyz.v'],
                ['xyz.x', 'kx.a'],
                ['k.value', 'kx.b'],
                ['xyz.z', 'kz.a'],
                ['k.value', 'kz.b'],
                ['kx.value', 'sx.x'],
                ['kx.value', 'cx.x'],
                ['kz.value', 'sz.x'],
                ['kz.value', 'cz.x'],
                ['cx.value', 'cxsz.a'],
                ['sz.value', 'cxsz.b'],
                ['sx.value', 'sxcz.a'],
                ['cz.value', 'sxcz.b'],
                ['cxsz.value', 'gx.a'],
                ['ak.value', 'gx.b'],
                ['sxcz.value', 'gz.a'],
                ['ak.value', 'gz.b'],
                ['gx.value', 'grad.x'],
                ['zero.value', 'grad.y'],
                ['gz.value', 'grad.z'],
                ['grad.value', 'gn.a'],
                ['s.normal', 'gn.b'],
                ['s.normal', 'along.v'],
                ['gn.value', 'along.s'],
                ['grad.value', 'tangent.a'],
                ['along.value', 'tangent.b'],
                ['s.normal', 'bent.a'],
                ['tangent.value', 'bent.b'],
                ['bent.value', 'shading.v'],
                [out, 'bump.c'],
                ['shading.value', 'bump.normal'],
            );
            out = 'bump.value';
        }
        if (g.bump?.kind === 'ripple') {
            // As ondulações (T065b): o nó `surface.ripple` na posição, na normal e no tempo da amostra, até
            // `closure.normal`.
            const r = g.bump;
            Object.assign(graph, {
                s: nodes.input.surfaceSample(),
                ripple: nodes.surface.ripple.with({
                    strength: r.strength,
                    size: r.size,
                    speed: r.speed,
                    up: [...r.up],
                }),
                bump: nodes.closure.normal,
            });
            links.push(
                ['s.world_position', 'ripple.position'],
                ['s.normal', 'ripple.normal'],
                ['s.time', 'ripple.time'],
                [out, 'bump.c'],
                ['ripple.value', 'bump.normal'],
            );
            out = 'bump.value';
        }
        if (g.priority !== undefined) {
            graph.priority = nodes.closure.mediumPriority.with({ priority: g.priority });
            links.push([out, 'priority.c']);
            out = 'priority.value';
        }
        // O plano de vidro é placa de espessura zero, como o quadrilátero da referência.
        if (s.shape.kind === 'pane') {
            graph.thin = nodes.closure.thinWalled;
            links.push([out, 'thin.c']);
            out = 'thin.value';
        }
        return materialGraph(graph, links, out);
    }
    const graph: Record<string, NodeUse | GraphArgument> = {
        diffuse: nodes.bsdf.diffuse.with({ color: [...(s.albedo ?? [0, 0, 0])], roughness: 0 }),
    };
    const links: [string, string][] = [];
    const c = s.checker;
    if (c !== undefined) {
        // A casa: floor(a / tamanho) + floor(b / tamanho); ímpar com 2 · fract(casa / 2) = 1.
        const [a, b] = c.axes;
        Object.assign(graph, {
            p: nodes.input.worldPosition(),
            axes: nodes.math.split3,
            size: scalarNode(c.size),
            da: nodes.math.div,
            db: nodes.math.div,
            fa: nodes.math.floor,
            fb: nodes.math.floor,
            cell: nodes.math.add,
            half: scalarNode(0.5),
            two: scalarNode(2),
            halfCell: nodes.math.mul,
            parity: nodes.math.fract,
            odd: nodes.math.mul,
        });
        links.push(
            ['p.world_position', 'axes.v'],
            [`axes.${AXES[a]}`, 'da.a'],
            ['size.value', 'da.b'],
            [`axes.${AXES[b]}`, 'db.a'],
            ['size.value', 'db.b'],
            ['da.value', 'fa.x'],
            ['db.value', 'fb.x'],
            ['fa.value', 'cell.a'],
            ['fb.value', 'cell.b'],
            ['cell.value', 'halfCell.a'],
            ['half.value', 'halfCell.b'],
            ['halfCell.value', 'parity.x'],
            ['parity.value', 'odd.a'],
            ['two.value', 'odd.b'],
        );
        const pick = (name: string, pair: readonly [Vec3, Vec3], into: string): void => {
            graph[`${name}Even`] = colorNode(pair[0]);
            graph[`${name}Odd`] = colorNode(pair[1]);
            graph[name] = nodes.condition.select3;
            links.push(
                [`${name}Even.value`, `${name}.if_false`],
                [`${name}Odd.value`, `${name}.if_true`],
                ['odd.value', `${name}.condition`],
                [`${name}.value`, into],
            );
        };
        if (c.albedo !== undefined) pick('albedo', c.albedo, 'diffuse.color');
        if (c.emission !== undefined) pick('emission', c.emission, 'emit.color');
    }
    if (s.emission !== undefined || c?.emission !== undefined) {
        graph.emit = nodes.bsdf.emission.with({
            color: [...(s.emission ?? [0, 0, 0])],
            luminance: 1,
        });
        graph.surface = nodes.closure.add;
        links.push(['diffuse.value', 'surface.a'], ['emit.value', 'surface.b']);
        return materialGraph(graph, links, 'surface.value');
    }
    return materialGraph(graph, links, 'diffuse.value');
}

/** Monta a cena no motor; devolve a câmera. */
function buildEngine(app: Application, scene: RefractionScene, aspect = W / H): Camera {
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
        aspect,
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

/**
 * Imagem do motor: a média do alvo HDR em `SAMPLES` quadros, os quadros que gravaram a cópia da tela e, por pixel, a
 * média do que o traçado da refração escreveu — a luminância traçada (transmitida mais refletida) e a energia contada
 * como absorvida no limite de interfaces (o alfa de `Refraction.radiance`, T044); vazias sem os alvos da refração.
 */
interface EngineImage {
    readonly rgb: Float32Array;
    readonly sceneCopyFrames: number;
    readonly traced: Float32Array;
    readonly truncated: Float32Array;
    /**
     * Por pixel, a variância do sinal traçado (`radiance`, uma amostra por quadro, antes do filtro) entre os quadros,
     * somada nos três canais, e o quadrado da média dele, somado nos canais (o ruído relativo de uma região é a razão
     * das médias dos dois).
     */
    readonly tracedVariance: Float32Array;
    readonly tracedMean2: Float32Array;
    /** A luminância do sinal traçado de cada quadro nos pixels `watch` (quadro a quadro, `watch.length` por quadro). */
    readonly watched: Float32Array;
    readonly app: Application;
    close(): void;
}

/**
 * Desenha a cena no motor (`gi`: sem a iluminação global, com ela desligada ou ligada; `aa`: o antisserrilhado, o
 * acúmulo por padrão; `watch`: os pixels de que guardar o sinal traçado de cada quadro) e devolve a média.
 */
async function renderEngine(
    scene: RefractionScene,
    gi: 'absent' | 'off' | 'on' = 'absent',
    aa: AntialiasingMode = 'accumulate',
    watch: readonly number[] = [],
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
        antialias: aa,
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
    const traced = new Float32Array(W * H);
    const truncated = new Float32Array(W * H);
    const sum = new Float64Array(W * H * 3);
    const sq = new Float64Array(W * H * 3);
    const watched = new Float32Array(SAMPLES * watch.length);
    const lum = (d: Float32Array, i: number): number =>
        luminanceLinear(d.subarray(i * 4, i * 4 + 3));
    for (let f = 0; f < SAMPLES; f++) {
        app.step(1 / 60);
        const img = await readHdrTexture(app, texture);
        for (let i = 0; i < W * H; i++)
            for (let k = 0; k < 3; k++) rgb[i * 3 + k]! += img.data[i * 4 + k]! / SAMPLES;
        const refraction = app.defaults.refraction;
        const radiance = app.resources.textureOf(refraction, 'radiance');
        if (radiance === undefined) continue;
        const t = (await readHdrTexture(app, radiance)).data;
        for (let i = 0; i < W * H; i++) {
            traced[i]! += lum(t, i) / SAMPLES;
            truncated[i]! += t[i * 4 + 3]! / SAMPLES;
            for (let k = 0; k < 3; k++) {
                const v = t[i * 4 + k]!;
                sum[i * 3 + k]! += v;
                sq[i * 3 + k]! += v * v;
            }
        }
        watch.forEach((i, j) => (watched[f * watch.length + j] = lum(t, i)));
    }
    const tracedVariance = new Float32Array(W * H);
    const tracedMean2 = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++)
        for (let k = 0; k < 3; k++) {
            const m = sum[i * 3 + k]! / SAMPLES;
            tracedMean2[i]! += m * m;
            tracedVariance[i]! += Math.max(0, sq[i * 3 + k]! / SAMPLES - m * m);
        }
    // Os tempos chegam alguns quadros depois.
    await new Promise((r) => setTimeout(r, 300));
    off();
    return {
        rgb,
        sceneCopyFrames,
        traced,
        truncated,
        tracedVariance,
        tracedMean2,
        watched,
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
async function renderReference(
    scene: RefractionScene,
    firstSample = 0,
    samples = SAMPLES,
): Promise<PtImage> {
    const { scene: pt, camera } = referenceScene(scene);
    return renderPathTracedParallel(pt, camera, {
        width: W,
        height: H,
        samples,
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
    const lum = luminanceLinear(ref);
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
        out[u] = luminanceLinear(rgb.subarray(i, i + 3));
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
/** Lê de volta `bytes` bytes de um buffer, ou de uma textura (linhas de `rowBytes`), num buffer de leitura. */
async function readBack(
    app: Application,
    source:
        | { readonly kind: 'buffer'; readonly spec: unknown; readonly bytes: number }
        | {
              readonly kind: 'texture';
              readonly spec: { readonly width: number; readonly height: number };
              readonly rowBytes: number;
          },
): Promise<{ data: ArrayBuffer; bytesPerRow: number }> {
    const bytesPerRow =
        source.kind === 'texture' ? Math.ceil(source.rowBytes / 256) * 256 : source.bytes;
    const rows = source.kind === 'texture' ? source.spec.height : 1;
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `refraction_readback_${source.kind}_${bytesPerRow}x${rows}`,
        byteSize: bytesPerRow * rows,
    });
    app.core.record('refraction-readback', (frame) => {
        if (source.kind === 'buffer')
            frame.copy(source.spec as Parameters<typeof frame.copy>[0], staging, source.bytes);
        else
            frame.copyTextureToBuffer(
                source.spec as Parameters<typeof frame.copyTextureToBuffer>[0],
                staging,
                { bytesPerRow, rowsPerImage: rows },
                [source.spec.width, rows],
            );
    });
    app.core.submit();
    const data = await app.core.readback(staging);
    app.core.destroy(staging);
    return { data, bytesPerRow };
}

/**
 * O pedido da refração do último quadro (T041): cada pixel do interior de uma região da referência (a ≥ 2 px de outra)
 * tem pedido se e só se a primeira superfície no centro dele é um dielétrico; a contagem da fila, lida da GPU, é a dos
 * pixels com pedido.
 */
async function checkRequest(
    scene: RefractionScene,
    engine: EngineImage,
    regions: Map<number, number[]>,
): Promise<void> {
    const refraction = engine.app.defaults.refraction;
    const request = engine.app.resources.textureOf(refraction, 'request');
    const count = engine.app.resources.bufferOf(refraction, 'queueCount');
    if (request === undefined || count === undefined) {
        check(false, `${scene.name}: pedido da refração não alocado`);
        return;
    }
    const { data, bytesPerRow } = await readBack(engine.app, {
        kind: 'texture',
        spec: request,
        rowBytes: request.width * 8,
    });
    const words = new Uint32Array(data);
    const marked = new Uint8Array(W * H);
    let total = 0;
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const v = words[(y * bytesPerRow) / 4 + x * 2 + 1]! & 1;
            marked[y * W + x] = v;
            total += v;
        }
    const queued = new Uint32Array(
        (await readBack(engine.app, { kind: 'buffer', spec: count, bytes: 4 })).data,
    )[0]!;
    const glass = new Set(scene.solids.filter((o) => o.glass !== undefined).map((o) => o.id));
    let wrong = 0;
    let interior = 0;
    for (const [id, pixels] of regions)
        for (const i of pixels) {
            interior++;
            if ((marked[i] === 1) !== glass.has(id)) wrong++;
        }
    // A luz que chega (`FrameTargets.light`, T065h): no pixel com pedido a cor é a do traçado, não a do opaco de trás —
    // a luz guardada dele não pode reiluminar o histórico da resolução temporal (a aresta de trás vista em linha reta
    // virava uma linha de pontos escuros sob o vidro). A composição escreve "sem luz medida" (zero, como o fundo).
    const light = engine.app.resources.textureOf(engine.app.defaults.targets, 'light');
    let lit = 0;
    if (light !== undefined) {
        const read = await readBack(engine.app, {
            kind: 'texture',
            spec: light,
            rowBytes: light.width * 4,
        });
        const halves = new Uint16Array(read.data);
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                if (marked[y * W + x] !== 1) continue;
                const k = (y * read.bytesPerRow) / 2 + x * 2;
                // Meia precisão: zero (com ou sem sinal) só com expoente e mantissa nulos.
                if ((halves[k]! & 0x7fff) !== 0 || (halves[k + 1]! & 0x7fff) !== 0) lit++;
            }
    }
    log(
        `${scene.name}: pedido em ${total} pixels, fila ${queued}; interior das regiões ${interior} px, ${wrong} discordam da referência; ${lit} pixels com pedido guardam a luz de trás`,
    );
    check(light !== undefined, `${scene.name}: alvo da luz que chega não alocado`);
    check(lit === 0, `${scene.name}: ${lit} pixels com pedido guardam a luz do opaco de trás`);
    check(queued === total, `${scene.name}: fila com ${queued} pixels, pedido em ${total}`);
    check(
        wrong === 0 && interior > 0,
        `${scene.name}: ${wrong} pixels do interior com o pedido diferente da referência`,
    );
}

async function compareScene(
    scene: RefractionScene,
): Promise<{ ref: PtImage; regions: Map<number, number[]>; engine: EngineImage }> {
    const ref = await renderReference(scene);
    const engine = await renderEngine(scene);
    const regions = interiorRegions(ref.ids);
    await checkRequest(scene, engine, regions);
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

/**
 * Amostras das referências da medida dos degraus: a posição de cada cruzamento da borda é medida contra a referência, e o
 * controle (outra referência, de amostras independentes) tem de dar 0 degraus — com 256 amostras o ruído da própria
 * referência desloca 1 cruzamento em 3401 além de 1 px; com 1024 o desvio padrão cai à metade.
 */
const STEP_SAMPLES = 1024;

async function caseLens(): Promise<void> {
    const { regions, engine } = await compareScene(LENS);
    try {
        const lens = regions.get(10) ?? [];
        const ref = await renderReference(LENS, 0, STEP_SAMPLES);
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
        const other = edgeSteps(
            (await renderReference(LENS, STEP_SAMPLES, STEP_SAMPLES)).rgb,
            ref.rgb,
            lens,
        );
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
        // A energia contada como absorvida no limite de interfaces (o alfa da radiância traçada, T044), sobre toda a que
        // o traçado achou nos pixels da lente.
        let cut = 0;
        let total = 0;
        for (const i of lens) {
            cut += engine.truncated[i]!;
            total += engine.traced[i]! + engine.truncated[i]!;
        }
        if (total <= 0)
            check(false, 'lens: o traçado da refração não escreveu nos pixels da lente');
        else {
            const truncatedEnergy = cut / total;
            log(`lens: energia no limite de interfaces ${pct(truncatedEnergy)}`);
            check(
                truncatedEnergy <= 0.001,
                `lens: energia no limite de interfaces ${pct(truncatedEnergy)} > 0,1 %`,
            );
        }
    } finally {
        engine.close();
    }
}

/**
 * Tempo de um quadro na cena da lente a 1280 × 720 com a refração `on`: blocos de 40 quadros seguidos, sem esperar entre
 * eles, e uma leitura no fim (a fila da GPU termina) — o tempo de parede dividido pelos quadros, a mediana de três blocos. Os
 * carimbos de tempo por passe não servem aqui: no M4 os passes se sobrepõem e o intervalo de um conta o fim do outro.
 */
async function lensFrameMs(on: boolean): Promise<number> {
    const [width, height] = [1280, 720];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        antialias: 'temporal',
    });
    app.events.on('engineError', (e) => engineErrors.push(`cost: ${e.stage}: ${e.message}`));
    app.defaults.ambient.data.intensity = 0;
    app.defaults.refraction.enabled = on;
    buildEngine(app, LENS, width / height);
    await app.whenReady({ timeoutMs: 60_000 });
    const color = app.resources.textureOf(app.defaults.targets, 'color');
    if (color === undefined) throw new Error('alvo HDR não alocado');
    // A fila da GPU termina: uma leitura do alvo de cor.
    const drain = async (): Promise<void> => {
        await readHdrTexture(app, color);
    };
    for (let i = 0; i < 30; i++) app.step(1 / 60);
    await drain();
    const blocks: number[] = [];
    for (let b = 0; b < 3; b++) {
        const t0 = performance.now();
        for (let i = 0; i < 40; i++) app.step(1 / 60);
        await drain();
        blocks.push((performance.now() - t0) / 40);
    }
    app.dispose();
    canvas.remove();
    blocks.sort((a, b) => a - b);
    return blocks[1]!;
}

/** SC-011: a refração na cena da lente ≤ 3 ms a 1280 × 720 no modo temporal. */
async function caseCost(): Promise<void> {
    const on = await lensFrameMs(true);
    const off = await lensFrameMs(false);
    log(
        `cost: lente a 1280 × 720, quadro ${on.toFixed(3)} ms com a refração, ${off.toFixed(3)} ms sem — refração ${(on - off).toFixed(3)} ms`,
    );
    check(on - off <= 3, `cost: refração ${(on - off).toFixed(3)} ms na lente (≤ 3 ms)`);
}

/**
 * T065a/T065b: o dielétrico `id` com relevo da cena. Além do erro por região, os degraus da borda do xadrez vista por
 * ele contra a referência de 1024 amostras (0, como na lente), com três controles: outra referência independente dá 0
 * (a medida não acusa o ruído), a referência em blocos de 4 px dá degraus (a medida vê o pixel) e o mesmo dielétrico liso
 * dá degraus contra o com relevo (a medida vê o relevo — sem ele no motor, a cena falharia).
 */
async function caseBumped(scene: RefractionScene, id: number): Promise<void> {
    const name = scene.name;
    const { regions, engine } = await compareScene(scene);
    try {
        const slab = regions.get(id) ?? [];
        const ref = await renderReference(scene, 0, STEP_SAMPLES);
        const other = edgeSteps(
            (await renderReference(scene, STEP_SAMPLES, STEP_SAMPLES)).rgb,
            ref.rgb,
            slab,
        );
        log(
            `${name}: controle — outra referência (amostras independentes): ${other.steps} degraus em ${other.crossings} cruzamentos (p99 ${other.p99.toFixed(3)} px)`,
        );
        check(
            other.steps === 0,
            `${name}: a medida dos degraus acusa o ruído da referência (${other.steps} de ${other.crossings})`,
        );
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
        const b = edgeSteps(blocky, ref.rgb, slab);
        log(
            `${name}: controle — a referência em blocos de 4 px: ${b.steps} degraus em ${b.crossings} cruzamentos (p99 ${b.p99.toFixed(3)} px)`,
        );
        check(
            b.steps > b.crossings / 10,
            `${name}: a medida dos degraus não acusa a imagem em blocos (${b.steps} de ${b.crossings})`,
        );
        const flat: RefractionScene = {
            ...scene,
            solids: scene.solids.map((x) =>
                x.id === id && x.glass !== undefined ? { ...x, glass: { ior: x.glass.ior } } : x,
            ),
        };
        const f = edgeSteps((await renderReference(flat, 0, STEP_SAMPLES)).rgb, ref.rgb, slab);
        log(
            `${name}: controle — o dielétrico liso: ${f.steps} degraus em ${f.crossings} cruzamentos (p99 ${f.p99.toFixed(3)} px)`,
        );
        check(
            f.steps > f.crossings / 10,
            `${name}: a medida dos degraus não distingue o dielétrico liso da com relevo (${f.steps} de ${f.crossings})`,
        );
        const e = edgeSteps(engine.rgb, ref.rgb, slab);
        log(
            `${name}: degraus da borda do xadrez vista pelo dielétrico — ${e.steps} em ${e.crossings} cruzamentos (p99 ${e.p99.toFixed(3)} px)`,
        );
        check(
            e.crossings > 200 && e.steps === 0,
            `${name}: ${e.steps} degraus de pixel na borda vista pelo dielétrico (de ${e.crossings} cruzamentos)`,
        );
    } finally {
        engine.close();
    }
}

/** Ruído relativo do sinal traçado na região: a média da variância por pixel sobre a média do quadrado da média. */
function relativeNoise(e: EngineImage, pixels: readonly number[]): number {
    let v = 0;
    let m = 0;
    for (const i of pixels) {
        v += e.tracedVariance[i]!;
        m += e.tracedMean2[i]!;
    }
    return m > 0 ? v / m : 0;
}

/**
 * T065g: o erro por região da cena `dispersed` e o ruído do sinal traçado na esfera contra o da mesma cena sem a
 * dispersão da água.
 */
async function caseDispersed(): Promise<void> {
    const { regions, engine } = await compareScene(DISPERSED);
    const plain: RefractionScene = {
        ...DISPERSED,
        solids: DISPERSED.solids.map((x) =>
            x.glass === DISPERSED_WATER ? { ...x, glass: { ior: DISPERSED_WATER.ior } } : x,
        ),
    };
    const control = await renderEngine(plain);
    try {
        const sphere = regions.get(10) ?? [];
        const noisy = relativeNoise(engine, sphere);
        const clean = relativeNoise(control, sphere);
        log(
            `dispersed: ruído relativo do sinal traçado na esfera ${noisy.toExponential(3)} com a dispersão da água, ${clean.toExponential(3)} sem — razão ${(noisy / clean).toFixed(2)}`,
        );
        // O canal sorteado com o triplo do peso soma 2 ao ruído relativo (E[X²] = 3m²): antes da T065g, 16× o da cena
        // sem dispersão nesta câmera (45× com a esfera vista de cima). Com um caminho por canal onde a dispersão começa
        // sobra o ruído da cena sem dispersão; os 25 % cobrem a roleta entre reflexão e transmissão pela soma dos canais
        // (o Fresnel de cada canal difere do único da cena sem dispersão) — medido 1,07×.
        check(
            noisy <= 1.25 * clean,
            `dispersed: ruído do sinal traçado na esfera ${(noisy / clean).toFixed(2)}× o da cena sem dispersão (≤ 1,25×)`,
        );
    } finally {
        engine.close();
        control.close();
    }
}

/**
 * Os vagalumes do sinal traçado nos pixels `pixels` (`samples`: quadro a quadro, `pixels` por quadro) — as amostras
 * acima de `FIREFLY` vezes a média do próprio pixel: a fração das amostras e a parte da energia.
 */
function fireflies(samples: Float32Array, pixels: number): { count: number; energy: number } {
    const frames = samples.length / pixels;
    let total = 0;
    let energy = 0;
    let count = 0;
    for (let j = 0; j < pixels; j++) {
        let mean = 0;
        for (let f = 0; f < frames; f++) mean += samples[f * pixels + j]! / frames;
        for (let f = 0; f < frames; f++) {
            const v = samples[f * pixels + j]!;
            total += v;
            if (v > FIREFLY * mean) {
                count++;
                energy += v;
            }
        }
    }
    return { count: count / samples.length, energy: total > 0 ? energy / total : 0 };
}

/**
 * Vagalume: a amostra de um quadro acima de 4× a média do pixel. Com o histórico curto da câmera andando (a resolução
 * temporal e o filtro do sinal traçado guardam da ordem de 8 quadros), uma amostra assim desloca o pixel em mais de um
 * terço da média — um ponto à vista, que a caixa de vizinhança só recorta quando os vizinhos não o têm.
 */
const FIREFLY = 4;

/**
 * T065i: a cena `glint` contra a referência (sem viés) e os vagalumes do sinal traçado na esfera — sem o antisserrilhado,
 * a amostra fica no centro do pixel e a variação entre quadros é só a do caminho (a roleta de Fresnel; sem luzes nem a
 * luz global, nada mais é sorteado nesta cena). O que se vê é a densidade deles, não a energia (que é a certa: a média
 * converge para a referência): ≤ 0,05 % das amostras — um vagalume quase nunca tem outro nos 3 × 3 em volta (≈ 0,4 %
 * das vezes) e entra no histórico só com o peso de um quadro. Medido antes da T065i: 0,31 % nesta cena e 0,43 % na
 * esfera do vídeo `ondulacao` (câmera parada no quadro 60, sem o antisserrilhado) — a mesma ordem: a cena representa o
 * vídeo.
 */
async function caseGlint(): Promise<void> {
    const { regions, engine } = await compareScene(GLINT);
    engine.close();
    const sphere = regions.get(10) ?? [];
    const still = await renderEngine(GLINT, 'absent', 'off', sphere);
    try {
        const f = fireflies(still.watched, sphere.length);
        log(
            `glint: vagalumes do sinal traçado na esfera (amostras > ${FIREFLY}× a média do pixel) — ${(f.count * 100).toFixed(3)} % das amostras de ${sphere.length} pixels (limite 0,050 %), ${pct(f.energy)} da energia; ruído relativo ${relativeNoise(still, sphere).toExponential(3)}`,
        );
        check(
            f.count <= 0.0005,
            `glint: ${(f.count * 100).toFixed(3)} % das amostras do sinal traçado na esfera são vagalumes (> ${FIREFLY}× a média do pixel) > 0,05 %`,
        );
    } finally {
        still.close();
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
    if (only === null || only === 'dispersed') {
        log('── dispersed');
        await caseDispersed();
    }
    if (only === null || only === 'glint') {
        log('── glint');
        await caseGlint();
    }
    for (const [scene, id] of [
        [RELIEF, 10],
        [RIPPLE, 20],
    ] as const) {
        if (only !== null && only !== scene.name) continue;
        log(`── ${scene.name}`);
        await caseBumped(scene, id);
    }
    if (only === null || only === 'gi') {
        log('── gi');
        await caseGi();
    }
    if (only === null || only === 'cost') {
        log('── cost');
        await caseCost();
    }
    check(engineErrors.length === 0, `erros do motor: ${engineErrors.slice(0, 5).join(' | ')}`);
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('REFRACTION SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

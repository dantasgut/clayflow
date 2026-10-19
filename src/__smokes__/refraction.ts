// Spec 034 — Smoke da refração traçada (US7; SC-014).
//
// Cada cena: um painel emissor quadriculado atrás de vidro, sem outra luz. O motor (o alvo HDR, linear, depois de 120
// quadros parados: a média temporal da refração) contra o traçador de caminhos da CPU com o dielétrico (a referência;
// IOR por canal pelo número de Abbe e a mesma absorção), os dois integrando a área do pixel (o motor pela média temporal
// de pontos sorteados nele). Medida nos pixels em que o vidro é o primeiro acerto: a média de cada bloco de 4 × 4 pixels inteiramente no vidro, o erro L1 relativo dos blocos
// (Σ|motor − referência| / Σ referência: um bloco quase escuro não domina) ≤ 3 % (rugoso ≤ 5 %), e a média do vidro
// inteiro ≤ 3 %.
//   - lens: esfera de vidro (IOR 1,5) ampliando o xadrez — nítida, sem os pixels de uma cópia da tela;
//   - stack: três placas em série — o caminho segue até o painel, sem limite de camadas;
//   - rough: placa de rugosidade 0,3 — o borrado dos raios pela GGX, não um desfoque;
//   - faces: cubo girado — os reflexos nas faces de dentro, traçados;
//   - dispersion: esfera com Abbe 20 — cada canal pelo próprio raio (as franjas coloridas);
//   - auto: a lente sem `GlobalIllumination` na cena — os estágios padrão ligam a só de refração;
//   - layers: um vidro claro na frente de um verde absorvente, sobrepostos — o de trás aparece pelo da frente.
// Para rodar: `npm run smoke -- refraction [--query case=lens]`. Resultado: `REFRACTION SMOKE PASSED` ou `FAIL: …`.
import { GlobalIllumination } from 'clayflow';
import { settle } from './support/extensionScenes';
import {
    buildGiScene,
    giApp,
    pathTracedScene,
    type Glass,
    type GiScene,
    type Slab,
    type Vec3,
} from './support/giScenes';
import { readSceneHdr, type HdrImage } from './support/imageMeasures';
import { renderPathTracedParallel } from './support/pathTraceParallel';
import type { PtImage } from '../elements/lighting/reference/pathTracer';

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

const SIZE = { width: 256, height: 192 } as const;
const BLOCK = 4;
/** Id das casas claras e escuras do painel e o do vidro (o das medidas). */
const BRIGHT = 10;
const DARK = 11;
const GLASS = 20;

/** Painel emissor quadriculado 2 × 2 m em z = −2 (8 × 8 casas: claras 4, escuras 0,5). */
function checker(): Slab[] {
    const out: Slab[] = [];
    const n = 8;
    const side = 2 / n;
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
            const bright = (i + j) % 2 === 0;
            const x = -1 + i * side;
            const y = -1 + j * side;
            out.push({
                id: bright ? BRIGHT : DARK,
                min: [x, y, -2.05],
                max: [x + side, y + side, -2],
                color: [0, 0, 0],
                emission: bright ? [4, 4, 4] : [0.5, 0.5, 0.5],
            });
        }
    return out;
}

function scene(glass: readonly Glass[]): GiScene {
    return {
        slabs: checker(),
        glass,
        camera: { position: [0, 0, 1.5], target: [0, 0, -1], fovY: (40 * Math.PI) / 180 },
        probeCenter: [0, 0, -0.5],
        probeSpacing: 0.4,
        regions: new Map([[GLASS, 'vidro']]),
    };
}

/**
 * O motor: a cena com a refração traçada, 120 quadros parados (a média temporal), o alvo HDR. Sem `withGi`, nenhuma
 * iluminação global: os estágios padrão ligam a só de refração sozinhos (o vidro na cena).
 */
async function engineImage(s: GiScene, withGi = true): Promise<HdrImage> {
    const { app, canvas } = await giApp(SIZE.width, SIZE.height, engineErrors);
    app.events.on('deviceLost', (e) => engineErrors.push(`deviceLost: ${JSON.stringify(e)}`));
    buildGiScene(app, s, SIZE.width / SIZE.height);
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    if (withGi)
        app.world.insert(
            new GlobalIllumination({
                quality: 'low',
                bounces: 1,
                probeSpacing: s.probeSpacing ?? 0.4,
                cascades: 1,
                center: s.probeCenter,
            }),
        );
    await settle(app, 2500);
    const limit = performance.now() + 120000;
    while (ready.revision < 0 || performance.now() - ready.at < 1000) {
        if (performance.now() > limit)
            throw new Error('a iluminação global não ficou pronta em 120 s');
        await settle(app, 100);
    }
    for (let i = 0; i < 120; i++) {
        app.step(1 / 60);
        if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
    }
    const img = await readSceneHdr(app);
    app.dispose();
    canvas.remove();
    return img;
}

/** Luminância de um pixel de cada imagem. */
const lumHdr = (img: HdrImage, i: number): number =>
    0.2126 * img.data[i * 4]! + 0.7152 * img.data[i * 4 + 1]! + 0.0722 * img.data[i * 4 + 2]!;
const lumPt = (img: PtImage, i: number, c?: number): number =>
    c === undefined
        ? 0.2126 * img.rgb[i * 3]! + 0.7152 * img.rgb[i * 3 + 1]! + 0.0722 * img.rgb[i * 3 + 2]!
        : img.rgb[i * 3 + c]!;

/**
 * Compara nos blocos inteiramente no vidro: o erro L1 relativo dos blocos (luminância, ou por canal) e o da média do
 * vidro inteiro.
 */
function compare(
    engine: HdrImage,
    ref: PtImage,
    channel?: number,
): { blocks: number; blockError: number; mean: number; meanError: number } {
    let sumE = 0;
    let sumR = 0;
    let errors = 0;
    let blocks = 0;
    const at = (x: number, y: number): number => y * SIZE.width + x;
    for (let by = 0; by + BLOCK <= SIZE.height; by += BLOCK)
        for (let bx = 0; bx + BLOCK <= SIZE.width; bx += BLOCK) {
            let inside = true;
            let e = 0;
            let r = 0;
            for (let y = by; y < by + BLOCK && inside; y++)
                for (let x = bx; x < bx + BLOCK; x++) {
                    const i = at(x, y);
                    if (ref.ids[i] !== GLASS) {
                        inside = false;
                        break;
                    }
                    e += channel === undefined ? lumHdr(engine, i) : engine.data[i * 4 + channel]!;
                    r += lumPt(ref, i, channel);
                }
            if (!inside) continue;
            errors += Math.abs(e - r);
            sumE += e;
            sumR += r;
            blocks++;
        }
    return {
        blocks,
        blockError: errors / Math.max(1e-9, sumR),
        mean: sumE / Math.max(1e-9, sumR),
        meanError: Math.abs(sumE - sumR) / Math.max(1e-9, sumR),
    };
}

async function caseOf(
    name: string,
    glass: readonly Glass[],
    tolerance: number,
    perChannel = false,
    withGi = true,
): Promise<void> {
    const s = scene(glass);
    const engine = await engineImage(s, withGi);
    const pt = pathTracedScene(s);
    const t0 = performance.now();
    const ref = await renderPathTracedParallel(pt.scene, pt.camera, {
        width: SIZE.width,
        height: SIZE.height,
        samples: tolerance > 0.03 ? 256 : 96,
        bounces: 0,
    });
    log(
        `${name}: referência (${SIZE.width}×${SIZE.height}) em ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
    for (const channel of perChannel ? [0, 1, 2] : [undefined]) {
        const label = channel === undefined ? '' : ` canal ${'rgb'[channel]}`;
        const r = compare(engine, ref, channel);
        log(
            `${name}${label}: ${r.blocks} blocos no vidro, erro L1 dos blocos ${(r.blockError * 100).toFixed(2)} %, média do vidro ${r.mean.toFixed(3)}× a referência`,
        );
        check(r.blocks >= 20, `${name}: só ${r.blocks} blocos no vidro`);
        check(
            r.blockError <= tolerance,
            `${name}${label}: erro L1 dos blocos ${(r.blockError * 100).toFixed(1)} % (≤ ${(tolerance * 100).toFixed(0)} %)`,
        );
        check(
            r.meanError <= 0.03,
            `${name}${label}: média do vidro a ${(r.meanError * 100).toFixed(1)} % (≤ 3 %)`,
        );
    }
}

const sphere = (center: Vec3, radius: number, extra: Partial<Glass> = {}): Glass => ({
    id: GLASS,
    shape: { kind: 'sphere', center, radius },
    ior: 1.5,
    ...extra,
});

const plate = (z: number, extra: Partial<Glass> = {}): Glass => ({
    id: GLASS,
    shape: { kind: 'box', min: [-0.6, -0.45, z - 0.05], max: [0.6, 0.45, z] },
    ior: 1.5,
    ...extra,
});

const CASES: Record<string, () => Promise<void>> = {
    lens: () => caseOf('lens', [sphere([0, 0, 0.2], 0.45)], 0.03),
    stack: () => caseOf('stack', [plate(0.4), plate(0), plate(-0.4)], 0.03),
    rough: () => caseOf('rough', [plate(0, { roughness: 0.3 })], 0.05),
    faces: () =>
        caseOf(
            'faces',
            [
                {
                    id: GLASS,
                    shape: {
                        kind: 'box',
                        min: [-0.35, -0.35, -0.35],
                        max: [0.35, 0.35, 0.35],
                        rotationY: 0.6,
                    },
                    ior: 1.5,
                },
            ],
            0.03,
        ),
    dispersion: () => caseOf('dispersion', [sphere([0, 0, 0.2], 0.45, { abbe: 20 })], 0.03, true),
    auto: () => caseOf('auto', [sphere([0, 0, 0.2], 0.45)], 0.03, false, false),
    layers: () =>
        caseOf(
            'layers',
            [
                sphere([-0.3, 0, 0.3], 0.55),
                sphere([0.3, 0, -0.6], 0.55, { color: [0.2, 0.8, 0.3], depth: 0.3 }),
            ],
            0.03,
        ),
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('REFRACTION SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

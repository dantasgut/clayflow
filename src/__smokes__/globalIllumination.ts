// Spec 033 — Smoke da iluminação global (US1, US3, US4, US5; SC-001, SC-002, SC-004–SC-008).
//
// As medidas leem a radiância linear do alvo HDR da cena. A luz indireta do motor é a imagem com a iluminação global
// menos a imagem sem ela (a luz direta e a emissão vista ficam fora). O gabarito é o traçador de caminhos da CPU na
// mesma cena (`reference/pathTracer`, só a indireta, os mesmos rebatimentos) — referência independente do motor, rodada
// em workers:
//   - cornell: caixa de Cornell com o sol entrando por um buraco no teto (o resto da caixa vive de luz rebatida) —
//     radiância média por região a ≤ 10 % da referência com 3 rebatimentos (SC-001), em 640×480 e em 4K; o fundo mais
//     vermelho perto da parede vermelha que perto da verde, como na referência; nenhuma superfície mais escura com a
//     iluminação global.
//   - emissive: a mesma caixa sem sol, iluminada por um painel emissor — o emissivo ilumina o cômodo como na referência
//     (≤ 10 % por região).
//   - window: cômodo fechado com uma janela sob o céu físico e o sol entrando por ela — ≤ 10 % por região, nenhuma
//     parede preta, o canto côncavo contra o chão aberto na proporção da referência.
//   - skyfloor: chão aberto sob o céu físico — a luz do céu nos acertos contra a mesma atmosfera na referência.
//   - dark: a caixa sem nenhuma fonte — a iluminação global não cria energia.
//   - furnace: ambiente branco fechado de paredes que emitem e refletem igual — a luz rebatida é a série analítica
//     L_e · (ρ + ρ² + ρ³) a ≤ 5 % (SC-002).
// As regiões medem só os pixels longe das bordas entre objetos e das arestas entre faces.
// Para rodar: `npm run smoke -- globalIllumination [--query case=cornell]`. Resultado:
// `GLOBALILLUMINATION SMOKE PASSED` ou `FAIL: …`.
import { GlobalIllumination, type Application } from 'clayflow';
import type { PtImage } from '../elements/lighting/reference/pathTracer';
import { settle } from './support/extensionScenes';
import {
    buildGiScene,
    cornellBox,
    darkCornell,
    emissiveCornell,
    FURNACE,
    giApp,
    pathTracedScene,
    whiteFurnace,
    windowRoom,
    skyFloor,
    type GiScene,
} from './support/giScenes';
import { hdrAt, readHdrTexture, type HdrImage } from './support/imageMeasures';
import { renderPathTracedParallel } from './support/pathTraceParallel';

function log(msg: string): void {
    console.log(`[globalIllumination] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

const lum = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

/** Rebatimentos das medidas (o motor e a referência). */
const BOUNCES = 3;

/** Tamanho de uma medida em pixels. */
interface Size {
    readonly width: number;
    readonly height: number;
}

/**
 * Espera os kernels da iluminação global da composição final ficarem prontos (`globalIlluminationReady` sem revisão
 * nova por 1 s) — os quadros só contam com a luz rebatida acumulando.
 */
async function giReady(app: Application, ready: { revision: number; at: number }): Promise<void> {
    const limit = performance.now() + 120000;
    while (ready.revision < 0 || performance.now() - ready.at < 1000) {
        if (performance.now() > limit)
            throw new Error('a iluminação global não ficou pronta em 120 s');
        await settle(app, 100);
    }
}

/** Avança `frames` quadros de 1/60 s (as sondas acumulam) e lê o alvo HDR. */
async function converge(app: Application, frames: number): Promise<HdrImage> {
    // Tempo real para os pipelines do desenho compilarem (as funções `material`), depois os quadros.
    await settle(app, 2500);
    for (let i = 0; i < frames; i++) {
        app.step(1 / 60);
        if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    return readHdrTexture(app, texture);
}

/** Desenha a cena no motor, com ou sem a iluminação global, e lê o alvo HDR convergido. */
async function renderEngine(scene: GiScene, size: Size, withGi: boolean): Promise<HdrImage> {
    const { app, canvas } = await giApp(size.width, size.height, engineErrors);
    app.events.on('deviceLost', (e) => engineErrors.push(`deviceLost: ${JSON.stringify(e)}`));
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    buildGiScene(app, scene, size.width / size.height);
    const gi = new GlobalIllumination({
        quality: 'high',
        bounces: BOUNCES,
        probeSpacing: scene.probeSpacing ?? 0.3,
        cascades: 1,
        center: scene.probeCenter,
        enabled: withGi,
    });
    app.world.insert(gi);
    if (withGi) await giReady(app, ready);
    const img = await converge(app, withGi ? 300 : 4);
    app.dispose();
    canvas.remove();
    return img;
}

/** A luz indireta do motor: com a iluminação global menos sem ela (nunca negativa), e as duas imagens. */
async function engineIndirect(
    scene: GiScene,
    size: Size,
): Promise<{ indirect: HdrImage; total: HdrImage; direct: HdrImage }> {
    const total = await renderEngine(scene, size, true);
    const direct = await renderEngine(scene, size, false);
    const indirect: HdrImage = {
        width: size.width,
        height: size.height,
        data: total.data.map((v, k) => (k % 4 === 3 ? 1 : Math.max(0, v - direct.data[k]!))),
    };
    return { indirect, total, direct };
}

/** Pixel longe das bordas: os 4 vizinhos são da mesma região e da mesma face. */
function interior(ref: PtImage, x: number, y: number): boolean {
    const w = ref.width;
    const k = y * w + x;
    return [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ].every(([dx, dy]) => {
        const j = (y + dy!) * w + x + dx!;
        return ref.ids[j] === ref.ids[k] && ref.faces[j] === ref.faces[k];
    });
}

/** Médias por região nas duas imagens, só nos pixels do interior das faces. */
function regionPairs(
    engine: HdrImage,
    ref: PtImage,
    regions: ReadonlyMap<number, string>,
): Map<number, { engine: number[]; reference: number[]; pixels: number }> {
    const out = new Map<number, { engine: number[]; reference: number[]; pixels: number }>();
    for (let y = 1; y < ref.height - 1; y++) {
        for (let x = 1; x < ref.width - 1; x++) {
            const id = ref.ids[y * ref.width + x]!;
            if (!regions.has(id) || !interior(ref, x, y)) continue;
            let e = out.get(id);
            if (e === undefined)
                out.set(id, (e = { engine: [0, 0, 0], reference: [0, 0, 0], pixels: 0 }));
            const g = hdrAt(engine, x, y);
            const i = (y * ref.width + x) * 3;
            for (let k = 0; k < 3; k++) {
                e.engine[k]! += g[k]!;
                e.reference[k]! += ref.rgb[i + k]!;
            }
            e.pixels++;
        }
    }
    for (const e of out.values())
        for (let k = 0; k < 3; k++) {
            e.engine[k]! /= e.pixels;
            e.reference[k]! /= e.pixels;
        }
    return out;
}

/** Média rgb de uma janela (frações da imagem) só nos pixels do interior das faces da região `id`. */
function windowMean(
    img: (x: number, y: number) => readonly number[],
    ref: PtImage,
    id: number,
    box: number[],
): number[] {
    const [x0, y0, x1, y1] = [
        box[0]! * ref.width,
        box[1]! * ref.height,
        box[2]! * ref.width,
        box[3]! * ref.height,
    ].map(Math.floor);
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = y0!; y < y1!; y++)
        for (let x = x0!; x < x1!; x++) {
            if (ref.ids[y * ref.width + x] !== id || !interior(ref, x, y)) continue;
            const c = img(x, y);
            for (let k = 0; k < 3; k++) sum[k]! += c[k]!;
            n++;
        }
    return sum.map((v) => v / Math.max(1, n));
}

/**
 * Compara a luz indireta do motor com a do traçador de caminhos por região (a luz direta — o mapa de sombra, fora do
 * escopo — fica de fora nos dois).
 */
async function compareScene(
    name: string,
    scene: GiScene,
    size: Size,
    spp: number,
    tolerance: number,
    extra?: (engine: HdrImage, ref: PtImage) => void,
): Promise<void> {
    const { indirect: engine, total, direct } = await engineIndirect(scene, size);
    const pt = pathTracedScene(scene);
    const t0 = performance.now();
    const ref = await renderPathTracedParallel(pt.scene, pt.camera, {
        width: size.width,
        height: size.height,
        samples: spp,
        bounces: BOUNCES,
        indirectOnly: true,
    });
    log(
        `${name}: referência (${size.width}×${size.height}, ${spp} amostras) em ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
    const pairs = regionPairs(engine, ref, scene.regions);
    const report: string[] = [];
    let worst = 0;
    for (const [id, e] of pairs) {
        const err = Math.abs(lum(e.engine) - lum(e.reference)) / lum(e.reference);
        worst = Math.max(worst, err);
        report.push(
            `${scene.regions.get(id)} ${lum(e.engine).toFixed(3)}/${lum(e.reference).toFixed(3)} (${(err * 100).toFixed(1)} %)`,
        );
        check(
            err <= tolerance,
            `${name}: luz indireta de ${scene.regions.get(id)} a ${(err * 100).toFixed(1)} % da referência`,
        );
    }
    log(
        `${name}: luz indireta motor/referência por região — ${report.join(', ')}; pior ${(worst * 100).toFixed(1)} %`,
    );
    check(pairs.size === scene.regions.size, `${name}: só ${pairs.size} regiões visíveis`);
    // Só soma: nenhuma região fica mais escura com a iluminação global.
    check(
        [...total.data].every((v, k) => k % 4 === 3 || v >= direct.data[k]! - 1e-3),
        `${name}: alguma superfície ficou mais escura com a iluminação global`,
    );
    if (extra !== undefined) extra(engine, ref);
}

/** Tingimento da caixa de Cornell: o fundo perto da parede vermelha recebe luz mais vermelha, como na referência. */
function cornellTint(name: string, tolerance: number): (engine: HdrImage, ref: PtImage) => void {
    return (engine, ref) => {
        // Tingimento: o fundo perto da parede vermelha recebe luz mais vermelha que perto da verde, como na referência.
        const engineAt = (x: number, y: number): readonly number[] => hdrAt(engine, x, y);
        const refAt = (x: number, y: number): readonly number[] => {
            const i = (y * ref.width + x) * 3;
            return [ref.rgb[i]!, ref.rgb[i + 1]!, ref.rgb[i + 2]!];
        };
        const tint = (c: readonly number[]): number => c[0]! / Math.max(c[1]!, 1e-6);
        const left = [0.36, 0.3, 0.42, 0.6];
        const right = [0.58, 0.3, 0.64, 0.6];
        const [el, er, rl, rr] = [
            tint(windowMean(engineAt, ref, 2, left)),
            tint(windowMean(engineAt, ref, 2, right)),
            tint(windowMean(refAt, ref, 2, left)),
            tint(windowMean(refAt, ref, 2, right)),
        ];
        log(
            `${name}: vermelho/verde da luz indireta no fundo — esquerda ${el.toFixed(3)} (ref ${rl.toFixed(3)}), direita ${er.toFixed(3)} (ref ${rr.toFixed(3)})`,
        );
        check(el > er, `${name}: o fundo não fica mais vermelho perto da parede vermelha`);
        check(
            Math.abs(el / er - rl / rr) / (rl / rr) <= tolerance,
            `${name}: tingimento das paredes fora da referência`,
        );
    };
}

/** Sem fonte nenhuma, a iluminação global não soma nada (não cria energia). */
async function darkScene(): Promise<void> {
    const { indirect } = await engineIndirect(darkCornell(), { width: 320, height: 240 });
    let max = 0;
    indirect.data.forEach((v, k) => {
        if (k % 4 !== 3) max = Math.max(max, v);
    });
    log(`dark: maior luz somada pela iluminação global sem fonte ${max.toExponential(2)}`);
    check(max <= 1e-6, `dark: a iluminação global criou energia (${max.toExponential(2)})`);
}

/** Ambiente branco fechado: a luz rebatida contra a série analítica L_e · (ρ + ρ² + ρ³) (SC-002). */
async function furnaceScene(): Promise<void> {
    const size = { width: 320, height: 240 };
    const { indirect } = await engineIndirect(whiteFurnace(), size);
    const r = FURNACE.albedo;
    let series = 0;
    for (let k = 1; k <= BOUNCES; k++) series += r ** k;
    const expected = FURNACE.emission * series;
    let sum = 0;
    let worst = 0;
    const n = size.width * size.height;
    for (let i = 0; i < n; i++) {
        const v = lum([
            indirect.data[i * 4]!,
            indirect.data[i * 4 + 1]!,
            indirect.data[i * 4 + 2]!,
        ]);
        sum += v;
        worst = Math.max(worst, Math.abs(v - expected) / expected);
    }
    const mean = sum / n;
    const err = Math.abs(mean - expected) / expected;
    log(
        `furnace: luz rebatida média ${mean.toFixed(4)} (série analítica ${expected.toFixed(4)}, ${(err * 100).toFixed(1)} %; pior pixel ${(worst * 100).toFixed(1)} %)`,
    );
    check(
        err <= 0.05,
        `furnace: luz rebatida média a ${(err * 100).toFixed(1)} % da série analítica`,
    );
}

/** Distância em pixels (8-vizinhança) de cada pixel da região `id` até o pixel mais próximo de outra região. */
function distanceToEdge(ref: PtImage, id: number): Int32Array {
    const n = ref.width * ref.height;
    const dist = new Int32Array(n).fill(-1);
    const queue: number[] = [];
    for (let k = 0; k < n; k++) {
        if (ref.ids[k] !== id) {
            dist[k] = 0;
            queue.push(k);
        }
    }
    for (let head = 0; head < queue.length; head++) {
        const k = queue[head]!;
        const x = k % ref.width;
        const y = (k - x) / ref.width;
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= ref.width || ny >= ref.height) continue;
                const j = ny * ref.width + nx;
                if (dist[j] !== -1) continue;
                dist[j] = dist[k]! + 1;
                queue.push(j);
            }
    }
    return dist;
}

/**
 * Cômodo com janela: nenhuma parede preta (cada região com ao menos 5 % da luz rebatida média das regiões) e o canto
 * côncavo — a faixa do chão junto às paredes (até 12 pixels delas) contra o chão aberto (a mais de 60) — na proporção
 * da referência (±10 %).
 */
function windowChecks(engine: HdrImage, ref: PtImage): void {
    const scene = windowRoom();
    const pairs = regionPairs(engine, ref, scene.regions);
    const mean =
        [...pairs.values()].reduce((a, e) => a + lum(e.engine), 0) / Math.max(1, pairs.size);
    for (const [id, e] of pairs)
        check(
            lum(e.engine) >= 0.05 * mean,
            `window: ${scene.regions.get(id)} preta (${lum(e.engine).toFixed(3)})`,
        );
    const floor = 1;
    const dist = distanceToEdge(ref, floor);
    const band = (lo: number, hi: number): [number, number] => {
        let se = 0;
        let sr = 0;
        let n = 0;
        for (let k = 0; k < dist.length; k++) {
            if (ref.ids[k] !== floor || dist[k]! < lo || dist[k]! > hi) continue;
            const x = k % ref.width;
            se += lum(hdrAt(engine, x, (k - x) / ref.width));
            sr += lum([ref.rgb[k * 3]!, ref.rgb[k * 3 + 1]!, ref.rgb[k * 3 + 2]!]);
            n++;
        }
        return [se / Math.max(1, n), sr / Math.max(1, n)];
    };
    const [ce, cr] = band(2, 12);
    const [oe, or] = band(60, Infinity);
    const eng = ce / Math.max(oe, 1e-9);
    const refRatio = cr / Math.max(or, 1e-9);
    log(
        `window: canto côncavo / chão aberto — motor ${eng.toFixed(3)}, referência ${refRatio.toFixed(3)}`,
    );
    check(
        Math.abs(eng - refRatio) / refRatio <= 0.1,
        'window: proporção do canto côncavo fora da referência',
    );
}

const CASES: Record<string, () => Promise<void>> = {
    cornell: () =>
        compareScene(
            'cornell',
            cornellBox(),
            { width: 640, height: 480 },
            512,
            0.1,
            cornellTint('cornell', 0.1),
        ),
    cornell4k: () =>
        compareScene(
            'cornell 4K',
            cornellBox(),
            { width: 3840, height: 2160 },
            64,
            0.1,
            cornellTint('cornell 4K', 0.1),
        ),
    emissive: () =>
        compareScene(
            'emissive',
            emissiveCornell(),
            { width: 640, height: 480 },
            512,
            0.1,
            cornellTint('emissive', 0.1),
        ),
    window: () =>
        compareScene('window', windowRoom(), { width: 640, height: 480 }, 512, 0.1, windowChecks),
    skyfloor: () => compareScene('skyfloor', skyFloor(), { width: 320, height: 240 }, 256, 0.1),
    dark: darkScene,
    furnace: furnaceScene,
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('GLOBALILLUMINATION SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

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
import {
    BoxGeometry,
    GlobalIllumination,
    SphereGeometry,
    StandardMaterial,
    Transform,
    type Application,
    type StagingBufferSpec,
} from 'clayflow';
import type { PtImage } from '../elements/lighting/reference/pathTracer';
import { settle } from './support/extensionScenes';
import {
    buildGiScene,
    closedBox,
    cornellBox,
    darkCornell,
    emissiveCornell,
    FURNACE,
    giApp,
    pathTracedScene,
    whiteFurnace,
    windowRoom,
    insertCloth,
    insertCurtain,
    insertGraphTerrain,
    livingStage,
    projectPoint,
    type Vec3,
    skyFloor,
    type BuiltGiScene,
    type GiScene,
} from './support/giScenes';
import { hdrAt, hdrLuminance, readHdrTexture, type HdrImage } from './support/imageMeasures';
import { closureFn } from './support/materialScenes';
import { waterScene } from './support/waterScene';
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

/** Uma aplicação com a cena montada e a iluminação global: avança quadros e lê o alvo HDR. */
interface EngineSession<T = void> {
    /** O que o montador extra devolveu (geometria viva). */
    readonly extra: T;
    /** Leituras de volta da GPU feitas pelo motor durante os quadros (as das medidas ficam de fora). */
    readonly readbacks: () => number;
    readonly app: Application;
    readonly gi: GlobalIllumination;
    readonly built: BuiltGiScene;
    /** Avança `frames` quadros de 1/60 s (cedendo ao navegador a cada 20). */
    step(frames: number): Promise<void>;
    /** Lê o alvo HDR do último quadro. */
    read(): Promise<HdrImage>;
    close(): void;
}

/** Abre a cena no motor com ou sem a iluminação global; com ela, espera os kernels prontos. */
async function openEngine<T = void>(
    scene: GiScene,
    size: Size,
    withGi: boolean,
    extra?: (app: Application) => T,
): Promise<EngineSession<T>> {
    const { app, canvas } = await giApp(size.width, size.height, engineErrors);
    // Conta as leituras de volta do motor durante os quadros (SC-007).
    let stepping = false;
    let readbacks = 0;
    const core = app.core as unknown as { readback: (...args: unknown[]) => Promise<ArrayBuffer> };
    const original = core.readback.bind(core);
    core.readback = (...args: unknown[]): Promise<ArrayBuffer> => {
        if (stepping) readbacks++;
        return original(...args);
    };
    app.events.on('deviceLost', (e) => engineErrors.push(`deviceLost: ${JSON.stringify(e)}`));
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    const built = buildGiScene(app, scene, size.width / size.height);
    const extraValue = extra === undefined ? (undefined as T) : extra(app);
    const gi = new GlobalIllumination({
        quality: 'high',
        bounces: BOUNCES,
        probeSpacing: scene.probeSpacing ?? 0.3,
        cascades: 1,
        center: scene.probeCenter,
        enabled: withGi,
    });
    app.world.insert(gi);
    // Tempo real para os pipelines do desenho compilarem (as funções `material`).
    await settle(app, 2500);
    if (withGi) await giReady(app, ready);
    return {
        app,
        gi,
        built,
        extra: extraValue,
        readbacks: () => readbacks,
        async step(frames) {
            for (let i = 0; i < frames; i++) {
                stepping = true;
                app.step(1 / 60);
                stepping = false;
                if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
            }
        },
        async read() {
            const texture = app.resources.textureOf(app.defaults.targets, 'color');
            if (texture === undefined) throw new Error('alvo HDR não alocado');
            return readHdrTexture(app, texture);
        },
        close() {
            app.dispose();
            canvas.remove();
        },
    };
}

/** Desenha a cena no motor, com ou sem a iluminação global, e lê o alvo HDR convergido. */
async function renderEngine(scene: GiScene, size: Size, withGi: boolean): Promise<HdrImage> {
    const session = await openEngine(scene, size, withGi);
    await session.step(withGi ? 300 : 4);
    const img = await session.read();
    session.close();
    return img;
}

/** Luz indireta de uma imagem com a iluminação global contra a imagem só com a luz direta (nunca negativa). */
function minus(total: HdrImage, direct: HdrImage): HdrImage {
    return {
        width: total.width,
        height: total.height,
        data: total.data.map((v, k) => (k % 4 === 3 ? 1 : Math.max(0, v - direct.data[k]!))),
    };
}

/** Luminância média dos pixels de uma imagem. */
function meanLum(img: HdrImage): number {
    let sum = 0;
    const n = img.width * img.height;
    for (let i = 0; i < n; i++)
        sum += lum([img.data[i * 4]!, img.data[i * 4 + 1]!, img.data[i * 4 + 2]!]);
    return sum / n;
}

/** A luz indireta do motor: com a iluminação global menos sem ela (nunca negativa), e as duas imagens. */
async function engineIndirect(
    scene: GiScene,
    size: Size,
): Promise<{ indirect: HdrImage; total: HdrImage; direct: HdrImage }> {
    const total = await renderEngine(scene, size, true);
    const direct = await renderEngine(scene, size, false);
    return { indirect: minus(total, direct), total, direct };
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

/**
 * Estabilidade (SC-005): com tudo parado, 2 s depois de a iluminação global ficar pronta a luz indireta média está a
 * ≤ 2 % da convergida e a variação entre dois quadros seguidos (desvio relativo por pixel) fica abaixo de 1 %.
 */
async function stabilityScene(): Promise<void> {
    const size = { width: 320, height: 240 };
    const scene = cornellBox();
    const direct = await renderEngine(scene, size, false);
    const session = await openEngine(scene, size, true);
    await session.step(120);
    const a = minus(await session.read(), direct);
    await session.step(1);
    const b = minus(await session.read(), direct);
    await session.step(480);
    const c = minus(await session.read(), direct);
    session.close();
    const [ma, mc] = [meanLum(a), meanLum(c)];
    const conv = Math.abs(ma - mc) / mc;
    let diff = 0;
    let base = 0;
    for (let i = 0; i < size.width * size.height; i++) {
        const la = lum([a.data[i * 4]!, a.data[i * 4 + 1]!, a.data[i * 4 + 2]!]);
        const lb = lum([b.data[i * 4]!, b.data[i * 4 + 1]!, b.data[i * 4 + 2]!]);
        diff += Math.abs(la - lb);
        base += la;
    }
    const flicker = diff / Math.max(base, 1e-9);
    log(
        `stability: em 2 s a ${(conv * 100).toFixed(2)} % do convergido; variação entre quadros ${(flicker * 100).toFixed(2)} %`,
    );
    check(conv <= 0.02, `stability: em 2 s a ${(conv * 100).toFixed(1)} % do convergido`);
    check(
        flicker <= 0.01,
        `stability: variação entre quadros parados ${(flicker * 100).toFixed(2)} %`,
    );
}

/**
 * Câmera andando devagar (US4): a cintilação — a segunda diferença temporal da luz indireta, |x₁ − (x₀ + x₂)/2|, que
 * ignora a mudança suave do movimento — fica abaixo de 2 % da luz média, em três trechos do caminho.
 */
async function movingScene(): Promise<void> {
    const size = { width: 320, height: 240 };
    const scene = cornellBox();
    // Duas aplicações no mesmo caminho de câmera: com a iluminação global e só com a luz direta (a indireta é a diferença).
    const lit = await openEngine(scene, size, true);
    const plain = await openEngine(scene, size, false);
    await lit.step(300);
    const c = scene.camera;
    let worst = 0;
    const flickers: string[] = [];
    // Um passo de câmera por quadro: 1 cm para a frente e 0,05° de giro (≈ 0,6 m/s e 3°/s).
    let frame = 0;
    const advance = async (): Promise<void> => {
        frame++;
        const z = c.position[2] - 0.01 * frame;
        const yaw = (0.05 * frame * Math.PI) / 180;
        const position = [c.position[0], c.position[1], z] as const;
        const target = [
            c.target[0] + Math.sin(yaw) * 4,
            c.target[1],
            z - Math.cos(yaw) * 4,
        ] as const;
        for (const s of [lit, plain]) {
            s.built.view.data.position = [...position, 1];
            s.built.view.data.rotation = Transform.lookRotation(position, target);
            await s.step(1);
        }
    };
    for (const at of [20, 40, 60]) {
        while (frame < at) await advance();
        const xs: HdrImage[] = [];
        for (let k = 0; k < 3; k++) {
            await advance();
            xs.push(minus(await lit.read(), await plain.read()));
        }
        let num = 0;
        let den = 0;
        for (let i = 0; i < size.width * size.height; i++) {
            const l = (img: HdrImage): number =>
                lum([img.data[i * 4]!, img.data[i * 4 + 1]!, img.data[i * 4 + 2]!]);
            num += Math.abs(l(xs[1]!) - (l(xs[0]!) + l(xs[2]!)) / 2);
            den += l(xs[1]!);
        }
        const f = num / Math.max(den, 1e-9);
        worst = Math.max(worst, f);
        flickers.push(`${(f * 100).toFixed(2)} %`);
    }
    lit.close();
    plain.close();
    log(`moving: cintilação da luz indireta com a câmera andando ${flickers.join(', ')}`);
    check(worst <= 0.02, `moving: cintilação ${(worst * 100).toFixed(2)} % com a câmera andando`);
}

/** Vazamento (SC-004): dentro de uma caixa fechada de paredes finas sob sol forte, luz indireta ≤ 1 % da de fora. */
async function leakScene(): Promise<void> {
    const size = { width: 320, height: 240 };
    const inside = (await engineIndirect(closedBox(true), size)).indirect;
    const outside = (await engineIndirect(closedBox(false), size)).indirect;
    const [mi, mo] = [meanLum(inside), meanLum(outside)];
    log(
        `leak: luz indireta dentro ${mi.toExponential(3)}, fora ${mo.toFixed(2)} (${((mi / mo) * 100).toFixed(3)} %)`,
    );
    check(mi <= 0.01 * mo, `leak: dentro a ${((mi / mo) * 100).toFixed(2)} % da de fora`);
}

/**
 * Resposta (SC-006): o sol acende de repente na caixa de Cornell — em 0,25 s (15 quadros) a luz indireta média passa de
 * 95 % da convergida e, 1 s depois, está a ≤ 2 % dela (sem rastro).
 */
async function responseScene(): Promise<void> {
    const size = { width: 320, height: 240 };
    const scene = cornellBox();
    const direct = await renderEngine(scene, size, false);
    const session = await openEngine(scene, size, true);
    const sun = session.built.sun!;
    sun.data.intensity = 0;
    await session.step(240);
    sun.data.intensity = scene.sun!.illuminance;
    await session.step(15);
    const early = meanLum(minus(await session.read(), direct));
    await session.step(45);
    const second = meanLum(minus(await session.read(), direct));
    await session.step(540);
    const final = meanLum(minus(await session.read(), direct));
    session.close();
    log(
        `response: 0,25 s depois de acender ${((early / final) * 100).toFixed(1)} % do convergido; 1 s depois ${((second / final) * 100).toFixed(1)} %`,
    );
    check(
        early >= 0.95 * final,
        `response: em 0,25 s só ${((early / final) * 100).toFixed(1)} % do convergido`,
    );
    check(
        Math.abs(second - final) <= 0.02 * final,
        `response: 1 s depois a ${((Math.abs(second - final) / final) * 100).toFixed(1)} % do convergido`,
    );
}

/** Média rgb da janela de tela que contém a projeção dos cantos de uma caixa de mundo. */
function worldWindow(img: HdrImage, scene: GiScene, min: Vec3, max: Vec3): number[] {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k < 8; k++) {
        const p: Vec3 = [k & 1 ? max[0] : min[0], k & 2 ? max[1] : min[1], k & 4 ? max[2] : min[2]];
        const [x, y] = projectPoint(scene, img.width, img.height, p);
        xs.push(x);
        ys.push(y);
    }
    const [x0, x1] = [
        Math.max(0, Math.floor(Math.min(...xs))),
        Math.min(img.width, Math.ceil(Math.max(...xs))),
    ];
    const [y0, y1] = [
        Math.max(0, Math.floor(Math.min(...ys))),
        Math.min(img.height, Math.ceil(Math.max(...ys))),
    ];
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
            const c = hdrAt(img, x, y);
            for (let k = 0; k < 3; k++) sum[k]! += c[k]!;
            n++;
        }
    return sum.map((v) => v / Math.max(1, n));
}

const redness = (c: readonly number[]): number => c[0]! / Math.max(c[1]!, 1e-6);
const greenness = (c: readonly number[]): number => c[1]! / Math.max(c[0]!, 1e-6);

/**
 * Geometria viva (US3, SC-006/SC-007): a cortina vermelha paramétrica (escrita na GPU) muda de lugar e de forma; o
 * tingimento vermelho da luz rebatida no chão segue para o lugar novo — em 0,25 s, ≥ 95 % do caminho até o convergido —
 * e some do lugar velho; nenhuma leitura de volta nos quadros.
 */
async function livingScene(): Promise<void> {
    const size = { width: 320, height: 240 };
    const scene = livingStage();
    const lit = await openEngine(scene, size, true, (app) => insertCurtain(app, -0.6));
    const plain = await openEngine(scene, size, false, (app) => insertCurtain(app, -0.6));
    const both = async (frames: number): Promise<void> => {
        await lit.step(frames);
        await plain.step(frames);
    };
    const indirect = async (): Promise<HdrImage> => minus(await lit.read(), await plain.read());
    // O chão à esquerda da cortina (o lado que o sol ilumina rebate para lá).
    const near = (offset: number): [Vec3, Vec3] => [
        [offset - 0.6, 0, -1.15],
        [offset - 0.12, 0, -0.45],
    ];
    await both(300);
    const before = await indirect();
    const [a0, b0] = [
        redness(worldWindow(before, scene, ...near(-0.6))),
        redness(worldWindow(before, scene, ...near(0.6))),
    ];
    for (const s of [lit, plain]) {
        s.extra.values.offset = 0.6;
        s.extra.values.phase = 1.7;
    }
    await both(15);
    const early = await indirect();
    const [a15, b15] = [
        redness(worldWindow(early, scene, ...near(-0.6))),
        redness(worldWindow(early, scene, ...near(0.6))),
    ];
    await both(300);
    const after = await indirect();
    const [a1, b1] = [
        redness(worldWindow(after, scene, ...near(-0.6))),
        redness(worldWindow(after, scene, ...near(0.6))),
    ];
    const gone = (a0 - a15) / Math.max(a0 - a1, 1e-9);
    const came = (b15 - b0) / Math.max(b1 - b0, 1e-9);
    log(
        `living: tingimento vermelho no chão junto à cortina — lugar velho ${a0.toFixed(3)} → ${a15.toFixed(3)} (0,25 s) → ${a1.toFixed(3)}, lugar novo ${b0.toFixed(3)} → ${b15.toFixed(3)} → ${b1.toFixed(3)}; leituras de volta ${lit.readbacks()}`,
    );
    check(b1 - b0 > 0.1 && a0 - a1 > 0.1, 'living: a cortina não tinge o chão');
    check(
        came >= 0.95 && gone >= 0.95,
        `living: em 0,25 s só ${(Math.min(came, gone) * 100).toFixed(1)} % da mudança`,
    );
    check(lit.readbacks() === 0, `living: ${lit.readbacks()} leituras de volta nos quadros`);
    lit.close();
    plain.close();
}

/**
 * Corpo mole e grafo (US3, SC-007): o pano vermelho (XPBD) e o terreno verde de grafo de nós, escritos na GPU, rebatem
 * a cor deles na parede do fundo (mais vermelha atrás do pano, mais verde atrás do terreno, que longe deles) e recebem
 * luz rebatida; nenhuma leitura de volta nos quadros.
 */
async function softGraphScene(): Promise<void> {
    const size = { width: 320, height: 240 };
    const scene = livingStage();
    const add = (app: Application): void => {
        insertCloth(app);
        insertGraphTerrain(app);
    };
    const lit = await openEngine(scene, size, true, add);
    const plain = await openEngine(scene, size, false, add);
    for (let k = 0; k < 20; k++) {
        await lit.step(20);
        await plain.step(20);
    }
    const ind = minus(await lit.read(), await plain.read());
    const behindCloth = worldWindow(ind, scene, [-1.3, 0.3, -1.5], [-0.5, 1.0, -1.5]);
    const behindGraph = worldWindow(ind, scene, [0.4, 0.1, -1.5], [1.4, 0.6, -1.5]);
    const far = worldWindow(ind, scene, [-0.15, 0.3, -1.5], [0.15, 1.0, -1.5]);
    const graph = worldWindow(ind, scene, [0.4, 0.1, -1.1], [1.4, 0.15, -0.1]);
    log(
        `softgraph: parede atrás do pano vermelho/verde ${redness(behindCloth).toFixed(3)} (longe ${redness(far).toFixed(3)}); atrás do terreno verde/vermelho ${greenness(behindGraph).toFixed(3)} (longe ${greenness(far).toFixed(3)}); luz rebatida no terreno ${lum(graph).toFixed(4)}; leituras de volta ${lit.readbacks()}`,
    );
    check(
        redness(behindCloth) > 1.1 * redness(far),
        'softgraph: o pano (corpo mole) não rebate a cor dele',
    );
    check(
        greenness(behindGraph) > 1.05 * greenness(far),
        'softgraph: o terreno (grafo) não rebate a cor dele',
    );
    check(lum(graph) > 0.01, 'softgraph: o terreno (grafo) não recebe luz rebatida');
    check(lit.readbacks() === 0, `softgraph: ${lit.readbacks()} leituras de volta nos quadros`);
    lit.close();
    plain.close();
}

/**
 * Orçamento (SC-010): a cena do bench `global-illumination` (onda animada de 1 milhão de triângulos, caixas, sol e céu
 * físico, qualidade média) a 1280×720 — o tempo de GPU por quadro (a medida de desempenho, `profiling: 'frame'`; a por
 * passe distorce neste hardware) com e sem a iluminação global; a diferença é o custo dela (≤ 4 ms). O número de
 * referência é o do bench (aquecimento e janela de medida); aqui, a conferência.
 */
async function budgetScene(): Promise<void> {
    const lib = await import('clayflow');
    /** A cena do orçamento (1 milhão de triângulos animados, sol com sombra e céu) pronta, com ou sem a GI. */
    const open = async (
        gi: boolean,
    ): Promise<{
        app: Application;
        canvas: HTMLCanvasElement;
        perFrame: (n: number) => Promise<number>;
    }> => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        document.body.appendChild(canvas);
        const app = await lib.Application.create({
            // Antisserrilhado com que as medidas deste smoke foram calibradas (MSAA, o padrão antes da 034; o
            // temporal, padrão agora, tem o smoke `antialiasing`).
            antialias: 'msaa',
            canvas,
            scene: lib.createScene(),
            autoResize: false,
            captureErrors: true,
        });
        app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
        const ready = { revision: -1, at: 0 };
        app.events.on('globalIlluminationReady', (e) => {
            ready.revision = e.revision;
            ready.at = performance.now();
        });
        const e = (40 * Math.PI) / 180;
        const sun = new lib.DirectionalLight({
            direction: [-Math.cos(e) * 0.6, -Math.sin(e), -Math.cos(e) * 0.8, 0],
            intensity: 100000,
            castShadow: true,
        });
        app.world.insert(sun);
        app.world.insert(new lib.Sky({ sun }));
        app.world.insert(
            new lib.ParametricSurface({
                domain: [-4, 4, -4, 4],
                animated: true,
                resolution: [707, 707],
            })
                .add(
                    new lib.SurfaceFunction({
                        code: `fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f(v, data.amp * sin(1.2 * v + time) * cos(1.2 * u + 0.7 * time), u);
}`,
                        params: { amp: 'f32' },
                        values: { amp: 0.15 },
                    }),
                )
                .add(new lib.StandardMaterial({ albedo: [0.6, 0.6, 0.58, 1], roughness: 0.9 }))
                .add(new lib.Transform()),
        );
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            app.world.insert(
                new lib.BoxGeometry({ size: [0.6, 1, 0.6] })
                    .add(
                        new lib.StandardMaterial({
                            albedo: [0.3 + (k % 3) * 0.3, 0.5, 0.8 - (k % 2) * 0.4, 1],
                            roughness: 0.5,
                        }),
                    )
                    .add(
                        new lib.Transform({
                            position: [2.2 * Math.cos(a), 0.6, 2.2 * Math.sin(a), 1],
                        }),
                    ),
            );
        }
        const eye = [0, 2.4, 6.5] as const;
        app.world.insert(
            new lib.Camera({
                fov: (55 * Math.PI) / 180,
                aspect: 1280 / 720,
                aspectMode: 'fixed',
                near: 0.1,
                far: 100,
            }).add(
                new lib.Transform({
                    position: [...eye, 1],
                    rotation: lib.Transform.lookRotation(eye, [0, 0.3, 0]),
                }),
            ),
        );
        const giRes = new lib.GlobalIllumination({ quality: 'medium' });
        app.events.on('globalIlluminationUnsupported', (e) =>
            engineErrors.push(`unsupported: ${e.reason}`),
        );
        if (gi) app.world.insert(giRes);
        await settle(app, 2500);
        if (gi) await giReady(app, ready);
        // Nenhuma compilação pendente por 2 s (só no teste: a fila interna do núcleo).
        const pending = (): number =>
            (app.core as unknown as { pendingPipelines: Map<string, unknown> }).pendingPipelines
                .size;
        let quiet = performance.now();
        for (const limit = performance.now() + 60000; performance.now() < limit; ) {
            await settle(app, 100);
            if (pending() > 0) quiet = performance.now();
            else if (performance.now() - quiet > 2000) break;
        }
        // Espera o trabalho enviado à GPU terminar (uma leitura de volta pequena depois dele).
        const fence = async (): Promise<void> => {
            const staging = app.core.create<StagingBufferSpec>({
                kind: 'buffer',
                subkind: 'staging',
                discriminator: 'budget_fence',
                byteSize: 16,
            });
            const texture = app.resources.textureOf(app.defaults.targets, 'color')!;
            app.core.record('budget-fence', (frame) => {
                frame.copyTextureToBuffer(
                    texture,
                    staging,
                    { bytesPerRow: 256, rowsPerImage: 1 },
                    [1, 1],
                );
            });
            app.core.submit();
            await app.core.readback(staging);
            app.core.destroy(staging);
        };
        const perFrame = async (n: number): Promise<number> => {
            for (let i = 0; i < 10; i++) app.step(1 / 60);
            await fence();
            const t0 = performance.now();
            for (let i = 0; i < n; i++) app.step(1 / 60);
            await fence();
            return (performance.now() - t0) / n;
        };
        return { app, canvas, perFrame };
    };
    /** Repete o `dispatch` de um estágio `times` vezes por quadro (só no teste). */
    const repeat = (flow: { prototype: unknown }, times: () => number): (() => void) => {
        const proto = flow.prototype as { dispatch: (...args: unknown[]) => void };
        const original = proto.dispatch;
        proto.dispatch = function (this: unknown, ...args: unknown[]): void {
            for (let k = 0; k < times(); k++) original.apply(this, args);
        };
        return () => {
            proto.dispatch = original;
        };
    };
    // (a) Os kernels da GI: o estágio das sondas 41× contra 21× por quadro, (T₄₁ − T₂₁)/20.
    const on = await open(true);
    let probeTimes = 1;
    let restore = repeat(lib.ProbeFlow, () => probeTimes);
    probeTimes = 21;
    const low = await on.perFrame(40);
    probeTimes = 41;
    const high = await on.perFrame(40);
    restore();
    const kernels = Math.max(0, (high - low) / 20);
    // (b) O que é por pixel (a leitura das sondas no desenho): o desenho 11× por quadro com e sem a GI —
    // (T_com − T_sem − kernels)/11.
    let forwardTimes = 11;
    restore = repeat(lib.ForwardFlow, () => forwardTimes);
    const withGi = await on.perFrame(40);
    on.app.dispose();
    on.canvas.remove();
    const off = await open(false);
    const withoutGi = await off.perFrame(40);
    off.app.dispose();
    off.canvas.remove();
    restore();
    forwardTimes = 1;
    const perPixel = Math.max(0, (withGi - withoutGi - kernels) / 11);
    const cost = kernels + perPixel;
    log(
        `budget: tempo de parede por quadro — sondas 21× ${low.toFixed(2)} ms, 41× ${high.toFixed(2)} ms → kernels ${kernels.toFixed(2)} ms; desenho 11× com a GI ${withGi.toFixed(2)} ms, sem ${withoutGi.toFixed(2)} ms → por pixel ${perPixel.toFixed(2)} ms`,
    );
    log(
        `budget: custo da iluminação global ${cost.toFixed(2)} ms/quadro a 1280×720 (orçamento 4 ms; o tempo de GPU do quadro desta máquina repete leituras velhas, então a medida é por repetição com o relógio de parede)`,
    );
    check(kernels > 0, 'budget: o trabalho da GI aparece na medida');
    check(cost <= 4, `budget: iluminação global a ${cost.toFixed(2)} ms/quadro (orçamento 4 ms)`);
}

/** Chão claro sob o sol a pino (cáusticas): placa de 4 × 4 m e a câmera dada. */
function causticFloor(camera: GiScene['camera'], sun: Vec3): GiScene {
    return {
        slabs: [{ id: 1, min: [-2, -0.05, -2], max: [2, 0, 2], color: [0.8, 0.8, 0.8] }],
        sun: { direction: sun, illuminance: 100 },
        camera,
        probeCenter: [0, 0.5, 0],
        regions: new Map([[1, 'chão']]),
    };
}

const GLASS = `return closure_add(
        closure_dielectric(data.ior, vec3f(1.0), 0.0, 0.0, vec3f(0.0)),
        closure_transmission(data.ior, vec3f(1.0), 0.0, 0.0, 0.0),
    );`;

/** Luminância máxima (média 3 × 3) numa janela em volta do pixel. */
function peakNear(
    img: HdrImage,
    cx: number,
    cy: number,
    r: number,
): { value: number; x: number; y: number } {
    let best = { value: 0, x: cx, y: cy };
    for (let y = Math.max(1, cy - r); y < Math.min(img.height - 1, cy + r); y++)
        for (let x = Math.max(1, cx - r); x < Math.min(img.width - 1, cx + r); x++) {
            let v = 0;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) v += hdrLuminance(img, x + dx, y + dy);
            if (v / 9 > best.value) best = { value: v / 9, x, y };
        }
    return best;
}

/**
 * A irradiância das cáusticas por célula do chão (y = 0 entre as duas camadas de células em volta), lida de volta do
 * hash (só no teste): chave `x,z` em células.
 */
async function floorCaustics(
    s: Awaited<ReturnType<typeof openEngine>>,
): Promise<Map<string, number>> {
    const spec = s.app.resources.bufferOf(s.gi, 'caustics')!;
    const staging = s.app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: 'gi_caustics_readback',
        byteSize: spec.byteSize,
    });
    s.app.core.record('gi-caustics-readback', (frame) => {
        frame.copy(spec, staging, spec.byteSize);
    });
    s.app.core.submit();
    const words = new Uint32Array(await s.app.core.readback(staging));
    const floats = new Float32Array(words.buffer);
    s.app.core.destroy(staging);
    const cells = new Map<string, number>();
    for (let w = 8; w + 8 <= words.length; w += 8) {
        const key = words[w]!;
        if (key === 0) continue;
        const y = (((key - 1) >> 10) & 1023) - 512;
        if (y !== 0 && y !== -1) continue;
        const k = `${((key - 1) & 1023) - 512},${(((key - 1) >> 20) & 1023) - 512}`;
        cells.set(k, (cells.get(k) ?? 0) + (floats[w + 4]! + floats[w + 5]! + floats[w + 6]!) / 2);
    }
    return cells;
}

/**
 * Cáusticas por fótons (US5, SC-008): (a) uma esfera de vidro (IOR 1,5, raio R) sob o sol a pino em alturas de 0,8 a
 * 1,2 vezes a distância focal da lente esférica (f = nR / 2(n − 1), do centro): o pico de luz no chão sob ela é o mais
 * concentrado a ≤ 10 % de f e mais claro que o chão aceso em volta; (b) um anel de metal polido sob sol rasante: a
 * cáustica que os fótons somam no chão (no hash) tem o máximo perto da cúspide, a meio raio do centro do
 * lado de onde a luz vai; (c) a água: com a iluminação global, ligar as cáusticas por fótons não muda o fundo sob a
 * água (a dela continua pela vista da luz, sem duplicar).
 */
async function causticsScene(): Promise<void> {
    const size = { width: 640, height: 400 };
    const R = 0.2;
    const ior = 1.5;
    const focal = (ior * R) / (2 * (ior - 1));
    const camera = {
        position: [0, 0.12, 1.6] as Vec3,
        target: [0, 0.01, 0] as Vec3,
        fovY: Math.PI / 5,
    };
    // Com a abertura toda: o foco mais claro que o chão aceso.
    {
        const scene = causticFloor(camera, [0, -1, 0]);
        const s = await openEngine(scene, size, true, (app) => {
            app.world.insert(
                new SphereGeometry({ radius: R })
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [0, focal, 0, 1] }))
                    .add(closureFn(GLASS, ['specular', 'transmission'], { ior: 'f32' }, { ior })),
            );
        });
        await s.step(150);
        const img = await s.read();
        const [cx, cy] = projectPoint(scene, size.width, size.height, [0, 0, 0]);
        const peak = peakNear(img, Math.round(cx), Math.round(cy), 30).value;
        const [lx, ly] = projectPoint(scene, size.width, size.height, [0.5, 0, 0.3]);
        const lit = peakNear(img, Math.round(lx), Math.round(ly), 3).value;
        log(`caustics: esfera de vidro — o foco ${(peak / lit).toFixed(2)}× o chão aceso em volta`);
        check(peak > lit, `caustics: o foco ${(peak / lit).toFixed(2)}× o chão aceso`);
        s.close();
    }
    // A distância focal (paraxial): um diafragma de 12 cm sobre a esfera, a altura dela de 0,8 a 1,2 f.
    const peaks: { factor: number; value: number }[] = [];
    for (const factor of [0.8, 0.9, 1, 1.1, 1.2]) {
        // Sondas a 8 cm: a célula das cáusticas (1/16 do espaçamento) de 5 mm separa o foco.
        const scene = { ...causticFloor(camera, [0, -1, 0]), probeSpacing: 0.08 };
        const h = factor * focal;
        const s = await openEngine(scene, size, true, (app) => {
            app.world.insert(
                new SphereGeometry({ radius: R })
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [0, h, 0, 1] }))
                    .add(closureFn(GLASS, ['specular', 'transmission'], { ior: 'f32' }, { ior })),
            );
            const hole = 0.06;
            const y = h + R + 0.05;
            for (const [x, z, sx, sz] of [
                [0.5 + hole / 2, 0, 1, 2 + 2 * hole],
                [-(0.5 + hole / 2), 0, 1, 2 + 2 * hole],
                [0, 0.5 + hole / 2, 2 * hole, 1],
                [0, -(0.5 + hole / 2), 2 * hole, 1],
            ] as const)
                app.world.insert(
                    new BoxGeometry({ size: [sx, 0.01, sz] })
                        .add(new StandardMaterial({ albedo: [0.05, 0.05, 0.05, 1], roughness: 1 }))
                        .add(new Transform({ position: [x, y, z, 1] })),
                );
        });
        await s.step(150);
        // A maior irradiância das células do hash das cáusticas no chão (lido de volta só no teste): o ponto focado
        // é menor que um pixel na vista rasante.
        const cells = await floorCaustics(s);
        const value = Math.max(0, ...cells.values());
        peaks.push({ factor, value });
        s.close();
    }
    const best = peaks.reduce((x, y) => (y.value > x.value ? y : x));
    log(
        `caustics: esfera de vidro com diafragma — pico por altura (× f = ${focal.toFixed(2)} m): ${peaks
            .map((p) => `${p.factor.toFixed(1)}: ${p.value.toFixed(2)}`)
            .join(', ')}`,
    );
    check(
        Math.abs(best.factor - 1) <= 0.1 + 1e-9,
        `caustics: foco a ${(best.factor * 100).toFixed(0)} % da distância focal (≤ 10 %)`,
    );

    // (b) Anel de metal polido: 48 placas formando a parede (raio 0,4, altura 0,08), sol rasante indo para +x.
    const ringR = 0.4;
    const top = { position: [0, 1.6, 0.001] as Vec3, target: [0, 0, 0] as Vec3, fovY: Math.PI / 4 };
    const sun: Vec3 = [Math.cos(0.3), -Math.sin(0.3), 0];
    const ring = (app: Application): void => {
        for (let k = 0; k < 48; k++) {
            const a = (k / 48) * 2 * Math.PI;
            app.world.insert(
                new BoxGeometry({ size: [0.006, 0.08, (2 * Math.PI * ringR) / 48 + 0.004] })
                    .add(
                        new StandardMaterial({
                            albedo: [0.95, 0.93, 0.88, 1],
                            metallic: 1,
                            roughness: 0.05,
                        }),
                    )
                    .add(
                        new Transform({
                            position: [ringR * Math.cos(a), 0.04, ringR * Math.sin(a), 1],
                            rotation: [0, Math.sin(-a / 2), 0, Math.cos(-a / 2)],
                        }),
                    ),
            );
        }
    };
    // A cáustica no hash (as sondas a 0,3 m: células de 1,875 cm), média num disco de 3 cm, no interior longe da parede.
    let peak = { value: 0, x: 0, z: 0 };
    {
        const s = await openEngine(causticFloor(top, sun), size, true, ring);
        await s.step(150);
        const cells = await floorCaustics(s);
        s.close();
        const cell = 0.3 / 16;
        const reach = Math.ceil(0.03 / cell);
        for (let i = -30; i <= 30; i++)
            for (let j = -30; j <= 30; j++) {
                const x = (i / 30) * 0.32;
                const z = (j / 30) * 0.32;
                if (Math.hypot(x, z) > 0.32) continue;
                const cx = Math.floor(x / cell);
                const cz = Math.floor(z / cell);
                let sum = 0;
                let n = 0;
                for (let a = -reach; a <= reach; a++)
                    for (let b = -reach; b <= reach; b++) {
                        if (Math.hypot(a, b) > reach) continue;
                        sum += cells.get(`${cx + a},${cz + b}`) ?? 0;
                        n++;
                    }
                if (sum / n > peak.value) peak = { value: sum / n, x, z };
            }
    }
    log(
        `caustics: anel — máximo da cáustica em (${peak.x.toFixed(3)}, ${peak.z.toFixed(3)}) m (cúspide esperada em +${(ringR / 2).toFixed(2)}, 0), soma ${peak.value.toFixed(2)}`,
    );
    check(
        peak.value > 0
            && peak.x > 0
            && Math.abs(Math.hypot(peak.x, peak.z) - ringR / 2) <= 0.25 * ringR,
        'caustics: a cáustica do anel com a cúspide perto de meio raio',
    );

    // (c) A água com a iluminação global: as cáusticas por fótons ligadas ou não, o fundo sob a água igual (a luz que a
    // atravessa vem pelas cáusticas dela, na vista da luz — os fótons param na água).
    {
        const { app, canvas } = await giApp(size.width, size.height, engineErrors);
        waterScene(app, {
            width: size.width,
            height: size.height,
            layer: 6,
            eye: [0, 1.6, 0.4],
            target: [0, 0, 0],
        });
        const gi = new GlobalIllumination({ quality: 'medium', bounces: 2 });
        app.world.insert(gi);
        await settle(app, 2500);
        const floorMean = async (): Promise<number> => {
            for (let i = 0; i < 90; i++) app.step(1 / 60);
            app.step(0);
            const img = await readHdrTexture(
                app,
                app.resources.textureOf(app.defaults.targets, 'color')!,
            );
            let sum = 0;
            let n = 0;
            for (let y = Math.round(size.height * 0.35); y < size.height * 0.65; y += 2)
                for (let x = Math.round(size.width * 0.3); x < size.width * 0.7; x += 2) {
                    sum += hdrLuminance(img, x, y);
                    n++;
                }
            return sum / n;
        };
        const on = await floorMean();
        gi.data.caustics = false;
        const off = await floorMean();
        log(
            `caustics: água com a GI — fundo sob a água com as cáusticas por fótons ${on.toFixed(4)}, sem ${off.toFixed(4)}`,
        );
        check(
            Math.abs(on / off - 1) <= 0.02,
            `caustics: a água sem luz duplicada (${((on / off - 1) * 100).toFixed(2)} %)`,
        );
        app.dispose();
        canvas.remove();
    }
}

const CASES: Record<string, () => Promise<void>> = {
    caustics: causticsScene,
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
    living: livingScene,
    softgraph: softGraphScene,
    stability: stabilityScene,
    moving: movingScene,
    leak: leakScene,
    response: responseScene,
    budget: budgetScene,
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

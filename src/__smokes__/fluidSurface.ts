// Spec 017 — Smoke da superfície de água com cáusticas (US1–US5, SC-001–SC-006).
//
// Cenas no tanque de `support/waterScene.ts` (fundo quadriculado, luz direcional com sombra), comparadas com a cena sem
// fluido e entre si:
//   - continuidade (SC-001): a barragem de 36 864 partículas SPH parada, com água opaca, cobre sem buracos o interior
//     da região que os sprites do mesmo corpo ocupam;
//   - SPH, PBF e MPM fluido (SC-002): água na imagem e movimento entre os quadros 20 e 60;
//   - absorção (SC-004): o fundo visto através de camadas de 5, 15 e 30 cm escurece de forma monotônica e o padrão
//     segue reconhecível na camada rasa;
//   - cáusticas (SC-003), com a câmera de cima e a água sem refração nem tinta (o fundo mostra só a luz transmitida):
//     água agitada (ondas refletidas da barragem e ondulações do material) tem regiões ≥ 30% mais claras e ≥ 20% mais escuras que a mesma água parada; parada (sem
//     ondulações), variação ≤ 5%;
//     o fundo fora da água é idêntico ao da cena sem fluido;
//   - caixa submersa recebe a luz transmitida; sprites e água na mesma cena; câmera dentro da água sem preto nem cor
//     inválida; sem MSAA;
//   - nenhuma leitura de volta e nenhuma escrita da CPU no pool das partículas (SC-006);
//   - cada caso igual à fixture `fluidSurface-<caso>-<perfil>.png` (`--record` grava; duas execuções idênticas antes);
//   - desempenho (SC-005): a barragem de 36 864 partículas com água e cáusticas em 1280×720, tempo de GPU por quadro
//     (profiling) ≤ 16,7 ms.
//
// Para rodar: `npm run smoke -- fluidSurface [--record]`. Resultado: `FLUID SURFACE SMOKE PASSED` ou `FAIL: …`.
import { Application, createScene, FluidBody, PointSpriteMaterial } from 'clayflow';
import { gpuProfile, readFixture, recording, writeFixture } from './support/fixtures';
import { gpuSamples, stepPaced } from './support/gpuSamples';
import { diff, fromPng, luminance, toPng } from './support/images';
import { hdrLuminance, readHdrTexture, type HdrImage } from './support/imageMeasures';
import { WATER_SPACING, waterScene, type WaterSceneOptions } from './support/waterScene';

const WIDTH = 320;
const HEIGHT = 200;
/** Quadro da água agitada: as ondas refletidas da barragem já cobrem o centro do tanque. */
const AGITATED_FRAME = 80;
/** Câmera de cima (cáusticas): o fundo ocupa a imagem. */
const TOP_EYE: readonly [number, number, number] = [0, 2.1, 0.01];
/** Água invisível: sem refração, absorção, reflexão nem brilho — o fundo mostra só a luz que a atravessa. */
const CLEAR = {
    refraction: 0,
    absorption: [0, 0, 0, 0],
    reflectivity: 0,
    shininess: 0,
    ior: 1.333,
} as const;

function log(msg: string): void {
    console.log(`[fluidSurface] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const engineErrors: string[] = [];

interface Run {
    readonly frames: readonly ImageData[];
    /** O alvo HDR linear dos mesmos quadros (antes da apresentação): as medidas de luz (spec 034, S1). */
    readonly hdr: readonly HdrImage[];
    readonly readbacks: number;
    readonly poolWrites: number;
    readonly profile: string;
}

/**
 * Monta a cena, avança até cada quadro pedido e captura a imagem; conta as leituras de volta e as escritas da CPU no
 * pool do corpo depois da inserção.
 */
async function run(
    name: string,
    options: Omit<WaterSceneOptions, 'width' | 'height'>,
    frames: readonly number[],
    extra?: (app: Application) => void,
    antialias = true,
): Promise<Run> {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        antialias,
    });
    app.events.on('engineError', (e) => engineErrors.push(`${name}: ${e.stage}: ${e.message}`));
    // As leituras de volta do motor nos quadros (as das medidas, como a do alvo HDR, ficam de fora).
    let readbacks = 0;
    let measuring = false;
    const readback = app.core.readback.bind(app.core);
    app.core.readback = (spec: Parameters<typeof readback>[0]) => {
        if (!measuring) readbacks++;
        return readback(spec);
    };
    const body = waterScene(app, { width: WIDTH, height: HEIGHT, ...options });
    extra?.(app);
    app.step(1 / 60);
    let poolWrites = 0;
    const poolKey = body === undefined ? undefined : app.resources.poolKeyForResource(body);
    const pool = poolKey === undefined ? undefined : app.resources.poolBufferSpec(poolKey);
    const write = app.core.write.bind(app.core);
    app.core.write = (spec, data, offset) => {
        if (pool !== undefined && spec === pool) poolWrites++;
        write(spec, data, offset);
    };
    const ctx = new OffscreenCanvas(WIDTH, HEIGHT).getContext('2d', { willReadFrequently: true });
    if (ctx === null) throw new Error('canvas 2D indisponível');
    const out: ImageData[] = [];
    const hdr: HdrImage[] = [];
    let frame = 1;
    for (const target of frames) {
        while (frame < target) {
            app.step(1 / 60);
            frame++;
        }
        ctx.drawImage(canvas, 0, 0);
        out.push(ctx.getImageData(0, 0, WIDTH, HEIGHT));
        const color = app.resources.textureOf(app.defaults.targets, 'color');
        if (color === undefined) throw new Error('alvo HDR não alocado');
        measuring = true;
        hdr.push(await readHdrTexture(app, color));
        measuring = false;
    }
    const profile = gpuProfile(app);
    app.dispose();
    canvas.remove();
    return { frames: out, hdr, readbacks, poolWrites, profile };
}

/** Compara (ou grava) a fixture do caso. */
async function fixture(
    name: string,
    image: ImageData,
    again: () => Promise<ImageData>,
    profile: string,
    failures: string[],
): Promise<void> {
    const file = `fluidSurface-${name}-${profile}.png`;
    if (recording()) {
        const d = diff(image, await again());
        if (d.pixels > 0) {
            failures.push(`${name}: duas execuções diferem (${d.pixels} pixels, máx. ${d.max})`);
            return;
        }
        await writeFixture(file, await toPng(image));
        log(`${name}: gravada (${file})`);
        return;
    }
    const bytes = await readFixture(file);
    if (bytes === null) {
        failures.push(`${name}: sem fixture ${file} (rode com --record)`);
        return;
    }
    const d = diff(await fromPng(bytes), image);
    log(
        `${name}: ${d.pixels === 0 ? 'idêntica' : `${d.pixels} pixels diferentes (máx. ${d.max})`}`,
    );
    if (d.pixels > 0) failures.push(`${name}: ${d.pixels} pixels diferentes`);
}

/** Pixels de a ≠ b. */
function changed(a: ImageData, b: ImageData): Uint8Array {
    const mask = new Uint8Array(a.width * a.height);
    for (let p = 0; p < mask.length; p++) {
        for (let k = 0; k < 3; k++) {
            if (a.data[p * 4 + k] !== b.data[p * 4 + k]) {
                mask[p] = 1;
                break;
            }
        }
    }
    return mask;
}

/** Erosão quadrada de raio `r` (o interior da máscara). */
function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
    const out = new Uint8Array(mask.length);
    for (let y = r; y < h - r; y++) {
        for (let x = r; x < w - r; x++) {
            let all = 1;
            for (let dy = -r; dy <= r && all === 1; dy++)
                for (let dx = -r; dx <= r; dx++)
                    if (mask[(y + dy) * w + x + dx] === 0) {
                        all = 0;
                        break;
                    }
            out[y * w + x] = all;
        }
    }
    return out;
}

/**
 * Razão de radiância a/b (o alvo HDR linear, antes da apresentação: o AgX comprime o contraste na tela — spec 034, S1)
 * nos pixels da região, só nos ladrilhos claros iluminados (`bright` na tela > 0,4: a seleção de antes).
 */
function ratios(
    a: HdrImage,
    b: HdrImage,
    bright: ImageData,
    region: (x: number, y: number) => boolean,
): number[] {
    const out: number[] = [];
    for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
            if (!region(x, y)) continue;
            if (luminance(bright, x, y) < 0.4) continue;
            out.push(hdrLuminance(a, x, y) / hdrLuminance(b, x, y));
        }
    }
    return out.sort((p, q) => p - q);
}

const quantile = (sorted: readonly number[], q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))] ?? 0;

/** Região central do fundo na vista de cima (longe das paredes e da caixa). */
/**
 * Razões água ÷ cena vazia vistas através de uma camada plana de água de altura `h` (spec 034, US7): com a refração
 * traçada, o pixel mostra o ponto do fundo onde o raio da câmera chega depois de refratar na superfície (Snell, IOR
 * 1,333), não o de baixo dele — a referência é a cena vazia nesse ponto (projetado na mesma câmera). Só os pixels cujo
 * ponto cai no meio de um ladrilho (os 3 × 3 pixels em volta iguais: sem a borda dos ladrilhos, onde uma fração de
 * pixel no ponto já muda tudo).
 */
function refractedRatios(
    a: HdrImage,
    b: HdrImage,
    bright: ImageData,
    region: (x: number, y: number) => boolean,
    h: number,
    each?: (x: number, y: number, ratio: number) => void,
): number[] {
    const sub = (u: readonly number[], v: readonly number[]): number[] =>
        u.map((c, k) => c - v[k]!);
    const dot = (u: readonly number[], v: readonly number[]): number =>
        u.reduce((s, c, k) => s + c * v[k]!, 0);
    const norm = (u: readonly number[]): number[] => u.map((c) => c / Math.hypot(...u));
    const cross = (u: readonly number[], v: readonly number[]): number[] => [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const eye = TOP_EYE;
    const forward = norm(sub([0, 0.1, 0], eye));
    const right = norm(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    const f = HEIGHT / 2 / Math.tan(Math.PI / 8);
    const eta = 1 / 1.333;
    const out: number[] = [];
    for (let y = 0; y < a.height; y++)
        for (let x = 0; x < a.width; x++) {
            if (!region(x, y)) continue;
            const [u, v] = [x + 0.5 - WIDTH / 2, HEIGHT / 2 - (y + 0.5)];
            const d = norm(forward.map((c, k) => c * f + right[k]! * u + up[k]! * v));
            const p = eye.map((c, k) => c + d[k]! * ((h - eye[1]) / d[1]!));
            const cosi = -d[1]!;
            const t = d.map(
                (c, k) =>
                    eta * c
                    + (k === 1 ? eta * cosi - Math.sqrt(1 - eta * eta * (1 - cosi * cosi)) : 0),
            );
            const q = p.map((c, k) => c + t[k]! * (-h / t[1]!));
            const w = sub(q, eye);
            const z = dot(w, forward);
            const sx = WIDTH / 2 + (f * dot(w, right)) / z - 0.5;
            const sy = HEIGHT / 2 - (f * dot(w, up)) / z - 0.5;
            const [ix, iy] = [Math.round(sx), Math.round(sy)];
            let inside = ix >= 1 && iy >= 1 && ix < WIDTH - 1 && iy < HEIGHT - 1;
            const center = inside ? luminance(bright, ix, iy) : 0;
            inside &&= center >= 0.4;
            for (let j = -1; j <= 1 && inside; j++)
                for (let i = -1; i <= 1 && inside; i++)
                    inside = Math.abs(luminance(bright, ix + i, iy + j) - center) < 0.03;
            if (!inside) continue;
            const [x0, y0] = [Math.floor(sx), Math.floor(sy)];
            const [fx, fy] = [sx - x0, sy - y0];
            const ref =
                (1 - fy) * ((1 - fx) * hdrLuminance(b, x0, y0) + fx * hdrLuminance(b, x0 + 1, y0))
                + fy
                    * ((1 - fx) * hdrLuminance(b, x0, y0 + 1)
                        + fx * hdrLuminance(b, x0 + 1, y0 + 1));
            out.push(hdrLuminance(a, x, y) / ref);
            each?.(x, y, hdrLuminance(a, x, y) / ref);
        }
    return out.sort((p, q) => p - q);
}

const centralFloor = (x: number, y: number): boolean =>
    x > WIDTH * 0.3 && x < WIDTH * 0.7 && y > HEIGHT * 0.35 && y < HEIGHT * 0.65;

/**
 * Diagnóstico pela URL: `?only=caustics,perf` roda só esses blocos; `?stages=1` dá o tempo de cada passe no desempenho
 * (o critério continua o do quadro); `?dump=1` grava as imagens dos blocos que as expõem (`debug-*.png` nas fixtures).
 */
const QUERY = new URLSearchParams(location.search);
const ONLY = QUERY.get('only')?.split(',');
const want = (block: string): boolean => ONLY === undefined || ONLY.includes(block);

async function dump(name: string, image: ImageData): Promise<void> {
    if (QUERY.get('dump') === '1')
        await writeFixture(`debug-fluidSurface-${name}.png`, await toPng(image));
}

async function main(): Promise<void> {
    const failures: string[] = [];
    const empty = await run('vazio', { material: 'none', box: true }, [2]);
    const emptyTop = await run('vazio-cima', { material: 'none', eye: TOP_EYE }, [2]);

    // Continuidade: água opaca (absorção alta) sobre a área dos sprites do mesmo corpo, parado no primeiro quadro.
    if (want('continuity')) {
        const opaque = { absorption: [80, 80, 80, 0], color: [0.9, 0.1, 0.1, 1] } as const;
        const water = await run('continuidade', { material: opaque, box: true }, [2]);
        const sprites = await run('continuidade-sprites', { material: 'sprites', box: true }, [2]);
        const mask = erode(changed(sprites.frames[0]!, empty.frames[0]!), WIDTH, HEIGHT, 3);
        let interior = 0;
        let holes = 0;
        const seen = changed(water.frames[0]!, empty.frames[0]!);
        for (let p = 0; p < mask.length; p++) {
            if (mask[p] === 0) continue;
            interior++;
            if (seen[p] === 0) holes++;
        }
        log(`continuidade: ${interior} px no interior, ${holes} com o fundo aparecendo`);
        if (interior < 500) failures.push(`continuidade: interior pequeno (${interior} px)`);
        if (holes > 0) failures.push(`continuidade: ${holes} px de buraco no interior`);
        if (water.readbacks > 0) failures.push(`continuidade: ${water.readbacks} leituras`);
        await fixture(
            'dam-opaque',
            water.frames[0]!,
            async () =>
                (await run('continuidade', { material: opaque, box: true }, [2])).frames[0]!,
            water.profile,
            failures,
        );
    }

    // SPH, PBF e MPM fluido: água visível e em movimento; nenhuma leitura de volta nem escrita no pool.
    for (const algorithm of want('algorithms') ? (['SPH', 'PBF', 'MPM'] as const) : []) {
        const name = algorithm.toLowerCase();
        const options = { algorithm, dam: [16, 24, 20] as const, box: true };
        const r = await run(name, options, [20, 60]);
        const visible = changed(r.frames[1]!, empty.frames[0]!).reduce((a, v) => a + v, 0);
        const moved = diff(r.frames[0]!, r.frames[1]!).pixels;
        log(
            `${name}: ${visible} px de água, ${moved} px mudaram, ${r.readbacks} leituras, ${r.poolWrites} escritas no pool`,
        );
        if (visible < 1000) failures.push(`${name}: água pouco visível (${visible} px)`);
        if (moved === 0) failures.push(`${name}: a imagem não mudou entre os quadros 20 e 60`);
        if (r.readbacks > 0) failures.push(`${name}: ${r.readbacks} leituras de volta`);
        if (r.poolWrites > 0) failures.push(`${name}: ${r.poolWrites} escritas da CPU no pool`);
        await fixture(
            name,
            r.frames[1]!,
            async () => (await run(name, options, [20, 60])).frames[1]!,
            r.profile,
            failures,
        );
    }

    // Absorção: camadas de 5, 15 e 30 cm assentadas; luminância do fundo central cai com a profundidade.
    if (want('absorption')) {
        const lum: number[] = [];
        let contrast = 0;
        for (const layer of [2, 6, 12]) {
            const material = { absorption: [1.2, 0.5, 0.3, 0], refraction: 0, reflectivity: 0 };
            const r = await run(`camada-${layer}`, { layer, material, eye: TOP_EYE }, [90]);
            const img = r.frames[0]!;
            let sum = 0;
            let n = 0;
            const values: number[] = [];
            for (let y = 0; y < HEIGHT; y++)
                for (let x = 0; x < WIDTH; x++)
                    if (centralFloor(x, y)) {
                        const l = luminance(img, x, y);
                        sum += l;
                        n++;
                        values.push(l);
                    }
            lum.push(sum / n);
            if (layer === 2) {
                values.sort((a, b) => a - b);
                contrast = quantile(values, 0.9) - quantile(values, 0.1);
            }
            if (layer === 6)
                await fixture(
                    'layer-15cm',
                    img,
                    async () =>
                        (await run(`camada-${layer}`, { layer, material, eye: TOP_EYE }, [90]))
                            .frames[0]!,
                    r.profile,
                    failures,
                );
        }
        log(
            `absorção: luminância ${lum.map((l) => l.toFixed(3)).join(' > ')}; contraste do padrão na camada rasa ${contrast.toFixed(3)}`,
        );
        if (!(lum[0]! > lum[1]! && lum[1]! > lum[2]!))
            failures.push(`absorção: luminância não cai com a profundidade (${lum.join(', ')})`);
        if (contrast < 0.2) failures.push(`absorção: padrão do fundo irreconhecível (${contrast})`);
    }

    // Cáusticas: vista de cima, água sem refração nem tinta; agitada (barragem caindo) × parada (camada assentada).
    if (want('caustics')) {
        const agitated = await run(
            'agitada',
            { dam: [24, 24, 32], material: CLEAR, eye: TOP_EYE },
            [AGITATED_FRAME],
        );
        // Parada: sem as ondulações do material e depois de assentar (mede a planura da superfície simulada).
        const flat = await run(
            'parada',
            { layer: 6, material: { ...CLEAR, rippleStrength: 0 }, eye: TOP_EYE },
            [300],
        );
        const off = await run(
            'agitada-sem',
            { dam: [24, 24, 32], material: { ...CLEAR, caustics: false }, eye: TOP_EYE },
            [AGITATED_FRAME],
        );
        await dump('parada', flat.frames[0]!);
        await dump('vazio-cima', emptyTop.frames[0]!);
        // A camada plana que melhor explica a imagem (a altura assentada não é conhecida de antemão: 0–30 cm, de mm em
        // mm); a variação que sobra é a da superfície simulada (o relevo e as cáusticas dele).
        let base: number[] = [];
        let spread = Infinity;
        let level = 0;
        for (let mm = 0; mm <= 300; mm++) {
            const r = refractedRatios(
                flat.hdr[0]!,
                emptyTop.hdr[0]!,
                emptyTop.frames[0]!,
                centralFloor,
                mm / 1000,
            );
            if (r.length < 200) continue;
            const s = (quantile(r, 0.95) - quantile(r, 0.05)) / quantile(r, 0.5);
            if (s < spread) [base, spread, level] = [r, s, mm];
        }
        const median = quantile(base, 0.5);
        if (QUERY.get('dump') === '1') {
            // O mapa das razões: cinza médio = a mediana, ±25 % do preto ao branco; fora da medida, azul.
            const map = new ImageData(WIDTH, HEIGHT);
            for (let i = 0; i < map.data.length; i += 4) map.data.set([0, 0, 120, 255], i);
            refractedRatios(
                flat.hdr[0]!,
                emptyTop.hdr[0]!,
                emptyTop.frames[0]!,
                centralFloor,
                level / 1000,
                (x, y, r) => {
                    const g = Math.max(0, Math.min(255, 128 + ((r / median - 1) / 0.25) * 127));
                    map.data.set([g, g, g, 255], (y * WIDTH + x) * 4);
                },
            );
            await dump('parada-razoes', map);
        }
        log(`cáusticas: camada parada vista como plana a ${level} mm, ${base.length} px`);
        const wave = ratios(agitated.hdr[0]!, emptyTop.hdr[0]!, emptyTop.frames[0]!, centralFloor);
        const bright = quantile(wave, 0.99) / median;
        const dark = quantile(wave, 0.01) / median;
        const plain = ratios(off.hdr[0]!, emptyTop.hdr[0]!, emptyTop.frames[0]!, centralFloor);
        const plainSpread = (quantile(plain, 0.99) - quantile(plain, 0.01)) / quantile(plain, 0.5);
        log(
            `cáusticas: parada mediana ${median.toFixed(3)}, variação ${(spread * 100).toFixed(1)}%; agitada ${bright.toFixed(2)}× / ${dark.toFixed(2)}×; desligadas variação ${(plainSpread * 100).toFixed(1)}%`,
        );
        if (spread > 0.05)
            failures.push(`cáusticas: água parada varia ${(spread * 100).toFixed(1)}%`);
        if (bright < 1.3) failures.push(`cáusticas: regiões claras só ${bright.toFixed(2)}×`);
        if (dark > 0.8) failures.push(`cáusticas: regiões escuras só ${dark.toFixed(2)}×`);
        if (plainSpread >= (quantile(wave, 0.99) - quantile(wave, 0.01)) / median)
            failures.push('cáusticas: desligadas não reduzem o padrão');
        // Fora da água (lado direito do tanque, onde a barragem ainda não chegou): igual à cena sem fluido.
        const early = await run(
            'agitada-inicio',
            { dam: [24, 24, 32], material: CLEAR, eye: TOP_EYE },
            [2],
        );
        let outside = 0;
        let different = 0;
        const dry = (x: number, y: number) =>
            x > WIDTH * 0.62 && x < WIDTH * 0.72 && y > HEIGHT * 0.3 && y < HEIGHT * 0.7;
        for (let y = 0; y < HEIGHT; y++)
            for (let x = 0; x < WIDTH; x++) {
                if (!dry(x, y)) continue;
                outside++;
                const i = (y * WIDTH + x) * 4;
                for (let k = 0; k < 4; k++)
                    if (early.frames[0]!.data[i + k] !== emptyTop.frames[0]!.data[i + k]) {
                        different++;
                        break;
                    }
            }
        log(`fora da água: ${different} de ${outside} px diferentes da cena sem fluido`);
        if (different > 0) failures.push(`fora da água: ${different} px diferentes`);
        await fixture(
            'caustics',
            agitated.frames[0]!,
            async () =>
                (
                    await run('agitada', { dam: [24, 24, 32], material: CLEAR, eye: TOP_EYE }, [
                        AGITATED_FRAME,
                    ])
                ).frames[0]!,
            agitated.profile,
            failures,
        );
    }

    // Caixa submersa: a face de cima recebe a luz transmitida (difere da cena sem água).
    if (want('box')) {
        const r = await run(
            'submersa',
            { layer: 12, material: CLEAR, eye: TOP_EYE, box: true },
            [120],
        );
        const ref = await run('submersa-vazio', { material: 'none', eye: TOP_EYE, box: true }, [2]);
        // Topo da caixa na vista de cima (caixa em x = 0,15, z = 0).
        const top = (x: number, y: number) =>
            x > WIDTH * 0.53 && x < WIDTH * 0.6 && y > HEIGHT * 0.45 && y < HEIGHT * 0.55;
        const lit = ratios(r.hdr[0]!, ref.hdr[0]!, ref.frames[0]!, top);
        const spread = quantile(lit, 0.95) - quantile(lit, 0.05);
        log(`caixa submersa: razão ${quantile(lit, 0.5).toFixed(3)}, faixa ${spread.toFixed(3)}`);
        // A luz transmitida chega à face: o padrão das cáusticas nela (com a água límpida e plana, Fresnel e a
        // concentração do feixe refratado se compensam e a razão média fica perto de 1).
        if (lit.length === 0 || spread < 0.02)
            failures.push('caixa submersa: a face de cima não recebe a luz transmitida');
        await fixture(
            'submerged-box',
            r.frames[0]!,
            async () =>
                (
                    await run(
                        'submersa',
                        { layer: 12, material: CLEAR, eye: TOP_EYE, box: true },
                        [120],
                    )
                ).frames[0]!,
            r.profile,
            failures,
        );
    }

    // Sprites e água na mesma cena.
    if (want('coexistence')) {
        const extra = (app: Application) => {
            const position: number[] = [];
            for (let i = 0; i < 400; i++)
                position.push(
                    0.4 + (i % 8) * WATER_SPACING,
                    0.3 + Math.floor(i / 64) * WATER_SPACING,
                    ((i >> 3) % 8) * WATER_SPACING,
                );
            app.world.insert(
                new FluidBody({ algorithm: 'PBF', position }).add(
                    new PointSpriteMaterial({
                        color: [1, 0.2, 0.1, 1],
                        radius: WATER_SPACING * 0.5,
                    }),
                ),
            );
        };
        const r = await run('coexistencia', { dam: [16, 24, 20], box: true }, [30], extra);
        let red = 0;
        const img = r.frames[0]!;
        for (let i = 0; i < img.data.length; i += 4)
            if (
                // Vermelho dominante (os sprites iluminados pelo PBR da 011 perdem saturação).
                img.data[i]! > 80
                && img.data[i]! > 1.8 * img.data[i + 1]!
                && img.data[i]! > 1.8 * img.data[i + 2]!
            )
                red++;
        const water = changed(img, empty.frames[0]!).reduce((a, v) => a + v, 0);
        log(`coexistência: ${red} px de sprites, ${water} px alterados`);
        if (red < 50) failures.push(`coexistência: sprites ausentes (${red} px)`);
        await fixture(
            'coexistence',
            img,
            async () =>
                (await run('coexistencia', { dam: [16, 24, 20], box: true }, [30], extra))
                    .frames[0]!,
            r.profile,
            failures,
        );
    }

    // Câmera dentro da água (no meio da barragem): sem preto nem cor inválida.
    if (want('inside')) {
        const r = await run('dentro', { eye: [-0.55, 0.4, 0.05], target: [0.5, 0.2, 0] }, [2]);
        const img = r.frames[0]!;
        let black = 0;
        let sum = 0;
        for (let y = 0; y < HEIGHT; y++)
            for (let x = 0; x < WIDTH; x++) {
                const l = luminance(img, x, y);
                sum += l;
                if (l < 0.01) black++;
            }
        const mean = sum / (WIDTH * HEIGHT);
        log(`dentro da água: luminância média ${mean.toFixed(3)}, ${black} px pretos`);
        if (mean < 0.05) failures.push(`dentro da água: imagem escura (${mean})`);
        if (black > WIDTH * HEIGHT * 0.05) failures.push(`dentro da água: ${black} px pretos`);
    }

    // Sem MSAA: a água é desenhada.
    if (want('msaa')) {
        const r = await run('sem-msaa', { dam: [16, 24, 20], box: true }, [30], undefined, false);
        const ref = await run(
            'sem-msaa-vazio',
            { material: 'none', box: true },
            [2],
            undefined,
            false,
        );
        const water = changed(r.frames[0]!, ref.frames[0]!).reduce((a, v) => a + v, 0);
        log(`sem MSAA: ${water} px de água`);
        if (water < 1000) failures.push(`sem MSAA: água pouco visível (${water} px)`);
    }

    if (want('perf')) await performance36k(failures);
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('FLUID SURFACE SMOKE PASSED');
}

/** SC-005: barragem de 36 864 partículas com água e cáusticas em 1280×720, tempo de GPU por quadro. */
async function performance36k(failures: string[]): Promise<void> {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        ...(QUERY.get('stages') === '1'
            ? { profiling: 'passes' as const, profilingCapacity: 2048 }
            : { profiling: 'frame' as const }),
    });
    app.events.on('engineError', (e) => engineErrors.push(`desempenho: ${e.stage}: ${e.message}`));
    const stages = new Map<string, number[]>();
    app.events.on('frameComplete', (e) => {
        for (const [k, ns] of Object.entries(e.stats.stagesNs ?? {}))
            stages.set(k, [...(stages.get(k) ?? []), ns / 1e6]);
    });
    waterScene(app, { width: 1280, height: 720, box: true });
    // No ritmo da GPU e cada quadro de GPU uma vez (spec 034, R17); depois de 70 quadros de aquecimento, até 90
    // leituras novas (no máximo 1000 quadros).
    const gpu = gpuSamples(app);
    for (let i = 0; i < 70; i++) await stepPaced(app);
    gpu.samples.length = 0;
    for (let i = 0; i < 1000 && gpu.samples.length < 90; i++) await stepPaced(app);
    app.dispose();
    canvas.remove();
    const window = gpu.samples.slice(-90);
    const mean = window.reduce((a, b) => a + b, 0) / Math.max(1, window.length);
    log(
        `desempenho: barragem de 36 864 com água e cáusticas, GPU ${mean.toFixed(2)} ms/quadro (${window.length} amostras)`,
    );
    const median = (v: number[]): number => [...v].sort((a, b) => a - b)[v.length >> 1] ?? 0;
    for (const [k, v] of [...stages]
        .filter(() => QUERY.get('stages') === '1')
        .sort((a, b) => median(b[1]) - median(a[1]))
        .slice(0, 12))
        log(`  passe ${k}: ${median(v).toFixed(2)} ms`);
    if (window.length < 30) failures.push(`desempenho: poucas amostras de GPU (${window.length})`);
    else if (mean > 1000 / 60) failures.push(`desempenho: GPU ${mean.toFixed(2)} ms > 16,7 ms`);
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

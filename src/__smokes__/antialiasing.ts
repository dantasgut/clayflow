// Spec 034 — Smoke do antisserrilhado temporal (US2; SC-004, SC-005).
//
// Mede a imagem apresentada (lida direto da GPU, `readCanvas`) contra a referência do próprio motor: o modo
// `accumulate` com 256 posições da amostra dentro do pixel (outra sequência que a de 64 do temporal), câmera parada — a
// integral do pixel sem rejeição.
//   - still: a cena de teste (arestas de alto contraste, xadrez procedural fino, esfera lisa com realce, sombra, vidro):
//     erro médio ≤ 1 % depois de 16 quadros do modo temporal e erro nas bordas ≤ 3 % depois de 64 (relativos ao brilho
//     médio da imagem; bordas = os 5 % de pixels de maior gradiente da referência; decisão do usuário, 2026-10-20: o
//     resto das bordas é o número de posições da amostra, não o tempo).
//   - trail: uma bola clara atravessa a cena; nos pixels por onde ela passou há 4 quadros ou mais (e não está agora), o
//     desvio coerente sobre a imagem sem a bola (o modo temporal em passo, sem a bola) — a média, a cada quadro, da
//     diferença nos pixels contados, nos dois sentidos — fica ≤ 1 % do brilho da bola (sem rastro; decisão do usuário,
//     2026-10-25: um rastro tem a forma da bola e desloca muitos pixels para o mesmo lado, e o pior pixel isolado, que
//     antes era o critério, é o ruído simétrico da reconvergência — fica no registro). A pegada da bola: onde o quadro sem antisserrilhado com a bola difere do sem a bola; contam os pixels de
//     fundo liso (numa aresta, o pixel recomeçado tem outra média das amostras — ruído, não rastro) e sem detalhe menor
//     que o pixel (faixa < 0,02 do fundo temporal entre as 8 primeiras posições da amostra; decisão de 2026-10-21).
//   - deform: o mesmo, com a bola como superfície paramétrica deslocada pelos vértices (o `Transform` parado; os
//     vetores de movimento vêm dos vértices do quadro anterior) numa cena sem o vidro e a esfera lisa.
//   - orbit: a câmera gira a 30°/s em volta do vidro; em três poses o quadro do modo temporal contra a referência
//     parada na mesma pose: a energia de gradiente da referência / a do temporal ≤ 1,5 (o borrão do movimento) e erro
//     médio ≤ 3 %.
//   - sprites: partículas em sprites caindo; a cobertura delas no modo temporal ≥ 90 % da do modo sem antisserrilhado
//     (o histórico não as apaga).
//   - spriteTrail: partículas em sprites (raio 0,04 m) atravessando a cena de lado a 1 m/s, acima do chão, no lugar da
//     bola: o rastro delas, nos dois sentidos, ≤ 1 % (T031).
//   - pointTrail: os vértices de uma esfera como sprites (`PointSpriteMaterial`), movidos pelo `Transform` no caminho
//     da bola: o mesmo rastro (T031).
//   - waterOrbit: a câmera gira a 30°/s em volta de um tanque de água parada (a física e as ondulações congeladas
//     depois de assentar); os mesmos critérios da órbita (T031: o movimento da superfície da água).
//   - shadowEdge: a sombra de uma placa girada 20° sobre o chão liso (mapa de 1024², luz a 50° da vertical), 960 × 540:
//     nas quatro bordas (retas no chão), onde a imagem cruza o meio entre o iluminado e a sombra, o resíduo da reta
//     ajustada (o degrau que a grade do mapa deixa, em pixels) e a cintilação da penumbra de um quadro ao seguinte
//     (relativa ao contraste) — sem antisserrilhado, no temporal após 64 quadros e na acumulação de 256 (T034).
//     Critério (decisão do usuário, 2026-10-22): o degrau do temporal no máximo 0,1 px RMS acima do da acumulação e a
//     cintilação do temporal ≤ 4 % do contraste.
//   - matrices: as matrizes da câmera compostas na GPU (pool `CameraMatrices` lido de volta) contra o oráculo daqui
//     (vista por `lookAt`, perspectiva da WebGPU, Halton (2, 3) escrita à mão): no corte, o deslocamento da posição 1
//     da sequência, a projeção e a vista-projeção com ele (a translação em clip proporcional a w), a sem ele, a anterior
//     igual à atual e o histórico recomeçado; no quadro seguinte, com a câmera movida, a posição 2, a anterior bit a bit
//     a sem deslocamento do quadro de antes; num novo corte, a sequência recomeça (T025).
//   - cost: a 1280 × 720 em órbita, com profiling por passe, a duração do quadro na GPU (mediana de 120 quadros, do
//     primeiro início ao último fim) com o temporal menos a sem antisserrilhado ≤ 1,5 ms (SC-011, 9 % do quadro de 60 Hz
//     no M4), com a refração traçada desligada nas duas: o filtro do sinal traçado e a marca de movimento são do
//     orçamento da refração (3 ms, medido no smoke `refraction`), não do antisserrilhado — decisão de 2026-10-24. Não a
//     soma dos passes: no M4 eles se sobrepõem e o intervalo de cada um conta também o fim do anterior.
// Para rodar: `npm run smoke -- antialiasing [--query case=still]`. Resultado: `ANTIALIASING SMOKE PASSED` ou `FAIL: …`.
import * as clayflow from 'clayflow';
import {
    Application,
    BoxGeometry,
    createScene,
    SphereGeometry,
    StandardMaterial,
    Transform,
    type AntialiasingMode,
    type CanvasPixels,
    type GpuFrameTimedPayload,
} from 'clayflow';
import { closureFn } from './support/materialScenes';
import { waterScene } from './support/waterScene';
import { writeFixture } from './support/fixtures';
import { lumaSrgb8 } from './support/images';
import { projectiveInverse, rigidInverse } from '../elements/math/reference/xform';

function log(msg: string): void {
    console.log(`[antialiasing] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null)
        el.textContent += `${msg}
`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

const W = 480;
const H = 270;
const pct = (v: number): string => `${(v * 100).toFixed(2)} %`;

type Look = (position: readonly [number, number, number]) => void;

interface Scene {
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
    readonly look: Look;
    /** A câmera (corte: a acumulação e o histórico recomeçam). */
    readonly camera: clayflow.Camera;
    /** Leva a bola à posição do quadro `i` (com a bola). */
    readonly move?: (i: number) => void;
}

const TARGET = [0, 0.4, 0] as const;
/** Posições da amostra (e quadros) da referência parada. */
const REF_SAMPLES = 256;

/** Posição da bola no quadro `i` (atravessa a cena atrás do vidro em 2 s). */
const ballAt = (i: number): [number, number, number, number] => [-2 + (4 * i) / 120, 0.4, -0.8, 1];

/** A cena de teste no modo pedido. */
async function scene(
    mode: AntialiasingMode,
    options: {
        /**
         * A bola: por `Transform` ou superfície paramétrica deslocada pelos vértices (`Transform` parado); ou, no lugar
         * dela, partículas em sprites caindo (o movimento delas é o da física).
         */
        ball?: 'transform' | 'surface' | 'sprites' | 'points';
        /** Sem o vidro e a esfera lisa (nada reflete nem refrata a bola). */
        bare?: boolean;
        size?: readonly [number, number];
        profiling?: boolean;
        /** Sem o filtro do sinal traçado: a composição mostra a amostra crua da refração. */
        rawTraced?: boolean;
    } = {},
): Promise<Scene> {
    const [width, height] = options.size ?? [W, H];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        antialias: mode,
        canvasOptions: { capture: true },
        ...(options.profiling === true ? { profiling: 'passes' as const } : {}),
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    if (mode === 'accumulate') app.defaults.antialiasing.data.sequence = REF_SAMPLES;
    if (options.rawTraced === true) app.defaults.temporalFilter.enabled = false;
    const view = new Transform({ position: [0, 1, 3, 1] });
    const camera = new clayflow.Camera({
        fov: 0.8,
        aspect: width / height,
        aspectMode: 'fixed',
        near: 0.05,
        far: 50,
    });
    app.world.insert(camera.add(view));
    const look: Look = (p) => {
        view.data.position = [...p, 1];
        view.data.rotation = Transform.lookRotation(p, TARGET);
    };
    look([0, 1, 3]);
    app.world.insert(
        new clayflow.DirectionalLight({
            direction: [-0.4, -1, -0.3, 0],
            intensity: 3,
            castShadow: true,
            shadow: { size: [2048, 2048] },
        }),
    );
    // Chão com xadrez procedural fino (0,1 m), sem filtragem: o serrilhado que o temporal tem de integrar.
    app.world.insert(
        new clayflow.PlaneGeometry({ size: [8, 8] })
            .add(new StandardMaterial({ albedo: [0.7, 0.7, 0.7, 1], roughness: 0.9 }))
            .add(new Transform())
            .add(
                closureFn(
                    'let c = (floor(s.world_position.x * 10.0) + floor(s.world_position.z * 10.0)) % 2.0;\n    return closure_diffuse(mix(vec3f(0.1), vec3f(0.8), abs(c)), 0.0);',
                    ['diffuse'],
                ),
            ),
    );
    // Caixa escura de arestas vivas.
    app.world.insert(
        new BoxGeometry({ size: [0.6, 0.6, 0.6] })
            .add(new StandardMaterial({ albedo: [0.05, 0.05, 0.05, 1], roughness: 0.6 }))
            .add(new Transform({ position: [-0.9, 0.3, -0.4, 1] })),
    );
    if (options.bare !== true) insertProps(app);
    const emissive = closureFn(
        'return closure_add(closure_diffuse(vec3f(0.0), 0.0), closure_emission(vec3f(6.0, 6.0, 6.0), 1.0));',
        ['diffuse', 'emission'],
    );
    let move: ((i: number) => void) | undefined;
    if (options.ball === 'transform') {
        const ball = new Transform({ position: ballAt(0) });
        app.world.insert(
            new SphereGeometry({ radius: 0.12, latSegments: 32, lonSegments: 64 })
                .add(new StandardMaterial({ albedo: [0, 0, 0, 1], roughness: 1 }))
                .add(ball)
                .add(emissive),
        );
        // Diagnóstico: `--query freeze=<quadro>` deixa a bola parada na posição daquele quadro (parada, não deixa rastro:
        // o que sobra contra a cena sem ela é o efeito dela agora — a luz e a sombra que o vidro mostra).
        const freeze = new URLSearchParams(location.search).get('freeze');
        move = (i) => {
            ball.data.position = ballAt(freeze === null ? i : Number(freeze));
        };
    } else if (options.ball === 'surface') {
        const fn = new clayflow.SurfaceFunction({
            code: BALL_SURFACE,
            params: { center: 'vec3f' },
            values: { center: ballAt(0).slice(0, 3) },
        });
        app.world.insert(
            new clayflow.ParametricSurface({
                domain: [0, 2 * Math.PI, 0, Math.PI],
                resolution: [64, 32],
            })
                .add(fn)
                .add(new StandardMaterial({ albedo: [0, 0, 0, 1], roughness: 1 }))
                .add(new Transform())
                .add(emissive),
        );
        move = (i) => {
            fn.values.center = ballAt(i).slice(0, 3);
        };
    } else if (options.ball === 'sprites') insertSprites(app, 0.04, 'cross');
    else if (options.ball === 'points') {
        // Os vértices de uma esfera como sprites (`PointSpriteMaterial` no forward), movidos pelo `Transform`.
        const ball = new Transform({ position: ballAt(0) });
        app.world.insert(
            new SphereGeometry({ radius: 0.12, latSegments: 8, lonSegments: 16 })
                .add(new clayflow.PointSpriteMaterial({ color: [1, 1, 0.2, 1], radius: 0.025 }))
                .add(ball),
        );
        move = (i) => {
            ball.data.position = ballAt(i);
        };
    }
    await app.whenReady({ timeoutMs: 60_000 });
    // Aquecimento: a sombra, as tabelas e o primeiro histórico assentados; o corte recomeça a acumulação e o histórico
    // do zero no quadro seguinte (a medida não depende de quantos quadros a prontidão levou).
    app.step(1 / 60, 8);
    camera.cut();
    return { app, canvas, look, camera, ...(move !== undefined ? { move } : {}) };
}

/**
 * 400 partículas (SPH) em sprites de raio `radius`: caindo sob a gravidade (`fall`) ou atravessando a cena de lado a
 * 1 m/s, sem gravidade, acima do chão (`cross`: o movimento delas sem tocar em superfície nenhuma).
 */
function insertSprites(app: Application, radius: number, motion: 'fall' | 'cross'): void {
    const position: number[] = [];
    const velocity: number[] = [];
    for (let k = 0; k < 400; k++) {
        if (motion === 'fall')
            position.push(
                -1.2 + 2.4 * ((k * 0.618) % 1),
                1.6 + 0.6 * ((k * 0.381) % 1),
                -0.6 + 1.2 * ((k * 0.271) % 1),
            );
        else
            position.push(
                -1.8 + 1.2 * ((k * 0.618) % 1),
                0.5 + 0.6 * ((k * 0.381) % 1),
                -0.6 + 1.2 * ((k * 0.271) % 1),
            );
        velocity.push(motion === 'fall' ? 0 : 1, 0, 0);
    }
    // Sem campo, o SPH cai com −9,81: atravessando, a gravidade é zero.
    app.world.insert(
        new clayflow.GravityField({ acceleration: [0, motion === 'fall' ? -9.81 : 0, 0, 0] }),
    );
    app.world.insert(
        new clayflow.FluidBody({ algorithm: 'SPH', position, velocity }).add(
            new clayflow.PointSpriteMaterial({ color: [1, 1, 0.2, 1], radius }),
        ),
    );
}

/** Esfera de raio 0,12 m em volta de `center`, pelos vértices. */
const BALL_SURFACE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return data.center + 0.12 * vec3f(cos(u) * sin(v), cos(v), sin(u) * sin(v));
}`;

/** Esfera lisa (realce fino) e esfera de vidro no centro. */
function insertProps(app: Application): void {
    app.world.insert(
        new SphereGeometry({ radius: 0.3, latSegments: 64, lonSegments: 128 })
            .add(new StandardMaterial({ albedo: [0.9, 0.3, 0.1, 1], roughness: 0.08, metallic: 0 }))
            .add(new Transform({ position: [0.9, 0.3, -0.3, 1] })),
    );
    app.world.insert(
        new SphereGeometry({ radius: 0.35, latSegments: 96, lonSegments: 192 })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, 0.4, 0, 1] }))
            .add(
                closureFn(
                    'return closure_add(closure_dielectric(1.5, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0));',
                    ['specular', 'transmission'],
                ),
            ),
    );
}

function close(s: Scene): void {
    s.app.dispose();
    s.canvas.remove();
}

/** Luminância por pixel (0–1) da imagem apresentada. */
function lum(px: CanvasPixels): Float32Array {
    const out = new Float32Array(px.width * px.height);
    const bgra = px.format === 'bgra8unorm';
    for (let i = 0; i < out.length; i++) {
        out[i] = lumaSrgb8(px.data, i * 4, bgra);
    }
    return out;
}

/** Avança `frames` quadros e lê o último (na mesma tarefa do quadro). */
async function frameAfter(
    s: Scene,
    frames: number,
    each?: (i: number) => void,
): Promise<Float32Array> {
    let last: Float32Array | undefined;
    for (let i = 0; i < frames; i++) {
        each?.(i);
        s.app.step(1 / 60);
        if (i === frames - 1) last = lum(await s.app.core.readCanvas());
        else if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    return last!;
}

/** Diagnóstico: grava a luminância como PNG em cinza (fixture `zz-*`, fora do commit). */
async function dump(name: string, img: Float32Array): Promise<void> {
    const data = new ImageData(W, H);
    for (let k = 0; k < img.length; k++) {
        const v = Math.round(Math.min(1, img[k]!) * 255);
        data.data.set([v, v, v, 255], k * 4);
    }
    const c = new OffscreenCanvas(W, H);
    c.getContext('2d')!.putImageData(data, 0, 0);
    await writeFixture(
        name,
        new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()),
    );
}

/** Gradiente por pixel (diferenças centrais). */
function gradient(img: Float32Array): Float32Array {
    const g = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
            const k = y * W + x;
            g[k] = Math.hypot(img[k + 1]! - img[k - 1]!, img[k + W]! - img[k - W]!);
        }
    return g;
}

const mean = (v: Float32Array): number => v.reduce((a, b) => a + b, 0) / v.length;

/** Erros médio e nas bordas (5 % de maior gradiente da referência), relativos ao brilho médio. */
function errors(img: Float32Array, ref: Float32Array): { all: number; edges: number } {
    const g = gradient(ref);
    const sorted = [...g].sort((a, b) => b - a);
    const cut = sorted[Math.floor(sorted.length * 0.05)]!;
    let all = 0;
    let edges = 0;
    let n = 0;
    for (let k = 0; k < img.length; k++) {
        const d = Math.abs(img[k]! - ref[k]!);
        all += d;
        if (g[k]! >= cut) {
            edges += d;
            n++;
        }
    }
    const m = mean(ref);
    return { all: all / img.length / m, edges: edges / Math.max(1, n) / m };
}

async function still(): Promise<void> {
    const ref = await scene('accumulate');
    const reference = await frameAfter(ref, REF_SAMPLES);
    close(ref);
    const tmp = await scene('temporal');
    const temporal = await frameAfter(tmp, 16);
    const converged = await frameAfter(tmp, 48);
    close(tmp);
    const off = await scene('off');
    const aliased = await frameAfter(off, 1);
    close(off);
    if (new URLSearchParams(location.search).get('dump') === '1') {
        for (const [name, img] of [
            ['reference', reference],
            ['temporal', temporal],
            ['off', aliased],
        ] as const)
            await dump(`zz-aa-${name}.png`, img);
        await dump(
            'zz-aa-diff.png',
            temporal.map((v, k) => Math.min(1, Math.abs(v - reference[k]!) * 10)),
        );
    }
    const e = errors(temporal, reference);
    const c = errors(converged, reference);
    const a = errors(aliased, reference);
    log(
        `still: contra ${REF_SAMPLES} amostras — temporal após 16 quadros: erro médio ${pct(e.all)}, bordas ${pct(e.edges)}; após 64: ${pct(c.all)}, ${pct(c.edges)} (sem antisserrilhado: ${pct(a.all)}, ${pct(a.edges)})`,
    );
    check(e.all <= 0.01, `still: erro médio ${pct(e.all)} após 16 quadros (≤ 1 %)`);
    check(c.edges <= 0.03, `still: erro nas bordas ${pct(c.edges)} após 64 quadros (≤ 3 %)`);
}

/** Rastro da bola (`label`) que atravessa a cena na forma pedida. */
async function trailOf(
    label: string,
    options: { ball: 'transform' | 'surface' | 'sprites' | 'points'; bare?: boolean },
): Promise<void> {
    const bare = options.bare === true ? { bare: true } : {};
    // A pegada da bola a cada quadro (sem antisserrilhado): onde o quadro com a bola difere do sem a bola.
    const plain = await scene('off', bare);
    const empty = await frameAfter(plain, 1);
    close(plain);
    // Onde o fundo é liso (vizinhança 3 × 3 sem aresta): lá o excesso é só o que a bola deixou — numa aresta, o pixel
    // recomeçado depois que a bola passa tem outra média das amostras que o fundo (ruído, não rastro).
    const flat = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
            let lo = Infinity;
            let hi = -Infinity;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const v = empty[(y + dy) * W + x + dx]!;
                    lo = Math.min(lo, v);
                    hi = Math.max(hi, v);
                }
            flat[y * W + x] = hi - lo < 0.02 ? 1 : 0;
        }
    const off = await scene('off', options);
    const masks: Uint8Array[] = [];
    const near: Uint8Array[] = [];
    for (let i = 0; i < 120; i++) {
        off.move?.(i);
        off.app.step(1 / 60);
        const img = lum(await off.app.core.readCanvas());
        const m = new Uint8Array(W * H);
        for (let k = 0; k < m.length; k++) m[k] = Math.abs(img[k]! - empty[k]!) > 0.05 ? 1 : 0;
        masks.push(m);
        // A pegada alargada em 2 px: com o antisserrilhado, o pixel vizinho da borda cobre parte da bola agora.
        const g = new Uint8Array(W * H);
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                if (m[y * W + x] !== 1) continue;
                for (let dy = -2; dy <= 2; dy++)
                    for (let dx = -2; dx <= 2; dx++) {
                        const xx = x + dx;
                        const yy = y + dy;
                        if (xx >= 0 && xx < W && yy >= 0 && yy < H) g[yy * W + xx] = 1;
                    }
            }
        near.push(g);
    }
    close(off);
    // O modo temporal com e sem a bola em passo (a mesma sequência de posições da amostra desde o corte): a diferença
    // entre os dois é só a bola.
    const tmp = await scene('temporal', options);
    const bg = await scene('temporal', bare);
    // O fundo sem o filtro do sinal traçado, para a faixa do detalhe menor que o pixel: o filtro suaviza os primeiros
    // quadros do que o vidro mostra, e a faixa medida nele não veria o detalhe (fora do traçado, a mesma imagem).
    const raw = await scene('temporal', { ...bare, rawTraced: true });
    let worst = 0;
    let lowest = 0;
    let lowAt = '';
    // O desvio coerente: a média da diferença nos pixels contados de cada quadro (o maior para cada lado).
    let bias = 0;
    let biasAt = '';
    let darkBias = 0;
    let darkBiasAt = '';
    let counted = 0;
    let at = '';
    // Faixa do fundo temporal nos 8 primeiros quadros desde o corte (cada um com outra posição da amostra): detalhe
    // menor que o pixel (o xadrez ao longe, também o visto pelo vidro) varia entre as posições, e o pixel recomeçado
    // depois que a bola passa reconverge com esse ruído (simétrico, não rastro) — decisão do usuário, 2026-10-21: fora
    // da medida, como as arestas. Medida sem o filtro do sinal traçado (`raw`).
    const lo = new Float32Array(W * H).fill(Infinity);
    const hi = new Float32Array(W * H).fill(-Infinity);
    for (let i = 0; i < 120; i++) {
        tmp.move?.(i);
        tmp.app.step(1 / 60);
        const img = lum(await tmp.app.core.readCanvas());
        bg.app.step(1 / 60);
        const background = lum(await bg.app.core.readCanvas());
        if (i < 8) {
            raw.app.step(1 / 60);
            const unfiltered = lum(await raw.app.core.readCanvas());
            for (let k = 0; k < unfiltered.length; k++) {
                lo[k] = Math.min(lo[k]!, unfiltered[k]!);
                hi[k] = Math.max(hi[k]!, unfiltered[k]!);
            }
            if (i === 7) close(raw);
        }
        if (
            i === Number(new URLSearchParams(location.search).get('dumpi') ?? 119)
            && new URLSearchParams(location.search).get('dump') === '1'
        ) {
            await dump(`zz-aa-${label}-tmp.png`, img);
            await dump(`zz-aa-${label}-bg.png`, background);
            await dump(
                `zz-aa-${label}-diff.png`,
                img.map((v, j) => Math.min(1, Math.max(0, v - background[j]!) * 10)),
            );
            await dump(
                `zz-aa-${label}-dark.png`,
                img.map((v, j) => Math.min(1, Math.max(0, background[j]! - v) * 10)),
            );
        }
        if (i < 8) continue;
        let sum = 0;
        let n = 0;
        // Pixels cobertos pela bola há 4 a 8 quadros e livres desde então.
        for (let k = 0; k < img.length; k++) {
            if (
                new URLSearchParams(location.search).get('noglass') === '1'
                && Math.hypot((k % W) - 240, Math.floor(k / W) - 135) < 48
            )
                continue;
            if (flat[k] !== 1 || hi[k]! - lo[k]! >= 0.02) continue;
            let past = false;
            for (let d = 4; d <= 8; d++) if (masks[i - d]![k] === 1) past = true;
            if (!past) continue;
            let recent = false;
            for (let d = 0; d < 4; d++) if (near[i - d]![k] === 1) recent = true;
            if (recent) continue;
            if (img[k]! - background[k]! > worst)
                at = `quadro ${i}, pixel (${k % W}, ${Math.floor(k / W)})`;
            worst = Math.max(worst, img[k]! - background[k]!);
            if (img[k]! - background[k]! < lowest)
                lowAt = `quadro ${i}, pixel (${k % W}, ${Math.floor(k / W)})`;
            lowest = Math.min(lowest, img[k]! - background[k]!);
            sum += img[k]! - background[k]!;
            n++;
            counted++;
        }
        if (n === 0) continue;
        if (sum / n > bias) biasAt = `quadro ${i}, ${n} pixels`;
        bias = Math.max(bias, sum / n);
        if (sum / n < darkBias) darkBiasAt = `quadro ${i}, ${n} pixels`;
        darkBias = Math.min(darkBias, sum / n);
    }
    close(tmp);
    close(bg);
    log(
        `${label}: ${counted} pixels por onde a bola passou há ≥ 4 quadros — desvio coerente ${pct(bias)} do brilho da bola para mais (${biasAt}), ${pct(-darkBias)} para menos (${darkBiasAt}); pior pixel isolado ${pct(worst)} (${at}), ${pct(-lowest)} (${lowAt})`,
    );
    check(counted > 0, `${label}: a bola não foi vista`);
    check(
        bias <= 0.01,
        `${label}: rastro de ${pct(bias)} do brilho da bola após 4 quadros (≤ 1 %)`,
    );
    // O rastro escuro (a sombra da bola guardada no chão parado) — decisão do usuário, 2026-10-21: os dois sentidos.
    check(
        -darkBias <= 0.01,
        `${label}: rastro escuro de ${pct(-darkBias)} do brilho da bola após 4 quadros (≤ 1 %)`,
    );
}

const trail = (): Promise<void> => trailOf('trail', { ball: 'transform' });
/** A bola como superfície deslocada pelos vértices (o `Transform` parado), sem nada que a reflita ou refrate. */
const deform = (): Promise<void> => trailOf('deform', { ball: 'surface', bare: true });
/** Partículas em sprites caindo (spec 034, T031): o movimento de cada uma pela velocidade dela. */
const spriteTrail = (): Promise<void> => trailOf('spriteTrail', { ball: 'sprites', bare: true });
/** Sprites nos vértices de uma geometria (forward) no lugar da bola: o movimento pela matriz anterior. */
const pointTrail = (): Promise<void> => trailOf('pointTrail', { ball: 'points', bare: true });

/** Pose da órbita (30°/s em volta do alvo, raio 3 m) no tempo `t` (s). */
const orbitAt = (t: number): [number, number, number] => {
    const a = (30 * Math.PI * t) / 180;
    return [3 * Math.sin(a), 1, 3 * Math.cos(a)];
};

async function orbit(): Promise<void> {
    const poses = [1, 2, 3];
    const tmp = await scene('temporal');
    const moving: Float32Array[] = [];
    let i = 0;
    for (const at of poses) {
        while (i < at * 60) {
            tmp.look(orbitAt(i / 60));
            tmp.app.step(1 / 60);
            i++;
            if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
        }
        tmp.look(orbitAt(i / 60));
        tmp.app.step(1 / 60);
        i++;
        moving.push(lum(await tmp.app.core.readCanvas()));
    }
    close(tmp);
    for (let k = 0; k < poses.length; k++) {
        const ref = await scene('accumulate');
        ref.look(orbitAt(poses[k]!));
        const reference = await frameAfter(ref, REF_SAMPLES);
        close(ref);
        const off = await scene('off');
        off.look(orbitAt(poses[k]!));
        const aliased = await frameAfter(off, 2);
        close(off);
        const ea = errors(aliased, reference);
        log(
            `orbit: pose ${k + 1} sem antisserrilhado — erro médio ${pct(ea.all)}, bordas ${pct(ea.edges)}`,
        );
        if (
            new URLSearchParams(location.search).get('dump') === '1'
            && k === Number(new URLSearchParams(location.search).get('dumpk') ?? 0)
        ) {
            await dump('zz-aa-orbit-ref.png', reference);
            await dump('zz-aa-orbit-tmp.png', moving[k]!);
            await dump('zz-aa-orbit-off.png', aliased);
            await dump(
                'zz-aa-orbit-diff.png',
                moving[k]!.map((v, j) => Math.min(1, Math.abs(v - reference[j]!) * 10)),
            );
        }
        const sharp = mean(gradient(reference)) / Math.max(1e-9, mean(gradient(moving[k]!)));
        const e = errors(moving[k]!, reference);
        log(
            `orbit: pose ${k + 1} (${poses[k]} s a 30°/s) — gradiente da referência / do temporal ${sharp.toFixed(3)}, erro médio ${pct(e.all)}`,
        );
        check(sharp <= 1.5, `orbit: borrão ${sharp.toFixed(2)}× na pose ${k + 1} (≤ 1,5×)`);
        check(e.all <= 0.03, `orbit: erro médio ${pct(e.all)} na pose ${k + 1} (≤ 3 %)`);
    }
}

/** Pose da órbita em volta do tanque (30°/s, raio 1,6 m, 1 m acima do fundo) no tempo `t` (s). */
const waterOrbitAt = (t: number): [number, number, number] => {
    const a = (30 * Math.PI * t) / 180;
    return [1.6 * Math.sin(a), 1, 1.6 * Math.cos(a)];
};
const WATER_TARGET = [0, 0.1, 0] as const;
/** Quadros até a camada de água assentar. */
const WATER_SETTLE = 300;

/** Uma água da órbita: a altura da camada (em partículas) e a absorção (padrão a do material). */
interface Water {
    readonly layer: number;
    readonly absorption?: readonly [number, number, number];
}

/** O tanque com a camada de água parada (física e ondulações congeladas depois de assentar), no modo pedido. */
async function waterTank(mode: AntialiasingMode, water: Water): Promise<Scene> {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        antialias: mode,
        canvasOptions: { capture: true },
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    if (mode === 'accumulate') app.defaults.antialiasing.data.sequence = REF_SAMPLES;
    const view = new Transform();
    const look: Look = (p) => {
        view.data.position = [...p, 1];
        view.data.rotation = Transform.lookRotation(p, WATER_TARGET);
    };
    look(waterOrbitAt(0));
    const camera = new clayflow.Camera({
        fov: Math.PI / 4,
        aspect: W / H,
        aspectMode: 'fixed',
        near: 0.05,
        far: 20,
    });
    camera.add(view);
    // As ondulações do material paradas no tempo (a referência acumula a mesma superfície).
    waterScene(app, {
        width: W,
        height: H,
        layer: water.layer,
        material: {
            ripple: { speed: 0 },
            ...(water.absorption !== undefined ? { absorption: water.absorption } : {}),
        },
        camera,
    });
    await app.whenReady({ timeoutMs: 60_000 });
    for (let i = 0; i < WATER_SETTLE; i++) {
        app.step(1 / 60);
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    app.time.physicsScale = 0;
    return { app, canvas, look, camera };
}

/** As duas águas da órbita: clara e rasa (o fundo atravessado domina a cor) e turva e funda (a superfície domina). */
const WATERS: Record<string, Water> = {
    clara: { layer: 6 },
    turva: { layer: 20, absorption: [12, 10, 9] },
};

async function waterOrbit(): Promise<void> {
    for (const [name, water] of Object.entries(WATERS)) await waterOrbitOf(name, water);
}

async function waterOrbitOf(name: string, water: Water): Promise<void> {
    const poses = [1, 2, 3];
    const tmp = await waterTank('temporal', water);
    tmp.camera.cut();
    const moving: Float32Array[] = [];
    let i = 0;
    for (const at of poses) {
        while (i < at * 60) {
            tmp.look(waterOrbitAt(i / 60));
            tmp.app.step(1 / 60);
            i++;
            if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
        }
        tmp.look(waterOrbitAt(i / 60));
        tmp.app.step(1 / 60);
        i++;
        moving.push(lum(await tmp.app.core.readCanvas()));
    }
    close(tmp);
    const q = new URLSearchParams(location.search);
    for (let k = 0; k < poses.length; k++) {
        const ref = await waterTank('accumulate', water);
        ref.look(waterOrbitAt(poses[k]!));
        ref.camera.cut();
        const reference = await frameAfter(ref, REF_SAMPLES);
        close(ref);
        if (q.get('dump') === '1' && k === Number(q.get('dumpk') ?? 0)) {
            await dump(`zz-aa-water-${name}-ref.png`, reference);
            await dump(`zz-aa-water-${name}-tmp.png`, moving[k]!);
            await dump(
                `zz-aa-water-${name}-diff.png`,
                moving[k]!.map((v, j) => Math.min(1, Math.abs(v - reference[j]!) * 10)),
            );
        }
        const sharp = mean(gradient(reference)) / Math.max(1e-9, mean(gradient(moving[k]!)));
        const e = errors(moving[k]!, reference);
        log(
            `waterOrbit: água ${name}, pose ${k + 1} (${poses[k]} s a 30°/s) — gradiente da referência / do temporal ${sharp.toFixed(3)}, erro médio ${pct(e.all)}, bordas ${pct(e.edges)}`,
        );
        check(
            sharp <= 1.5,
            `waterOrbit: água ${name}, borrão ${sharp.toFixed(2)}× na pose ${k + 1} (≤ 1,5×)`,
        );
        check(
            e.all <= 0.03,
            `waterOrbit: água ${name}, erro médio ${pct(e.all)} na pose ${k + 1} (≤ 3 %)`,
        );
    }
}

/** Cobertura (pixels claros) das partículas em sprites caindo, no modo pedido. */
async function spriteCoverage(mode: AntialiasingMode): Promise<number> {
    const s = await scene(mode);
    insertSprites(s.app, 0.015, 'fall');
    await s.app.whenReady();
    const img = await frameAfter(s, 20);
    close(s);
    let n = 0;
    for (const v of img) if (v > 0.85) n++;
    return n;
}

async function sprites(): Promise<void> {
    const off = await spriteCoverage('off');
    const temporal = await spriteCoverage('temporal');
    const ratio = temporal / Math.max(1, off);
    log(
        `sprites: cobertura em movimento — temporal ${temporal} px, sem antisserrilhado ${off} px (${pct(ratio)})`,
    );
    check(off > 0, 'sprites: as partículas não aparecem');
    check(
        ratio >= 0.9,
        `sprites: o temporal apagou as partículas (${pct(ratio)} da cobertura; ≥ 90 %)`,
    );
}

/**
 * Tempos de GPU (mediana dos últimos 120 quadros em órbita, 1280 × 720) no modo pedido: a duração do quadro (do primeiro
 * início ao último fim) e cada passe.
 */
async function gpuTimes(
    mode: AntialiasingMode,
): Promise<{ span: number; passes: Record<string, number> }> {
    const s = await scene(mode, { size: [1280, 720], profiling: true });
    // O custo do antisserrilhado sem o da refração traçada (o orçamento dela é outro).
    s.app.defaults.refraction.enabled = false;
    const timings: GpuFrameTimedPayload[] = [];
    const off = s.app.events.on('gpuFrameTimed', (e) => timings.push(e));
    for (let i = 0; i < 180; i++) {
        s.look(orbitAt(i / 60));
        s.app.step(1 / 60);
        await new Promise((r) => setTimeout(r, 4));
    }
    // As últimas leituras chegam depois do último quadro; os quadros vazios daqui não entram na medida.
    for (let i = 0; i < 20; i++) {
        s.app.step(0);
        await new Promise((r) => setTimeout(r, 16));
    }
    off();
    close(s);
    const last = Math.max(...timings.map((t) => t.gpuFrame)) - 20;
    const steady = timings.filter((t) => t.gpuFrame <= last).slice(-120);
    const passes: Record<string, number> = {};
    for (const key of new Set(steady.flatMap((t) => Object.keys(t.passesMs))))
        passes[key] = median(steady.map((t) => t.passesMs[key] ?? 0));
    return { span: median(steady.map((t) => t.spanMs)), passes };
}

function median(v: readonly number[]): number {
    const s = [...v].sort((a, b) => a - b);
    return s[s.length >> 1] ?? 0;
}

/**
 * SC-011: custo do antisserrilhado a 1280 × 720 — a duração do quadro com o temporal menos a sem antisserrilhado (os
 * passes do M4 se sobrepõem: o intervalo de cada um conta também o fim do anterior, e a soma passaria do quadro).
 */
async function cost(): Promise<void> {
    const temporal = await gpuTimes('temporal');
    const plain = await gpuTimes('off');
    for (const [key, ms] of Object.entries(temporal.passes)) {
        const without = plain.passes[key];
        log(
            `cost: ${key} ${ms.toFixed(3)} ms ${without === undefined ? '(só no temporal)' : `(sem: ${without.toFixed(3)} ms)`}`,
        );
    }
    const own = temporal.span - plain.span;
    log(
        `cost: quadro ${temporal.span.toFixed(3)} ms com o temporal, ${plain.span.toFixed(3)} ms sem — antisserrilhado ${own.toFixed(3)} ms`,
    );
    check(own <= 1.5, `cost: antisserrilhado ${own.toFixed(3)} ms (≤ 1,5 ms)`);
}

/** Tamanho da imagem da borda da sombra. */
const EDGE_SIZE = [960, 540] as const;
const EDGE_EYE = [0, 2, 0.8] as const;
/** A placa que projeta a sombra: meio tamanho em x e z, altura, giro em torno de y e a luz (a sombra cai na origem). */
const PLATE = { half: [0.25, 0.35], height: 0.5, turn: (20 * Math.PI) / 180 } as const;
const EDGE_LIGHT = [-1.2, -1, 0] as const;

/** Ponto do mundo em pixels da imagem da borda (câmera em `EDGE_EYE` olhando a origem, campo vertical 0,8 rad). */
function edgePixel(p: readonly [number, number, number]): [number, number] {
    const [w, h] = EDGE_SIZE;
    const f = [-EDGE_EYE[0], -EDGE_EYE[1], -EDGE_EYE[2]];
    const fl = Math.hypot(f[0]!, f[1]!, f[2]!);
    const fw = f.map((v) => v / fl);
    // Direita = frente × y, cima = direita × frente.
    let r = [-fw[2]!, 0, fw[0]!];
    const rl = Math.hypot(r[0]!, r[2]!);
    r = r.map((v) => v / rl);
    const u = [
        r[1]! * fw[2]! - r[2]! * fw[1]!,
        r[2]! * fw[0]! - r[0]! * fw[2]!,
        r[0]! * fw[1]! - r[1]! * fw[0]!,
    ];
    const d = [p[0] - EDGE_EYE[0], p[1] - EDGE_EYE[1], p[2] - EDGE_EYE[2]];
    const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    const z = dot(d, fw);
    const focal = h / 2 / Math.tan(0.4);
    return [w / 2 + (focal * dot(d, r)) / z, h / 2 - (focal * dot(d, u)) / z];
}

/**
 * O degrau da borda da sombra: ao longo das quatro bordas da sombra da placa (retas no chão), no meio de cada uma
 * (60 %), por linha de varredura transversal, onde a imagem cruza o meio entre o iluminado e a sombra; a reta ajustada
 * a esses pontos e o resíduo (RMS das quatro e o máximo, em pixels) — o que a grade do mapa de sombra deixa na borda.
 */
function edgeStairs(img: Float32Array): { rms: number; max: number; lines: number } {
    const [w, h] = EDGE_SIZE;
    const { half, turn } = PLATE;
    // Cantos da placa girados; a placa está deslocada contra a luz e a sombra dela cai na origem.
    const at = (x: number, z: number): [number, number] =>
        edgePixel([
            x * Math.cos(turn) + z * Math.sin(turn),
            0,
            -x * Math.sin(turn) + z * Math.cos(turn),
        ]);
    const [hx, hz] = half;
    const corners = [at(-hx, -hz), at(hx, -hz), at(hx, hz), at(-hx, hz)];
    const center = at(0, 0);
    const value = (x: number, y: number): number =>
        img[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
    let sum = 0;
    let max = 0;
    let lines = 0;
    for (let e = 0; e < 4; e++) {
        const p = corners[e]!;
        const q = corners[(e + 1) % 4]!;
        // Varre na direção em que a borda menos anda (colunas para uma borda deitada, linhas para uma em pé).
        const lying = Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]);
        const [u0, u1] = lying ? [p[0], q[0]] : [p[1], q[1]];
        const [v0, v1] = lying ? [p[1], q[1]] : [p[0], q[0]];
        const inward = Math.sign((lying ? center[1] : center[0]) - (v0 + v1) / 2);
        const us: number[] = [];
        const vs: number[] = [];
        const lo = Math.min(u0, u1) + 0.2 * Math.abs(u1 - u0);
        const hi = Math.max(u0, u1) - 0.2 * Math.abs(u1 - u0);
        for (let u = Math.ceil(lo); u <= Math.floor(hi); u++) {
            const vLine = Math.round(v0 + ((v1 - v0) * (u - u0)) / (u1 - u0));
            const sample = (v: number): number => (lying ? value(u, v) : value(v, u));
            const mid = (sample(vLine - 40 * inward) + sample(vLine + 40 * inward)) / 2;
            for (let v = vLine - 30; v < vLine + 30; v++) {
                const a = sample(v);
                const b = sample(v + 1);
                if ((a - mid) * (b - mid) <= 0 && a !== b) {
                    us.push(u);
                    vs.push(v + (a - mid) / (a - b));
                    break;
                }
            }
        }
        const n = us.length;
        const mu = us.reduce((s, v) => s + v, 0) / n;
        const mv = vs.reduce((s, v) => s + v, 0) / n;
        let suv = 0;
        let suu = 0;
        for (let k = 0; k < n; k++) {
            suv += (us[k]! - mu) * (vs[k]! - mv);
            suu += (us[k]! - mu) ** 2;
        }
        const slope = suv / suu;
        for (let k = 0; k < n; k++) {
            const r = Math.abs(vs[k]! - (mv + slope * (us[k]! - mu)));
            sum += r * r;
            max = Math.max(max, r);
        }
        lines += n;
    }
    return { rms: Math.sqrt(sum / lines), max, lines };
}

/**
 * A placa sobre o chão liso, a sombra dela na origem, no modo pedido; lê as imagens dos dois últimos de `frames`
 * quadros.
 */
async function edgeFrames(
    mode: AntialiasingMode,
    frames: number,
): Promise<{ last: Float32Array; previous: Float32Array }> {
    const [width, height] = EDGE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        antialias: mode,
        canvasOptions: { capture: true },
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    if (mode === 'accumulate') app.defaults.antialiasing.data.sequence = REF_SAMPLES;
    const camera = new clayflow.Camera({
        fov: 0.8,
        aspect: width / height,
        aspectMode: 'fixed',
        near: 0.05,
        far: 50,
    });
    app.world.insert(
        camera.add(
            new Transform({
                position: [...EDGE_EYE, 1],
                rotation: Transform.lookRotation(EDGE_EYE, [0, 0, 0]),
            }),
        ),
    );
    app.world.insert(
        new clayflow.DirectionalLight({
            direction: [...EDGE_LIGHT, 0],
            intensity: 3,
            castShadow: true,
        }),
    );
    app.world.insert(
        new clayflow.PlaneGeometry({ size: [8, 8] })
            .add(new StandardMaterial({ albedo: [0.7, 0.7, 0.7, 1], roughness: 0.9 }))
            .add(new Transform()),
    );
    const shift = PLATE.height / -EDGE_LIGHT[1];
    app.world.insert(
        new BoxGeometry({ size: [2 * PLATE.half[0], 0.02, 2 * PLATE.half[1]] })
            .add(new StandardMaterial({ albedo: [0.3, 0.3, 0.3, 1], roughness: 0.9 }))
            .add(
                new Transform({
                    position: [-EDGE_LIGHT[0] * shift, PLATE.height, 0, 1],
                    rotation: [0, Math.sin(PLATE.turn / 2), 0, Math.cos(PLATE.turn / 2)],
                }),
            ),
    );
    await app.whenReady({ timeoutMs: 60_000 });
    app.step(1 / 60, 8);
    camera.cut();
    let last: Float32Array | undefined;
    let previous: Float32Array | undefined;
    for (let i = 0; i < frames; i++) {
        app.step(1 / 60);
        if (i === frames - 2) previous = lum(await app.core.readCanvas());
        else if (i === frames - 1) last = lum(await app.core.readCanvas());
        else if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    app.dispose();
    canvas.remove();
    return { last: last!, previous: previous ?? last! };
}

/**
 * Cintilação da borda parada: a maior mudança de um quadro para o seguinte nos pixels da penumbra (entre 10 % e 90 % do
 * caminho do iluminado à sombra), relativa a esse contraste.
 */
function edgeFlicker(last: Float32Array, previous: Float32Array): number {
    const [w] = EDGE_SIZE;
    const read = (p: [number, number]): number => last[Math.round(p[1]) * w + Math.round(p[0])]!;
    const dark = read(edgePixel([0, 0, 0]));
    const lit = read(edgePixel([0, 0, -0.7]));
    let max = 0;
    for (let k = 0; k < last.length; k++) {
        const t = (last[k]! - dark) / (lit - dark);
        if (t > 0.1 && t < 0.9)
            max = Math.max(max, Math.abs(last[k]! - previous[k]!) / Math.abs(lit - dark));
    }
    return max;
}

async function shadowEdge(): Promise<void> {
    const rms = new Map<string, number>();
    let flicker = 0;
    for (const [label, mode, frames] of [
        ['sem antisserrilhado', 'off', 1],
        ['temporal após 64 quadros', 'temporal', 64],
        ['acumulação de 256', 'accumulate', REF_SAMPLES],
    ] as const) {
        const { last: img, previous } = await edgeFrames(mode, frames);
        const s = edgeStairs(img);
        rms.set(mode, s.rms);
        if (mode === 'temporal') flicker = edgeFlicker(img, previous);
        log(
            `shadowEdge: ${label} — degrau da borda ${s.rms.toFixed(3)} px RMS, máximo ${s.max.toFixed(3)} px (${s.lines} linhas de varredura)${frames > 1 ? `; cintilação ${pct(edgeFlicker(img, previous))} do contraste` : ''}`,
        );
        if (new URLSearchParams(location.search).get('dump') === '1') {
            const data = new ImageData(EDGE_SIZE[0], EDGE_SIZE[1]);
            for (let k = 0; k < img.length; k++) {
                const v = Math.round(Math.min(1, img[k]!) * 255);
                data.data.set([v, v, v, 255], k * 4);
            }
            const c = new OffscreenCanvas(EDGE_SIZE[0], EDGE_SIZE[1]);
            c.getContext('2d')!.putImageData(data, 0, 0);
            await writeFixture(
                `zz-aa-edge-${mode}.png`,
                new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()),
            );
        }
    }
    const temporal = rms.get('temporal')!;
    const accumulated = rms.get('accumulate')!;
    check(
        temporal <= accumulated + 0.1,
        `shadowEdge: degrau do temporal ${temporal.toFixed(3)} px > acumulação ${accumulated.toFixed(3)} + 0,1 px`,
    );
    check(flicker <= 0.04, `shadowEdge: cintilação do temporal ${pct(flicker)} > 4 %`);
}

type Mat4 = number[];

/** Produto de matrizes 4 × 4 por colunas. */
function mat4Mul(a: Mat4, b: Mat4): Mat4 {
    const out = new Array<number>(16).fill(0);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
    return out;
}

/** Vista do olho `eye` mirando `target` com o "para cima" Y (a câmera olha para −Z local). */
function lookAtView(eye: readonly number[], target: readonly number[]): Mat4 {
    const z = [eye[0]! - target[0]!, eye[1]! - target[1]!, eye[2]! - target[2]!];
    const zl = Math.hypot(z[0]!, z[1]!, z[2]!);
    const zn = z.map((v) => v / zl);
    const x = [zn[2]!, 0, -zn[0]!];
    const xl = Math.hypot(x[0]!, x[1]!, x[2]!);
    const xn = x.map((v) => v / xl);
    const y = [
        zn[1]! * xn[2]! - zn[2]! * xn[1]!,
        zn[2]! * xn[0]! - zn[0]! * xn[2]!,
        zn[0]! * xn[1]! - zn[1]! * xn[0]!,
    ];
    const dot = (a: readonly number[]): number =>
        a[0]! * eye[0]! + a[1]! * eye[1]! + a[2]! * eye[2]!;
    return [
        xn[0]!,
        y[0]!,
        zn[0]!,
        0,
        xn[1]!,
        y[1]!,
        zn[1]!,
        0,
        xn[2]!,
        y[2]!,
        zn[2]!,
        0,
        -dot(xn),
        -dot(y),
        -dot(zn),
        1,
    ];
}

/** Perspectiva da WebGPU (z de clip em [0, 1]). */
function perspectiveOf(fov: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far * nf, -1, 0, 0, far * near * nf, 0];
}

/** Halton de base 2 e 3, índices 1 a 8. */
const HALTON_2 = [1 / 2, 1 / 4, 3 / 4, 1 / 8, 5 / 8, 3 / 8, 7 / 8, 1 / 16];
const HALTON_3 = [1 / 3, 2 / 3, 1 / 9, 4 / 9, 7 / 9, 2 / 9, 5 / 9, 8 / 9];

/** O deslocamento da posição `i` (0–7) da sequência: NDC xy (y para cima) e pixels zw. */
function jitterAt(i: number): number[] {
    const px = HALTON_2[i]! - 0.5;
    const py = HALTON_3[i]! - 0.5;
    return [(2 * px) / W, (-2 * py) / H, px, py];
}

/** A translação em clip proporcional a w (o deslocamento da amostra aplicado depois da projeção). */
function shiftOf(j: readonly number[]): Mat4 {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, j[0]!, j[1]!, 0, 1];
}

/** O registro `CameraMatrices` da câmera, lido do pool na GPU. */
async function readMatrices(
    app: Application,
    camera: clayflow.Camera,
): Promise<Record<string, number[]>> {
    const schema = clayflow.Camera.matricesSchema;
    const pool = app.resources.poolBufferSpec(schema.name);
    const id = app.world.entityIdOfResource(camera);
    const slot = id === undefined ? undefined : app.resources.poolSlotOf(schema.name, id);
    if (pool === undefined || slot === undefined)
        throw new Error('matrices: pool CameraMatrices sem a câmera');
    const staging = app.core.create<clayflow.StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `aa_matrices_staging_${pool.byteSize}_${app.time.frame}`,
        byteSize: pool.byteSize,
    });
    app.core.record('aa-matrices-readback', (frame) => {
        frame.copy(pool, staging, pool.byteSize);
    });
    app.core.submit();
    const all = new Float32Array(await app.core.readback(staging));
    app.core.destroy(staging);
    const base = (slot * schema.stride) / 4;
    const field = (name: string, n: number): number[] =>
        Array.from(
            all.subarray(base + schema.offsetOf(name) / 4, base + schema.offsetOf(name) / 4 + n),
        );
    return {
        view: field('view', 16),
        projection: field('projection', 16),
        viewProjection: field('viewProjection', 16),
        unjittered: field('unjitteredViewProjection', 16),
        previous: field('previousViewProjection', 16),
        jitter: field('jitter', 4),
        history: field('history', 4),
        inverseView: field('inverseView', 16),
        inverseUnjittered: field('inverseUnjitteredViewProjection', 16),
        previousView: field('previousView', 16),
    };
}

/** Maior diferença relativa à maior componente esperada (as inversas, spec 037: tolerância projetiva de R3). */
function maxRelative(a: readonly number[], b: readonly number[]): number {
    return maxDiff(a, b) / Math.max(...b.map(Math.abs));
}

/** Maior diferença absoluta entre dois vetores. */
function maxDiff(a: readonly number[], b: readonly number[]): number {
    return a.reduce((m, v, k) => Math.max(m, Math.abs(v - b[k]!)), 0);
}

async function matrices(): Promise<void> {
    const s = await scene('temporal');
    const fov = 0.8;
    const projection = perspectiveOf(fov, W / H, 0.05, 50);
    // f32 contra f64: a projeção e a vista têm termos até ~20 (far·near/(near − far) e a translação).
    const TOL = 2e-5;
    const verify = (
        label: string,
        m: Record<string, number[]>,
        eye: readonly number[],
        index: number,
        fresh: boolean,
    ): void => {
        const view = lookAtView(eye, TARGET);
        const j = jitterAt(index);
        const shift = shiftOf(j);
        const checks: [string, number[], Mat4, number][] = [
            ['deslocamento', m.jitter!, j, 1e-7],
            ['vista', m.view!, view, TOL],
            ['projeção', m.projection!, mat4Mul(shift, projection), TOL],
            ['vista-projeção', m.viewProjection!, mat4Mul(mat4Mul(shift, projection), view), TOL],
            ['sem deslocamento', m.unjittered!, mat4Mul(projection, view), TOL],
        ];
        for (const [name, got, want, tol] of checks) {
            const d = maxDiff(got, want);
            check(d <= tol, `matrices: ${label}: ${name} difere ${d.toExponential(2)} (≤ ${tol})`);
        }
        // As inversas calculadas uma vez pelo estágio (spec 037): contra as da referência f64.
        const inverses: [string, number[], number[]][] = [
            ['inversa da vista', m.inverseView!, rigidInverse(view)],
            [
                'inversa sem deslocamento',
                m.inverseUnjittered!,
                projectiveInverse(mat4Mul(projection, view)),
            ],
        ];
        for (const [name, got, want] of inverses) {
            const d = maxRelative(got, want);
            check(
                d <= 1e-5,
                `matrices: ${label}: ${name} difere ${d.toExponential(2)} relativo (≤ 1e-5)`,
            );
        }
        check(
            m.history![0] === (fresh ? 1 : 0),
            `matrices: ${label}: histórico ${m.history![0]} (esperado ${fresh ? 1 : 0})`,
        );
    };
    // Quadro do corte: a posição 1 da sequência; a anterior é a atual.
    const eye0 = [0, 1, 3];
    s.app.step(1 / 60);
    const m0 = await readMatrices(s.app, s.camera);
    verify('corte', m0, eye0, 0, true);
    check(maxDiff(m0.previous!, m0.unjittered!) === 0, 'matrices: corte: a anterior não é a atual');
    check(
        maxDiff(m0.previousView!, m0.view!) === 0,
        'matrices: corte: a vista anterior não é a atual',
    );
    // Câmera movida: a posição 2; a anterior é a sem deslocamento do quadro de antes, bit a bit.
    const eye1 = [0.3, 1.1, 2.9];
    s.look(eye1 as [number, number, number]);
    s.app.step(1 / 60);
    const m1 = await readMatrices(s.app, s.camera);
    verify('movida', m1, eye1, 1, false);
    check(
        maxDiff(m1.previous!, m0.unjittered!) === 0,
        'matrices: movida: a anterior não é a do quadro de antes',
    );
    check(
        maxDiff(m1.previousView!, m0.view!) === 0,
        'matrices: movida: a vista anterior não é a do quadro de antes',
    );
    // Novo corte com a câmera em outro lugar: a sequência recomeça e a anterior é a atual.
    const eye2 = [-0.4, 0.9, 3.1];
    s.look(eye2 as [number, number, number]);
    s.camera.cut();
    s.app.step(1 / 60);
    const m2 = await readMatrices(s.app, s.camera);
    verify('novo corte', m2, eye2, 0, true);
    check(
        maxDiff(m2.previous!, m2.unjittered!) === 0,
        'matrices: novo corte: a anterior não é a atual',
    );
    log(
        `matrices: corte, câmera movida e novo corte — maior diferença da vista-projeção ${Math.max(
            maxDiff(
                m0.viewProjection!,
                mat4Mul(mat4Mul(shiftOf(jitterAt(0)), projection), lookAtView(eye0, TARGET)),
            ),
            maxDiff(
                m1.viewProjection!,
                mat4Mul(mat4Mul(shiftOf(jitterAt(1)), projection), lookAtView(eye1, TARGET)),
            ),
        ).toExponential(2)}; deslocamentos ${[m0, m1, m2]
            .map((m) =>
                m
                    .jitter!.slice(2)
                    .map((v) => v.toFixed(4))
                    .join('/'),
            )
            .join(', ')} px`,
    );
    close(s);
}

const CASES: Record<string, () => Promise<void>> = {
    still,
    trail,
    deform,
    orbit,
    sprites,
    spriteTrail,
    pointTrail,
    waterOrbit,
    shadowEdge,
    matrices,
    cost,
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('ANTIALIASING SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

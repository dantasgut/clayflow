// Spec 011 — Smoke da imagem em alta faixa dinâmica (US1, SC-001–SC-003).
//
// Cenas de um plano visto de cima por uma câmera ortográfica, com emissão conhecida por uma função `material` (o albedo
// é preto: a imagem é só a emissão). Casos:
//   - range: duas metades com 20× de diferença — valores > 1 chegam ao alvo HDR e as duas são distinguíveis na tela;
//   - ramp: gradiente lento — passos ≤ 1 nível de código e, com pontilhamento, a média das colunas segue a curva
//     contínua (sem degraus);
//   - exposure: +1 EV dobra a luminância linear (erro ≤ 1 %);
//   - operators: faixas de valores conhecidos por AgX, ACES, neutro e linear contra a referência de CPU (≤ 1 nível);
//   - output: saída HDR pedida — com suporte, canvas rgba16float estendido; sem suporte, `presentationFallback` e a
//     mesma imagem do padrão;
//   - msaa: borda de alto contraste com o resolve mapeado por amostra tem menos energia de alta frequência que o resolve
//     linear (forçado por um efeito identidade); sem MSAA continua desenhando.
// A leitura de volta é só do teste. Para rodar: `npm run smoke -- hdr [--query case=ramp]`. Resultado:
// `HDR SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Camera,
    createScene,
    MaterialFunction,
    PlaneGeometry,
    StandardMaterial,
    Transform,
    Vignette,
} from 'clayflow';
import type { ToneOperator } from 'clayflow';
import { capture, settle } from './support/extensionScenes';
import { banding, edgeEnergy, readHdrTexture, rowLevels, hdrAt } from './support/imageMeasures';
import { present, srgbDecode } from '../elements/material/reference/tonemap';

function log(msg: string): void {
    console.log(`[hdr] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const WIDTH = 512;
const HEIGHT = 256;
const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

/**
 * Emissão por modo: 0 = duas metades (`a` à esquerda, `b` à direita), 1 = rampa linear de `a` a `b` em x, 2 = 8 faixas
 * geométricas `a·2^(b·k)`.
 */
const EMISSION_CODE = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    let u = clamp(s.world_position.x * 0.5 + 0.5, 0.0, 1.0);
    var e = 0.0;
    if (data.mode < 0.5) {
        e = select(data.a, data.b, u > 0.5);
    } else if (data.mode < 1.5) {
        e = mix(data.a, data.b, u);
    } else {
        e = data.a * exp2(data.b * floor(min(u * 8.0, 7.0)));
    }
    return SurfaceParams(vec4f(0.0, 0.0, 0.0, 1.0), m.roughness, m.metallic, vec3f(e));
}`;

interface Emission {
    readonly mode: number;
    readonly a: number;
    readonly b: number;
}

async function createApp(
    antialias = true,
): Promise<{ app: Application; canvas: HTMLCanvasElement }> {
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
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    app.events.on('extensionRejected', (e) =>
        engineErrors.push(`extensionRejected ${e.point}:${e.line}: ${e.message}`),
    );
    return { app, canvas };
}

/** Plano emissivo de 4×2 visto de cima: x ∈ [−1, 1] ocupa a largura da tela. */
function emissivePlane(app: Application, emission: Emission): void {
    app.world.insert(
        new Camera({ projection: 'orthographic', orthoHeight: 1, near: 0.1, far: 10 }).add(
            new Transform({
                position: [0, 5, 0, 1],
                rotation: Transform.lookRotation([0, 5, 0], [0, 0, 0], [0, 0, -1]),
            }),
        ),
    );
    app.world.insert(
        new PlaneGeometry({ size: [4, 2] })
            .add(new StandardMaterial({ albedo: [0, 0, 0, 1] }))
            .add(new Transform())
            .add(
                new MaterialFunction({
                    code: EMISSION_CODE,
                    params: { mode: 'f32', a: 'f32', b: 'f32' },
                    values: { mode: emission.mode, a: emission.a, b: emission.b },
                }),
            ),
    );
}

/**
 * Quadrado de geometria girado, de emissão 50, sobre o fundo escuro: borda de geometria de alto contraste (o MSAA só
 * suaviza bordas de geometria).
 */
function emissiveSquare(app: Application): void {
    emissivePlane(app, { mode: 0, a: 0, b: 0 });
    app.world.insert(
        new PlaneGeometry({ size: [0.6, 0.6] })
            .add(new StandardMaterial({ albedo: [0, 0, 0, 1] }))
            .add(
                new Transform({
                    position: [0, 0.01, 0, 1],
                    rotation: [0, Math.sin(0.25), 0, Math.cos(0.25)],
                }),
            )
            .add(
                new MaterialFunction({
                    code: EMISSION_CODE,
                    params: { mode: 'f32', a: 'f32', b: 'f32' },
                    values: { mode: 0, a: 50, b: 50 },
                }),
            ),
    );
}

/** Deixa as compilações concluírem, desenha um quadro e devolve a imagem da tela. */
async function frame(app: Application, canvas: HTMLCanvasElement): Promise<ImageData> {
    await settle(app);
    app.step(1 / 60);
    return capture(canvas);
}

function dispose(app: Application, canvas: HTMLCanvasElement): void {
    app.dispose();
    canvas.remove();
}

/** Média de um canal (0–255) numa região. */
function mean(img: ImageData, x0: number, y0: number, w: number, h: number, ch = 1): number {
    let sum = 0;
    for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) sum += img.data[(y * img.width + x) * 4 + ch]!;
    return sum / (w * h);
}

async function caseRange(): Promise<void> {
    const { app, canvas } = await createApp();
    emissivePlane(app, { mode: 0, a: 0.5, b: 10 });
    const img = await frame(app, canvas);
    const color = app.resources.textureOf(app.defaults.targets, 'color');
    if (color === undefined) {
        failures.push('range: alvo HDR não alocado');
        dispose(app, canvas);
        return;
    }
    const hdr = await readHdrTexture(app, color);
    dispose(app, canvas);
    const left = hdrAt(hdr, WIDTH / 4, HEIGHT / 2)[1];
    const right = hdrAt(hdr, (3 * WIDTH) / 4, HEIGHT / 2)[1];
    log(`range: alvo HDR ${left.toFixed(3)} | ${right.toFixed(3)} (esperado 0,5 | 10)`);
    check(
        Math.abs(left - 0.5) < 0.01 && Math.abs(right - 10) < 0.05,
        `range: alvo HDR ${left} | ${right}`,
    );
    const l = mean(img, WIDTH / 4 - 16, HEIGHT / 2 - 16, 32, 32);
    const r = mean(img, (3 * WIDTH) / 4 - 16, HEIGHT / 2 - 16, 32, 32);
    log(`range: tela ${l.toFixed(1)} | ${r.toFixed(1)} (20× mapeado, sem corte em 255)`);
    check(r - l > 40, `range: metades indistinguíveis (${l} | ${r})`);
    check(r < 254.5, `range: a metade de 10 cortou no branco (${r})`);
}

async function caseRamp(): Promise<void> {
    const ideal = (x: number): number => {
        const u = Math.min(Math.max((x + 0.5) / WIDTH, 0), 1);
        const v = 0.05 + (0.7 - 0.05) * u;
        return 255 * present([v, v, v], 'neutral', 0)[1];
    };
    for (const dither of [false, true]) {
        const { app, canvas } = await createApp();
        app.defaults.presentation.data.operator = 'neutral';
        app.defaults.presentation.data.dither = dither;
        emissivePlane(app, { mode: 1, a: 0.05, b: 0.7 });
        const img = await frame(app, canvas);
        dispose(app, canvas);
        const row = banding(rowLevels(img, HEIGHT / 2, 8, WIDTH - 8));
        let deviation = 0;
        for (let x = 8; x < WIDTH - 8; x++)
            deviation = Math.max(
                deviation,
                Math.abs(mean(img, x, HEIGHT / 2 - 32, 1, 64) - ideal(x)),
            );
        log(
            `ramp (${dither ? 'com' : 'sem'} pontilhamento): maior passo ${row.maxStep}, platô ${row.longestRun} px, desvio da média das colunas ${deviation.toFixed(2)} nível`,
        );
        if (!dither) check(row.maxStep <= 1, `ramp: passo de ${row.maxStep} níveis entre vizinhos`);
        else
            check(
                deviation <= 0.35,
                `ramp: média das colunas a ${deviation.toFixed(2)} da curva (faixas)`,
            );
    }
}

async function caseExposure(): Promise<void> {
    const linear: number[] = [];
    for (const ev of [0, 1]) {
        const { app, canvas } = await createApp();
        app.defaults.presentation.data.operator = 'linear';
        app.defaults.presentation.data.exposure = ev;
        emissivePlane(app, { mode: 0, a: 0.1, b: 0.1 });
        const img = await frame(app, canvas);
        dispose(app, canvas);
        linear.push(srgbDecode(mean(img, WIDTH / 2 - 64, HEIGHT / 2 - 64, 128, 128) / 255));
    }
    const ratio = linear[1]! / linear[0]!;
    log(`exposure: +1 EV → ×${ratio.toFixed(4)} (esperado ×2)`);
    check(Math.abs(ratio - 2) <= 0.02, `exposure: +1 EV deu ×${ratio}`);
}

async function caseOperators(): Promise<void> {
    for (const operator of [
        'agx',
        'aces',
        'neutral',
        'linear',
    ] as const satisfies readonly ToneOperator[]) {
        const { app, canvas } = await createApp();
        app.defaults.presentation.data.operator = operator;
        app.defaults.presentation.data.dither = false;
        emissivePlane(app, { mode: 2, a: 0.05, b: 1 });
        const img = await frame(app, canvas);
        dispose(app, canvas);
        let worst = 0;
        for (let k = 0; k < 8; k++) {
            const v = 0.05 * Math.pow(2, k);
            const x = Math.round(((k + 0.5) / 8) * WIDTH);
            const expected = present([v, v, v], operator, 0).map((c) => Math.round(255 * c));
            for (let ch = 0; ch < 3; ch++) {
                const got = img.data[(Math.round(HEIGHT / 2) * WIDTH + x) * 4 + ch]!;
                worst = Math.max(worst, Math.abs(got - expected[ch]!));
            }
        }
        log(`operators: ${operator} — maior erro ${worst} nível(is) em 8 faixas de 0,05 a 6,4`);
        check(worst <= 1, `operators: ${operator} com erro de ${worst} níveis`);
    }
}

async function caseOutput(): Promise<void> {
    const sdr = await createApp();
    emissivePlane(sdr.app, { mode: 1, a: 0.05, b: 3 });
    const reference = await frame(sdr.app, sdr.canvas);
    dispose(sdr.app, sdr.canvas);

    const { app, canvas } = await createApp();
    let fallbacks = 0;
    app.events.on('presentationFallback', () => fallbacks++);
    app.defaults.presentation.data.output = 'hdr';
    emissivePlane(app, { mode: 1, a: 0.05, b: 3 });
    const img = await frame(app, canvas);
    const output = app.core.canvasOutput;
    dispose(app, canvas);
    if (output.toneMapping === 'extended') {
        log(`output: saída HDR estendida ativa (${output.format})`);
        check(output.format === 'rgba16float', `output: formato ${output.format} na saída HDR`);
        check(fallbacks === 0, 'output: recuo anunciado com a saída HDR ativa');
    } else {
        let max = 0;
        for (let i = 0; i < img.data.length; i++)
            max = Math.max(max, Math.abs(img.data[i]! - reference.data[i]!));
        log(
            `output: sem suporte a HDR estendido — recuo (${fallbacks} aviso), imagem igual à padrão (máx. ${max})`,
        );
        check(fallbacks === 1, `output: ${fallbacks} avisos presentationFallback (esperado 1)`);
        check(max === 0, `output: o recuo mudou a imagem (diferença ${max})`);
    }
}

async function caseMsaa(): Promise<void> {
    const rect = { x: 0, y: 0, w: WIDTH, h: HEIGHT };
    const energies: number[] = [];
    for (const linearResolve of [false, true]) {
        const { app, canvas } = await createApp();
        // Um efeito identidade obriga a apresentação a ler a cor já resolvida (média linear das amostras).
        if (linearResolve) app.defaults.post.addEffect(new Vignette({ strength: 0 }));
        emissiveSquare(app);
        const img = await frame(app, canvas);
        dispose(app, canvas);
        energies.push(edgeEnergy(img, rect));
    }
    log(
        `msaa: energia de borda ${energies[0]!.toFixed(4)} (mapeado por amostra) × ${energies[1]!.toFixed(4)} (resolve linear)`,
    );
    check(
        energies[0]! < energies[1]!,
        'msaa: o resolve por amostra não suavizou a borda brilhante',
    );

    const { app, canvas } = await createApp(false);
    emissiveSquare(app);
    const img = await frame(app, canvas);
    dispose(app, canvas);
    const center = mean(img, WIDTH / 2 - 4, HEIGHT / 2 - 4, 8, 8);
    log(`msaa: sem MSAA, centro do quadrado ${center.toFixed(0)}`);
    check(center > 200, `msaa: sem MSAA o quadrado não desenhou (${center})`);
}

const CASES: Record<string, () => Promise<void>> = {
    range: caseRange,
    ramp: caseRamp,
    exposure: caseExposure,
    operators: caseOperators,
    output: caseOutput,
    msaa: caseMsaa,
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('HDR SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

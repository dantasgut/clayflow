// Spec 011 — Smoke da iluminação física (US2, SC-004–SC-007).
//
// As medidas leem a radiância linear do alvo HDR (antes da apresentação), com câmeras ortográficas de vista conhecida.
// Casos:
//   - brdf-reference: grade 5×5 rugosidade × metalicidade sob uma direcional, contra a base do OpenPBR avaliada na CPU
//     (erro ≤ 2 %);
//   - furnace: esferas brancas num hemisfério branco uniforme, rugosidade 0→1, dielétricas e metálicas (≤ 3 % de 1);
//   - point-falloff: luz pontual sobre um plano difuso — inverso do quadrado com a janela até o alcance (≤ 2 %);
//   - rect-light: luz de área retangular — o difuso e o lobo especular de um plano sob o painel contra a integral densa;
//   - spot-cones: luz spot — plena dentro do cone interno, zero fora do externo, transição suave;
//   - light-sum: duas direcionais, vermelha e verde, somam na proporção das intensidades;
//   - normal-scale: esfera com escala (1, 3, 1) — normais desenhadas contra as analíticas (≤ 1°);
//   - specular-aa: superfície brilhante de detalhe fino sob câmera girando devagar — variância temporal limitada;
//   - sprites-lit: o sprite de partícula e a esfera de malha equivalente iluminados pelo mesmo modelo (≤ 5 %);
//   - penumbra: a borda reta de uma placa a 0,5 m do chão sob uma direcional a 45° da vertical com disco de raio angular
//     θ (PCSS, spec 034 T061): na média de 64 quadros do antisserrilhado acumulado, a largura de 10 % a 90 % da borda no
//     chão contra a do disco coberto por uma reta (h tan θ / cos² 45° × (s₉₀ − s₁₀)) e o meio dela na projeção da borda;
//     com θ = 0, a borda dura;
//   - sun-travel: esferas sobre o chão sob uma direcional com sombra que gira em volta de y (o sol ao longo do dia) por
//     180 quadros, a 0,36° e a 0,02° por quadro, em volta da origem e longe dela — o último quadro (a luz ainda
//     girando) contra o da mesma cena com a luz parada na direção final: a sombra da luz que gira tem de ser a mesma da
//     luz parada. E com três direcionais com sombra (spec 013, SC-002) girando a velocidades diferentes — uma rápida,
//     uma lenta abaixo do limiar do cache e uma parada —, a câmera andando e um objeto se movendo: o último quadro
//     contra o estado parado;
//   - shadow-sum (spec 013, SC-001): esferas sobre um chão sob três direcionais com sombra, de direções e cores
//     diferentes — a imagem contra a soma das três imagens de uma luz só (a sombra de uma luz não depende das outras);
//     e a luz apagada, com a sombra desligada ou retirada some no quadro seguinte sem mudar as outras (FR-015);
//   - shadow-limit (spec 013, SC-006): mais luzes com sombra do que o teto do renderizador — o evento
//     `shadowUnavailable` nomeia as que ficaram sem, que iluminam sem sombra (a imagem contra a soma com elas sem
//     sombra); o teto que sobe devolve a sombra, o que baixa a tira, com o evento.
//   - spot-shadow (spec 013, FR-009): uma placa sob a luz de foco — a borda da sombra no chão contra a posição que a
//     geometria dá (a projeção da aresta a partir da luz), a sombra dentro do cone igual à razão entre a cena com e sem
//     sombra, e nada mudando fora do cone;
//   - point-shadow (spec 013, FR-008): uma placa sob a luz pontual, com a borda da sombra cruzando a aresta entre duas
//     faces do cubo — a borda contra a posição geométrica ao longo da linha que cruza a aresta, sem degrau, e o chão sem
//     sombra igual ao da luz sem sombra dos dois lados da aresta (sem emenda);
//   - rect-shadow (spec 013, SC-003): um anteparo horizontal entre a luz de área e o chão, com a borda sob o meio do
//     painel — a razão entre o chão com a sombra ligada e desligada (a fração do painel visível de cada ponto) contra a
//     referência f64 `rectVisibleFraction`, ao longo da penumbra.
//   - spot-travel, point-travel (spec 013, SC-002): a luz de foco e a pontual andando a cada quadro — o último quadro
//     contra o da luz parada no lugar final.
// Para rodar: `npm run smoke -- lighting [--query case=furnace]`. Resultado: `LIGHTING SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    BoxGeometry,
    Camera,
    createScene,
    DirectionalLight,
    MaterialFunction,
    ParametricSurface,
    PlaneGeometry,
    PointLight,
    PointSpriteMaterial,
    RectLight,
    SphereGeometry,
    SpotLight,
    StandardMaterial,
    SurfaceFunction,
    Transform,
} from 'clayflow/web';
import { capture, nextGpuFrame, settle } from './support/extensionScenes';
import { hdrAt, readHdrTexture, temporalVariance, type HdrImage } from './support/imageMeasures';
import { ambientParamsUniform, evalParams } from '../elements/material/reference/closure';
import { cookTorrance, normalize3, type Vec3 } from '../elements/material/reference/bsdf';
import { areaExact, type AreaRect } from '../elements/material/reference/areaLight';
import { rectVisibleFraction, type RectSource } from '../elements/scene/reference/rectVisibility';

function log(msg: string): void {
    console.log(`[lighting] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

/** Erro relativo com piso absoluto (valores perto de zero). */
const relErr = (got: number, exp: number, floor = 2e-3): number =>
    Math.abs(got - exp) / Math.max(Math.abs(exp), floor);

async function createApp(
    width: number,
    height: number,
    antialias: 'msaa' | 'accumulate' = 'msaa',
): Promise<{ app: Application; canvas: HTMLCanvasElement }> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        // As medidas comparam cada pixel com a conta analítica no centro dele: o MSAA com que foram calibradas (o padrão
        // antes da 034). O deslocamento da amostra do antisserrilhado temporal tem o smoke `antialiasing`.
        antialias,
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    app.events.on('extensionRejected', (e) =>
        engineErrors.push(`extensionRejected ${e.point}:${e.line}: ${e.message}`),
    );
    return { app, canvas };
}

function dispose(app: Application, canvas: HTMLCanvasElement): void {
    app.dispose();
    canvas.remove();
}

/**
 * Câmera ortográfica de cima (vista exata +y) à altura `y`: x à direita, −z para cima na tela; `height` unidades na
 * vertical.
 */
function topCamera(app: Application, height: number, y = 8): void {
    app.world.insert(
        new Camera({ projection: 'orthographic', orthoHeight: height, near: 0.1, far: 20 }).add(
            new Transform({
                position: [0, y, 0, 1],
                rotation: Transform.lookRotation([0, y, 0], [0, 0, 0], [0, 0, -1]),
            }),
        ),
    );
}

/** Sem a luz ambiente: só as luzes da cena iluminam. */
function noAmbient(app: Application): void {
    app.world.remove(app.defaults.ambient);
}

/** Pixel do ponto de mundo (x, z) na câmera de cima. */
function topPixel(x: number, z: number, height: number, w: number, h: number): [number, number] {
    const width = (height * w) / h;
    return [Math.floor((x / width + 0.5) * w), Math.floor((z / height + 0.5) * h)];
}

/** Coordenada x de mundo do centro do pixel `px` na câmera de cima. */
function topWorldX(px: number, height: number, w: number, h: number): number {
    return ((px + 0.5) / w - 0.5) * ((height * w) / h);
}

/** Lê o alvo HDR da cena depois de compilar e desenhar. */
async function renderHdr(app: Application): Promise<HdrImage> {
    await settle(app, 600);
    app.step(1 / 60);
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    return readHdrTexture(app, texture);
}

/** Fechamento só difuso branco (Lambert): a radiância é ρ/π × irradiância. */
const DIFFUSE_ONLY = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    return closure_diffuse(vec3f(1.0), 0.0);
}`;

/** Plano grande difuso branco (só o lobo difuso), para medir irradiância. */
function diffusePlane(app: Application, size = 12): void {
    app.world.insert(
        new PlaneGeometry({ size: [size, size] })
            .add(new StandardMaterial())
            .add(new Transform())
            .add(new MaterialFunction({ code: DIFFUSE_ONLY, lobes: ['diffuse'] })),
    );
}

async function caseBrdfReference(): Promise<void> {
    const W = 400;
    const H = 400;
    const height = 4;
    const { app, canvas } = await createApp(W, H);
    noAmbient(app);
    topCamera(app, height);
    const l = normalize3([0.5, 1, 0.3]);
    const intensity = 3;
    app.world.insert(new DirectionalLight({ direction: [-l[0], -l[1], -l[2], 0], intensity }));
    const albedo: Vec3 = [0.9, 0.55, 0.2];
    const cells: { x: number; z: number; r: number; m: number }[] = [];
    for (let j = 0; j < 5; j++)
        for (let i = 0; i < 5; i++) {
            const cell = { x: -1.6 + 0.8 * i, z: -1.6 + 0.8 * j, r: i / 4, m: j / 4 };
            cells.push(cell);
            app.world.insert(
                new PlaneGeometry({ size: [0.6, 0.6] })
                    .add(
                        new StandardMaterial({
                            albedo: [...albedo, 1],
                            roughness: cell.r,
                            metallic: cell.m,
                        }),
                    )
                    .add(new Transform({ position: [cell.x, 0, cell.z, 1] })),
            );
        }
    const hdr = await renderHdr(app);
    dispose(app, canvas);
    let worst = 0;
    for (const c of cells) {
        const [px, py] = topPixel(c.x, c.z, height, W, H);
        const got = hdrAt(hdr, px, py);
        const exp = evalParams({ albedo, roughness: c.r, metallic: c.m }, [0, 1, 0], [0, 1, 0], l, [
            intensity,
            intensity,
            intensity,
        ]);
        for (let k = 0; k < 3; k++) worst = Math.max(worst, relErr(got[k]!, exp[k]!, 0.01));
    }
    log(
        `brdf-reference: maior erro ${(100 * worst).toFixed(2)} % em 25 materiais (rugosidade × metalicidade)`,
    );
    check(worst <= 0.02, `brdf-reference: erro de ${(100 * worst).toFixed(2)} %`);
}

async function caseFurnace(): Promise<void> {
    const W = 500;
    const H = 200;
    const height = 2;
    const { app, canvas } = await createApp(W, H);
    topCamera(app, height);
    app.defaults.ambient.data.skyColor = [1, 1, 1, 1];
    app.defaults.ambient.data.groundColor = [1, 1, 1, 1];
    app.defaults.ambient.data.intensity = 1;
    const spheres: { x: number; z: number; r: number; m: number }[] = [];
    for (let m = 0; m < 2; m++)
        for (let i = 0; i < 5; i++) {
            const s = { x: -2 + i, z: -0.5 + m, r: i / 4, m };
            spheres.push(s);
            app.world.insert(
                new SphereGeometry({ radius: 0.4, latSegments: 48, lonSegments: 96 })
                    .add(
                        new StandardMaterial({
                            albedo: [1, 1, 1, 1],
                            roughness: s.r,
                            metallic: s.m,
                        }),
                    )
                    .add(new Transform({ position: [s.x, 0, s.z, 1] })),
            );
        }
    const hdr = await renderHdr(app);
    dispose(app, canvas);
    let worst = 0;
    for (const s of spheres) {
        const [cx, cy] = topPixel(s.x, s.z, height, W, H);
        const radiusPx = (0.4 / height) * H;
        let sum = 0;
        let n = 0;
        for (let dy = -radiusPx; dy <= radiusPx; dy++)
            for (let dx = -radiusPx; dx <= radiusPx; dx++) {
                if (dx * dx + dy * dy > (0.7 * radiusPx) ** 2) continue;
                const c = hdrAt(hdr, Math.round(cx + dx), Math.round(cy + dy));
                sum += (c[0] + c[1] + c[2]) / 3;
                n++;
            }
        const mean = sum / n;
        const expected = ambientParamsUniform(
            { albedo: [1, 1, 1], roughness: s.r, metallic: s.m },
            1,
            1,
        )[0];
        worst = Math.max(worst, Math.abs(mean - 1));
        log(
            `furnace: rugosidade ${s.r.toFixed(2)} ${s.m === 1 ? 'metal' : 'dielétrico'} → ${mean.toFixed(4)} (referência ${expected.toFixed(4)})`,
        );
    }
    check(
        worst <= 0.03,
        `furnace: desvio de ${(100 * worst).toFixed(2)} % da radiância do ambiente`,
    );
}

/** Janela suave do alcance `(1 − (d/r)⁴)²`. */
const fade = (d: number, r: number): number => {
    const t = Math.max(1 - (d / r) ** 4, 0);
    return t * t;
};

async function casePointFalloff(): Promise<void> {
    const W = 600;
    const H = 200;
    const height = 2;
    const { app, canvas } = await createApp(W, H);
    noAmbient(app);
    topCamera(app, height);
    diffusePlane(app);
    const I = 10;
    const range = 4;
    app.world.insert(new PointLight({ position: [0, 1, 0, 1], intensity: I, range }));
    const hdr = await renderHdr(app);
    dispose(app, canvas);
    let worst = 0;
    for (const x of [0, 0.5, 1, 1.5, 2, 2.5]) {
        const [px, py] = topPixel(x, 0, height, W, H);
        const got = hdrAt(hdr, px, py)[0];
        const d = Math.hypot(topWorldX(px, height, W, H), 1);
        const exp = (((I * (1 / d)) / (d * d)) * fade(d, range)) / Math.PI;
        worst = Math.max(worst, relErr(got, exp, 0.01));
        log(`point-falloff: x = ${x} → ${got.toFixed(4)} (esperado ${exp.toFixed(4)})`);
    }
    check(worst <= 0.02, `point-falloff: erro de ${(100 * worst).toFixed(2)} %`);
}

/** Condutor branco (F0 1) de rugosidade 0,3: o lobo especular sozinho. */
const MIRROR_ROUGH = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    return closure_conductor(vec3f(1.0), vec3f(1.0), 0.3, 0.0, vec3f(0.0));
}`;

async function caseRectLight(): Promise<void> {
    const W = 600;
    const H = 200;
    const height = 2;
    const L = 5;
    const rect: AreaRect = {
        center: [0.4, 1.2, 0],
        ax: [1, 0, 0],
        ay: [0, 0, 1],
        normal: [0, -1, 0],
        half: [0.6, 0.35],
    };
    const shot = async (code: string, lobes: ('diffuse' | 'specular')[]): Promise<HdrImage> => {
        const { app, canvas } = await createApp(W, H);
        noAmbient(app);
        topCamera(app, height);
        app.world.insert(
            new PlaneGeometry({ size: [12, 12] })
                .add(new StandardMaterial())
                .add(new Transform())
                .add(new MaterialFunction({ code, lobes })),
        );
        app.world.insert(
            new RectLight({
                position: [...rect.center, 1],
                direction: [0, -1, 0, 0],
                right: [1, 0, 0],
                size: [2 * rect.half[0], 2 * rect.half[1]],
                intensity: L,
            }),
        );
        const hdr = await renderHdr(app);
        dispose(app, canvas);
        return hdr;
    };
    const n: Vec3 = [0, 1, 0];
    // O difuso: ρ/π × a irradiância do painel.
    const diffuse = await shot(DIFFUSE_ONLY, ['diffuse']);
    let worst = 0;
    for (const x of [-2, -1, -0.3, 0.4, 1, 1.8, 2.6]) {
        const [px, py] = topPixel(x, 0, height, W, H);
        const got = hdrAt(diffuse, px, py)[0];
        const at: Vec3 = [topWorldX(px, height, W, H), 0, 0];
        const exp = (L * areaExact(rect, at, (l) => Math.max(l[1], 0), 200)) / Math.PI;
        worst = Math.max(worst, relErr(got, exp, 0.01));
        log(`rect-light: difuso em x = ${x} → ${got.toFixed(4)} (integral ${exp.toFixed(4)})`);
    }
    check(worst <= 0.03, `rect-light: difuso a ${(100 * worst).toFixed(2)} % da integral`);
    // O lobo especular (a câmera de cima: v = +y): a mancha do painel alargada pelo lobo. A integral densa não tem a
    // compensação do multiespalhamento (um fator só, o mesmo em todo o plano): compara-se a forma, pela razão.
    const glossy = await shot(MIRROR_ROUGH, ['specular']);
    const lobe = { f0: [1, 1, 1] as Vec3, f90: [1, 1, 1] as Vec3, roughness: 0.3 };
    const ratios: number[] = [];
    let peak = 0;
    let jump = 0;
    let last = -1;
    for (let px = 0; px < W; px++) {
        const got = hdrAt(glossy, px, H >> 1)[0];
        if (last >= 0) jump = Math.max(jump, Math.abs(got - last));
        last = got;
        peak = Math.max(peak, got);
    }
    for (const x of [-0.6, -0.2, 0.1, 0.4, 0.7, 1, 1.4]) {
        const [px, py] = topPixel(x, 0, height, W, H);
        const got = hdrAt(glossy, px, py)[0];
        const at: Vec3 = [topWorldX(px, height, W, H), 0, 0];
        const exp = L * areaExact(rect, at, (l) => cookTorrance(lobe, n, n, l)[0], 300);
        ratios.push(got / exp);
        log(`rect-light: especular em x = ${x} → ${got.toFixed(4)} (integral ${exp.toFixed(4)})`);
    }
    // A forma, onde a mancha passa de um décimo do pico; a cauda (a grade do lobo vai até 97 % da massa) à parte.
    const body = ratios.filter((_, k) => k > 0 && k < ratios.length - 1);
    const lo = Math.min(...body);
    const hi = Math.max(...body);
    const tail = Math.min(ratios[0]!, ratios[ratios.length - 1]!);
    log(
        `rect-light: especular / integral de ${lo.toFixed(3)} a ${hi.toFixed(3)} na mancha, ${tail.toFixed(3)} na cauda; pico ${peak.toFixed(3)}; maior degrau entre pixels ${(100 * (jump / peak)).toFixed(2)} % do pico`,
    );
    check(lo > 0.95 && hi < 1.1, `rect-light: especular fora da integral (${lo} a ${hi})`);
    check(hi / lo <= 1.04, `rect-light: a forma da mancha difere da integral (${hi / lo})`);
    check(tail > 0.75, `rect-light: a cauda da mancha a ${tail} da integral`);
    // A borda da mancha cai do pico a zero em uns 50 pixels (2 % do pico por pixel): um degrau seria bem maior.
    check(
        jump / peak <= 0.05,
        `rect-light: degrau de ${jump / peak} do pico entre pixels vizinhos`,
    );
}

async function caseSpotCones(): Promise<void> {
    const W = 600;
    const H = 200;
    const height = 2;
    const { app, canvas } = await createApp(W, H);
    noAmbient(app);
    topCamera(app, height);
    diffusePlane(app);
    const I = 10;
    const inner = 0.3;
    const outer = 0.5;
    app.world.insert(
        new SpotLight({
            position: [0, 2, 0, 1],
            direction: [0, -1, 0, 0],
            intensity: I,
            range: 20,
            innerCone: inner,
            outerCone: outer,
        }),
    );
    const hdr = await renderHdr(app);
    dispose(app, canvas);
    let worst = 0;
    let outside = 0;
    const profile: number[] = [];
    for (let k = 0; k <= 24; k++) {
        const [px, py] = topPixel((k / 24) * 2.4, 0, height, W, H);
        const got = hdrAt(hdr, px, py)[0];
        profile.push(got);
        const x = topWorldX(px, height, W, H);
        const d = Math.hypot(x, 2);
        const theta = Math.atan2(x, 2);
        const t = Math.min(
            Math.max((Math.cos(theta) - Math.cos(outer)) / (Math.cos(inner) - Math.cos(outer)), 0),
            1,
        );
        const exp = (((I * t * t * (2 / d)) / (d * d)) * fade(d, 20)) / Math.PI;
        if (theta > outer) outside = Math.max(outside, got);
        else worst = Math.max(worst, relErr(got, exp, 0.01));
    }
    let monotone = true;
    for (let k = 1; k < profile.length; k++)
        if (profile[k]! > profile[k - 1]! + 1e-5) monotone = false;
    log(
        `spot-cones: maior erro dentro ${(100 * worst).toFixed(2)} %, máximo fora do cone ${outside.toExponential(2)}, perfil ${monotone ? 'monótono' : 'NÃO monótono'}`,
    );
    check(worst <= 0.02, `spot-cones: erro de ${(100 * worst).toFixed(2)} % dentro dos cones`);
    check(outside <= 1e-4, `spot-cones: ${outside} fora do cone externo`);
    check(monotone, 'spot-cones: a transição entre os cones não é suave (perfil não monótono)');
}

async function caseLightSum(): Promise<void> {
    const W = 200;
    const H = 200;
    const { app, canvas } = await createApp(W, H);
    noAmbient(app);
    topCamera(app, 2);
    diffusePlane(app);
    app.world.insert(
        new DirectionalLight({ direction: [0, -1, 0, 0], color: [1, 0, 0, 1], intensity: 1 }),
    );
    app.world.insert(
        new DirectionalLight({ direction: [0, -1, 0, 0], color: [0, 1, 0, 1], intensity: 2 }),
    );
    const hdr = await renderHdr(app);
    dispose(app, canvas);
    const got = hdrAt(hdr, W / 2, H / 2);
    const exp = [1 / Math.PI, 2 / Math.PI, 0];
    const worst = Math.max(relErr(got[0], exp[0]!), relErr(got[1], exp[1]!), Math.abs(got[2]));
    log(`light-sum: (${got.map((v) => v.toFixed(4)).join(', ')}) — esperado (0,3183, 0,6366, 0)`);
    check(worst <= 0.02, `light-sum: erro de ${(100 * worst).toFixed(2)} %`);
}

/** Emissão = a normal (`mode` 0) ou a posição de mundo (`mode` 1), codificadas em [0, 1]. */
const NORMAL_CODE = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    let e = select(s.normal * 0.5 + 0.5, s.world_position * 0.25 + 0.5, data.mode > 0.5);
    return SurfaceParams(vec4f(0.0, 0.0, 0.0, 1.0), 1.0, 0.0, e);
}`;

async function caseNormalScale(): Promise<void> {
    const W = 200;
    const H = 400;
    const images: HdrImage[] = [];
    for (const mode of [0, 1]) {
        const { app, canvas } = await createApp(W, H);
        noAmbient(app);
        app.world.insert(
            new Camera({ projection: 'orthographic', orthoHeight: 4, near: 0.1, far: 20 }).add(
                new Transform({
                    position: [0, 0, 6, 1],
                    rotation: Transform.lookRotation([0, 0, 6], [0, 0, 0]),
                }),
            ),
        );
        app.world.insert(
            new SphereGeometry({ radius: 0.5, latSegments: 384, lonSegments: 384 })
                .add(new StandardMaterial())
                .add(new Transform({ scale: [1, 3, 1, 1] }))
                .add(
                    new MaterialFunction({
                        code: NORMAL_CODE,
                        params: { mode: 'f32' },
                        values: { mode },
                    }),
                ),
        );
        images.push(await renderHdr(app));
        dispose(app, canvas);
    }
    let worst = 0;
    let n = 0;
    const errors: number[] = [];
    for (let y = 0; y < H; y += 3)
        for (let x = 0; x < W; x += 3) {
            const nc = hdrAt(images[0]!, x, y);
            // Só o interior: a até 2 px do fundo o pixel resolvido do MSAA mistura a superfície com o fundo (silhueta).
            // Fundo = onde as duas imagens coincidem (a cor de limpeza); a superfície emite valores diferentes.
            let interior = true;
            for (let dy = -2; dy <= 2 && interior; dy++)
                for (let dx = -2; dx <= 2 && interior; dx++) {
                    const qx = Math.min(Math.max(x + dx, 0), W - 1);
                    const qy = Math.min(Math.max(y + dy, 0), H - 1);
                    const a = hdrAt(images[0]!, qx, qy);
                    const b = hdrAt(images[1]!, qx, qy);
                    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) interior = false;
                }
            if (!interior) continue;
            const p = hdrAt(images[1]!, x, y).map((v) => (v - 0.5) * 4) as unknown as Vec3;
            // Ponto do elipsoide x² + (y/3)² + z² = r²: gradiente (x, y/9, z). Longe da silhueta (normal rasante).
            const analytic = normalize3([p[0], p[1] / 9, p[2]]);
            if (analytic[2] < 0.2) continue;
            const drawn = normalize3(nc.map((v) => v * 2 - 1) as unknown as Vec3);
            const cos = Math.min(
                1,
                drawn[0] * analytic[0] + drawn[1] * analytic[1] + drawn[2] * analytic[2],
            );
            const deg = (Math.acos(cos) * 180) / Math.PI;
            errors.push(deg);
            worst = Math.max(worst, deg);
            n++;
        }
    errors.sort((a, b) => a - b);
    log(
        `normal-scale: escala (1, 3, 1), ${n} pixels — maior desvio da normal analítica ${worst.toFixed(3)}° (p50 ${errors[Math.floor(n / 2)]?.toFixed(3)}°, p99 ${errors[Math.floor(n * 0.99)]?.toFixed(3)}°)`,
    );
    check(n > 1000, `normal-scale: só ${n} pixels medidos`);
    check(worst <= 1, `normal-scale: normal a ${worst.toFixed(3)}° da analítica`);
}

/** Chapa ondulada fina: 80 sulcos ao longo de u (detalhe abaixo do pixel à distância). */
const RIDGES_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f(u, data.amp * sin(80.0 * u * 6.2831853), v);
}`;

async function caseSpecularAa(): Promise<void> {
    const W = 320;
    const H = 240;
    const { app, canvas } = await createApp(W, H);
    noAmbient(app);
    const cam = new Transform({
        position: [0, 1.2, 2.5, 1],
        rotation: Transform.lookRotation([0, 1.2, 2.5], [0, 0, 0]),
    });
    app.world.insert(new Camera({ fov: Math.PI / 4, near: 0.05, far: 20 }).add(cam));
    app.world.insert(new DirectionalLight({ direction: [0, -0.6, -1, 0], intensity: 3 }));
    app.world.insert(
        new ParametricSurface({ resolution: [1024, 4], domain: [-1, 1, -1, 1] })
            .add(new StandardMaterial({ albedo: [0.9, 0.9, 0.9, 1], roughness: 0.05, metallic: 1 }))
            .add(new Transform())
            .add(
                new SurfaceFunction({
                    code: RIDGES_CODE,
                    params: { amp: 'f32' },
                    values: { amp: 0.004 },
                }),
            ),
    );
    await settle(app, 600);
    const frames: ImageData[] = [];
    for (let i = 0; i < 30; i++) {
        const a = 0.002 * i;
        const eye: [number, number, number] = [2.5 * Math.sin(a), 1.2, 2.5 * Math.cos(a)];
        cam.data.position = [...eye, 1];
        cam.data.rotation = Transform.lookRotation(eye, [0, 0, 0]);
        app.step(1 / 60);
        frames.push(capture(canvas));
    }
    dispose(app, canvas);
    const variance = temporalVariance(frames, { x: W / 4, y: H / 3, w: W / 2, h: H / 3 });
    log(
        `specular-aa: variância temporal da luminância ${variance.toExponential(3)} (câmera girando 0,002 rad/quadro)`,
    );
    check(variance <= 2e-3, `specular-aa: cintilação ${variance}`);
}

async function caseSpritesLit(): Promise<void> {
    const W = 400;
    const H = 200;
    const height = 2;
    const { app, canvas } = await createApp(W, H);
    topCamera(app, height);
    app.world.insert(new DirectionalLight({ direction: [-0.4, -1, -0.3, 0], intensity: 3 }));
    const color: [number, number, number, number] = [0.8, 0.3, 0.2, 1];
    app.world.insert(
        new SphereGeometry({ radius: 0.4, latSegments: 64, lonSegments: 128 })
            .add(new StandardMaterial({ albedo: color, roughness: 0.5, metallic: 0 }))
            .add(new Transform({ position: [-1, 0, 0, 1] })),
    );
    app.world.insert(
        new BoxGeometry({ size: [1e-4, 1e-4, 1e-4] })
            .add(new PointSpriteMaterial({ color, radius: 0.4 }))
            .add(new Transform({ position: [1, 0, 0, 1] })),
    );
    const hdr = await renderHdr(app);
    dispose(app, canvas);
    const mean = (x: number): number => {
        const [cx, cy] = topPixel(x, 0, height, W, H);
        const r = (0.4 / height) * H * 0.7;
        let sum = 0;
        let n = 0;
        for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                sum += hdrAt(hdr, Math.round(cx + dx), Math.round(cy + dy))[0];
                n++;
            }
        return sum / n;
    };
    const mesh = mean(-1);
    const sprite = mean(1);
    const diff = Math.abs(sprite - mesh) / mesh;
    log(
        `sprites-lit: esfera de malha ${mesh.toFixed(4)} × sprite ${sprite.toFixed(4)} (diferença ${(100 * diff).toFixed(2)} %)`,
    );
    check(diff <= 0.05, `sprites-lit: sprite a ${(100 * diff).toFixed(2)} % da esfera de malha`);
}

const CASES: Record<string, () => Promise<void>> = {
    'brdf-reference': caseBrdfReference,
    furnace: caseFurnace,
    'point-falloff': casePointFalloff,
    'rect-light': caseRectLight,
    'spot-cones': caseSpotCones,
    'light-sum': caseLightSum,
    'normal-scale': caseNormalScale,
    'specular-aa': caseSpecularAa,
    'sprites-lit': caseSpritesLit,
    penumbra: casePenumbra,
    'sun-travel': caseSunTravel,
    'shadow-sum': caseShadowSum,
    'shadow-limit': caseShadowLimit,
    'spot-shadow': caseSpotShadow,
    'point-shadow': casePointShadow,
    'spot-travel': caseSpotTravel,
    'point-travel': casePointTravel,
    'rect-shadow': caseRectShadow,
};

/** Fração do disco de raio 1 com x < s (o disco coberto por uma borda reta em s). */
function discFraction(s: number): number {
    const c = Math.max(-1, Math.min(1, s));
    return (Math.PI - Math.acos(c) + c * Math.sqrt(1 - c * c)) / Math.PI;
}

/** O s em que a fração do disco vale `f` (bisseção). */
function discAt(f: number): number {
    let lo = -1;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (discFraction(mid) < f) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

/**
 * A borda da sombra da placa (x < −0,5 coberto, a 0,5 m: a câmera de cima vê o chão em volta da borda da sombra, que
 * cai em x = 0) sob a luz a 45° da vertical, de raio angular `theta`: a média de `frames` quadros acumulados do alvo HDR
 * na linha z = 0, normalizada entre a sombra e o iluminado; as posições (m) em que ela cruza 10 %, 50 % e 90 %.
 */
async function penumbraEdge(
    theta: number,
    frames: number,
): Promise<{ x10: number; x50: number; x90: number }> {
    const W = 800;
    const H = 200;
    const height = 0.4;
    const { app, canvas } = await createApp(W, H, 'accumulate');
    app.defaults.renderer.antialiasing.data.sequence = frames;
    noAmbient(app);
    // Perto do chão: o mapa virtual dá o nível mais fino em volta da câmera.
    topCamera(app, height, 1);
    diffusePlane(app);
    app.world.insert(
        new DirectionalLight({
            direction: [Math.SQRT1_2, -Math.SQRT1_2, 0, 0],
            intensity: 3,
            castShadow: true,
            angularRadius: theta,
        }),
    );
    app.world.insert(
        new BoxGeometry({ size: [2, 2 * PENUMBRA_EDGE, 2] })
            .add(new StandardMaterial({ albedo: [0.3, 0.3, 0.3, 1] }))
            .add(new Transform({ position: [-0.5 - 1, PENUMBRA_HEIGHT, 0, 1] })),
    );
    await settle(app, 600);
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    const row = new Float64Array(W);
    const y = Math.floor(H / 2);
    for (let i = 0; i < frames; i++) {
        app.step(1 / 60);
        const hdr = await readHdrTexture(app, texture);
        for (let x = 0; x < W; x++) row[x] = row[x]! + hdrAt(hdr, x, y)[0] / frames;
    }
    dispose(app, canvas);
    const lit = row[topPixel(0.15, 0, height, W, H)[0]]!;
    const dark = row[topPixel(-0.15, 0, height, W, H)[0]]!;
    const at = (f: number): number => {
        const level = dark + f * (lit - dark);
        // Só em volta da borda da sombra (a da placa, em x = −0,5, também cruza).
        const from = topPixel(-0.2, 0, height, W, H)[0];
        const to = topPixel(0.2, 0, height, W, H)[0];
        for (let x = from; x < to; x++) {
            const a = row[x]!;
            const b = row[x + 1]!;
            if ((a - level) * (b - level) <= 0 && a !== b)
                return topWorldX(x + (a - level) / (a - b), height, W, H);
        }
        return Number.NaN;
    };
    return { x10: at(0.1), x50: at(0.5), x90: at(0.9) };
}

/** Altura da placa do caso `penumbra` (m). */
const PENUMBRA_HEIGHT = 0.5;
/**
 * Onde cai, no chão, a sombra da aresta de cima da placa (a meia espessura acima de `PENUMBRA_HEIGHT`; a 45°): fina, para
 * a borda ser uma só (a lateral de uma placa grossa troca a aresta de cima pela de baixo no meio do disco).
 */
const PENUMBRA_EDGE = 0.001;

async function casePenumbra(): Promise<void> {
    // De 10 % a 90 % da fração coberta, em raios do disco.
    const span = discAt(0.9) - discAt(0.1);
    // O sol (0,00466 rad) e discos maiores.
    for (const theta of [0.00466, 0.02, 0.05]) {
        const e = await penumbraEdge(theta, 64);
        const width = e.x90 - e.x10;
        // O raio do disco no chão: L tan θ perpendicular ao raio (L = h / cos α) projetado no chão (÷ cos α), α = 45°.
        const expected = ((PENUMBRA_HEIGHT * Math.tan(theta)) / 0.5) * span;
        log(
            `penumbra: θ = ${theta} — 10–90 % ${(1000 * width).toFixed(2)} mm (disco ${(1000 * expected).toFixed(2)} mm, ${(100 * relErr(width, expected)).toFixed(1)} %), meio em ${(1000 * e.x50).toFixed(2)} mm`,
        );
        check(
            relErr(width, expected) <= 0.15,
            `penumbra: θ = ${theta} — largura ${(1000 * width).toFixed(2)} mm contra ${(1000 * expected).toFixed(2)} mm`,
        );
        check(
            Math.abs(e.x50 - PENUMBRA_EDGE) <= 0.1 * expected + 0.002,
            `penumbra: θ = ${theta} — meio da borda em ${(1000 * e.x50).toFixed(2)} mm (a borda em ${1000 * PENUMBRA_EDGE} mm)`,
        );
    }
    const hard = await penumbraEdge(0, 16);
    const width = hard.x90 - hard.x10;
    log(
        `penumbra: θ = 0 — 10–90 % ${(1000 * width).toFixed(2)} mm, meio em ${(1000 * hard.x50).toFixed(2)} mm`,
    );
    check(
        width <= 0.004,
        `penumbra: θ = 0 — borda de ${(1000 * width).toFixed(2)} mm (dura: ≤ 4 mm)`,
    );
}

/** Direção da luz do caso `sun-travel` no azimute `a` (rad), a 45° da vertical. */
const sunTravelDirection = (a: number): [number, number, number, number] => [
    Math.SQRT1_2 * Math.sin(a),
    -Math.SQRT1_2,
    Math.SQRT1_2 * Math.cos(a),
    0,
];

/**
 * O alvo HDR do caso `sun-travel` depois de `frames` quadros com a luz girando `step` rad por quadro até o azimute
 * `end` (com `step` 0, parada nele).
 */
async function sunTravelImage(
    end: number,
    step: number,
    frames: number,
    center: readonly [number, number],
): Promise<HdrImage> {
    const [cx, cz] = center;
    const { app, canvas } = await createApp(640, 400);
    noAmbient(app);
    app.world.insert(
        new Camera({ fov: Math.PI / 3, near: 0.1, far: 40 }).add(
            new Transform({
                position: [cx, 3.5, cz + 7, 1],
                rotation: Transform.lookRotation([cx, 3.5, cz + 7], [cx, 0, cz], [0, 1, 0]),
            }),
        ),
    );
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [cx, 0, cz, 1] }))
            .add(new MaterialFunction({ code: DIFFUSE_ONLY, lobes: ['diffuse'] })),
    );
    const light = new DirectionalLight({
        direction: sunTravelDirection(end - step * frames),
        intensity: 3,
        castShadow: true,
        angularRadius: 0.00466,
    });
    app.world.insert(light);
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * Math.PI;
        const r = 1.2 + 0.9 * (i % 3);
        app.world.insert(
            new SphereGeometry({ radius: 0.35 })
                .add(new StandardMaterial({ albedo: [0.6, 0.6, 0.6, 1] }))
                .add(
                    new Transform({
                        position: [cx + r * Math.cos(a), 0.35, cz + r * Math.sin(a), 1],
                    }),
                ),
        );
    }
    await settle(app, 600);
    for (let i = 1; i <= frames; i++) {
        light.data.direction = sunTravelDirection(end - step * (frames - i));
        if (i > 1) await nextGpuFrame(app);
        app.step(1 / 60);
    }
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    const hdr = await readHdrTexture(app, texture);
    dispose(app, canvas);
    return hdr;
}

/**
 * As três direcionais do caso `sun-travel` de várias luzes: o azimute final (rad), a inclinação, a intensidade e o
 * passo por quadro (graus) — uma rápida, uma lenta abaixo do limiar do cache das páginas (0,006°) e uma parada. Nenhuma
 * alinhada com a vista: a luz que vem de trás da câmera na direção do que ela vê põe os níveis mais finos do mapa (os
 * em volta da câmera no plano da luz) sobre o chão à vista e pede sozinha mais páginas que o reservatório de três
 * vistas — a sombra dela fica menos fina (FR-017) de um jeito que depende do que já estava alocado, e o quadro em
 * movimento deixa de ser comparável ao parado (medido com o azimute 2,7: 0,056 % dos pixels).
 */
const SUN_TRAVEL_LIGHTS = [
    { end: 0.6, tilt: Math.PI / 4, intensity: 3, step: 0.36 },
    { end: 1.9, tilt: 0.6, intensity: 2, step: 0.002 },
    { end: 4.5, tilt: 0.95, intensity: 2.5, step: 0 },
] as const;

/**
 * O alvo HDR do caso `sun-travel` com as três luzes com sombra depois de `frames` quadros: com `moving`, cada luz gira
 * no seu passo até o azimute final, a câmera anda de lado e uma esfera atravessa o chão, todos chegando ao estado final
 * no último quadro; sem ele, tudo parado no estado final.
 */
async function sunTravelManyImage(moving: boolean, frames: number): Promise<HdrImage> {
    const { app, canvas } = await createApp(640, 400);
    noAmbient(app);
    const direction = (k: number, left: number): [number, number, number, number] => {
        const spec = SUN_TRAVEL_LIGHTS[k]!;
        const a = spec.end - (moving ? (spec.step * Math.PI * left) / 180 : 0);
        return [
            Math.sin(spec.tilt) * Math.sin(a),
            -Math.cos(spec.tilt),
            Math.sin(spec.tilt) * Math.cos(a),
            0,
        ];
    };
    // A câmera anda 1 cm por quadro em x; a esfera, 2 cm por quadro em z.
    const eye = (left: number): [number, number, number] => [moving ? -0.01 * left : 0, 3.5, 7];
    const ball = (left: number): [number, number, number, number] => [
        0.4,
        0.35,
        0.3 - (moving ? 0.02 * left : 0),
        1,
    ];
    const camera = new Transform({
        position: [...eye(frames), 1],
        rotation: Transform.lookRotation(eye(frames), [eye(frames)[0], 0, 0], [0, 1, 0]),
    });
    app.world.insert(new Camera({ fov: Math.PI / 3, near: 0.1, far: 40 }).add(camera));
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform())
            .add(new MaterialFunction({ code: DIFFUSE_ONLY, lobes: ['diffuse'] })),
    );
    const lights = SUN_TRAVEL_LIGHTS.map((spec, k) => {
        const light = new DirectionalLight({
            direction: direction(k, frames),
            intensity: spec.intensity,
            castShadow: true,
            angularRadius: 0.00466,
        });
        app.world.insert(light);
        return light;
    });
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * Math.PI;
        const r = 1.2 + 0.9 * (i % 3);
        app.world.insert(
            new SphereGeometry({ radius: 0.35 })
                .add(new StandardMaterial({ albedo: [0.6, 0.6, 0.6, 1] }))
                .add(new Transform({ position: [r * Math.cos(a), 0.35, r * Math.sin(a), 1] })),
        );
    }
    const mover = new Transform({ position: ball(frames) });
    app.world.insert(
        new SphereGeometry({ radius: 0.35 })
            .add(new StandardMaterial({ albedo: [0.6, 0.6, 0.6, 1] }))
            .add(mover),
    );
    await settle(app, 600);
    for (let i = 1; i <= frames; i++) {
        const left = frames - i;
        lights.forEach((light, k) => {
            if (SUN_TRAVEL_LIGHTS[k]!.step !== 0) light.data.direction = direction(k, left);
        });
        if (moving) {
            camera.data.position = [...eye(left), 1];
            mover.data.position = ball(left);
        }
        if (i > 1) await nextGpuFrame(app);
        app.step(1 / 60);
    }
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    const hdr = await readHdrTexture(app, texture);
    dispose(app, canvas);
    return hdr;
}

/** As três direcionais com sombra em movimento, a câmera andando e um objeto se movendo, contra o estado parado. */
async function sunTravelMany(): Promise<void> {
    const still = await sunTravelManyImage(false, 60);
    // O chão aceso pelas três luzes: a escala das diferenças.
    const lit = SUN_TRAVEL_LIGHTS.reduce(
        (sum, l) => sum + (l.intensity * Math.cos(l.tilt)) / Math.PI,
        0,
    );
    for (const frames of [180, 177]) {
        const moving = await sunTravelManyImage(true, frames);
        let sum = 0;
        let wrong = 0;
        const n = still.width * still.height;
        for (let i = 0; i < n; i++) {
            const e = Math.abs(moving.data[i * 4]! - still.data[i * 4]!) / lit;
            sum += e;
            if (e > 0.25) wrong++;
        }
        const mean = sum / n;
        const far = wrong / n;
        log(
            `sun-travel: três luzes (0,36°, 0,002° e parada), câmera e objeto em movimento, ${frames} quadros — diferença média ${(100 * mean).toFixed(4)} % do chão aceso; ${(100 * far).toFixed(4)} % dos pixels a mais de 25 %`,
        );
        check(
            mean <= 0.0005 && far <= 0.0005,
            `sun-travel: três luzes em movimento, ${frames} quadros — difere do estado parado: média ${(100 * mean).toFixed(4)} %, ${(100 * far).toFixed(4)} % dos pixels a mais de 25 %`,
        );
    }
}

/**
 * A sombra da luz de área contra a referência (spec 013, SC-003): o painel de 1,2 × 0,7 m a 1,2 m do chão, virado para
 * baixo, e um anteparo horizontal a 0,6 m cobrindo x ≤ 0,4 (a borda sob o meio do painel). Do chão em x > 0,4 a fração
 * visível vai de ½ (junto à borda) a 1 (em x = 1): a razão entre a imagem com a sombra e a sem ela, na linha do meio.
 */
async function caseRectShadow(): Promise<void> {
    const W = 600;
    const H = 200;
    const height = 1.2;
    const source: RectSource = {
        center: [0.4, 1.2, 0],
        normal: [0, -1, 0],
        axis: [1, 0, 0],
        size: [1.2, 0.7],
    };
    const edge = 0.4;
    const screenY = 0.6;
    const shot = async (castShadow: boolean): Promise<HdrImage> => {
        const { app, canvas } = await createApp(W, H);
        noAmbient(app);
        topCamera(app, height);
        diffusePlane(app);
        // O anteparo: uma placa fina com a borda em x = `edge`.
        app.world.insert(
            new BoxGeometry({ size: [4, 0.01, 4] })
                .add(new StandardMaterial({ albedo: [0, 0, 0, 1] }))
                .add(new Transform({ position: [edge - 2, screenY, 0, 1] })),
        );
        app.world.insert(
            new RectLight({
                position: [...source.center, 1],
                direction: [0, -1, 0, 0],
                right: [1, 0, 0],
                size: [source.size[0], source.size[1]],
                intensity: 5,
                castShadow,
            }),
        );
        await settle(app, 600);
        // A média no tempo da sombra: um raio por texel e por quadro.
        for (let i = 0; i < 96; i++) {
            if (i > 0) await nextGpuFrame(app);
            app.step(1 / 60);
        }
        const texture = app.resources.textureOf(app.defaults.targets, 'color');
        if (texture === undefined) throw new Error('alvo HDR não alocado');
        const hdr = await readHdrTexture(app, texture);
        dispose(app, canvas);
        return hdr;
    };
    const lit = await shot(false);
    const shadowed = await shot(true);
    const row = Math.floor(H / 2);
    let worst = 0;
    let at = 0;
    let sum = 0;
    let count = 0;
    const samples: string[] = [];
    for (let px = 0; px < W; px++) {
        const x = topWorldX(px, height, W, H);
        // O chão visto por cima, fora do anteparo (com folga da borda dele na imagem) e até além do fim da penumbra.
        if (x < edge + 0.03 || x > 1.15) continue;
        const base = hdrAt(lit, px, row)[0];
        if (base <= 1e-6) continue;
        const got = hdrAt(shadowed, px, row)[0] / base;
        const expected = rectVisibleFraction(
            [x, 0, 0],
            source,
            [
                {
                    kind: 'halfPlane',
                    point: [edge, screenY, 0],
                    normal: [0, 1, 0],
                    inside: [1, 0, 0],
                },
            ],
            512,
        );
        const e = Math.abs(got - expected);
        sum += e;
        count++;
        if (e > worst) {
            worst = e;
            at = x;
        }
        if (px % 40 === 0)
            samples.push(`${x.toFixed(2)}: ${got.toFixed(3)}/${expected.toFixed(3)}`);
    }
    log(
        `rect-shadow: fração visível do painel ao longo da penumbra (${count} pixels) — erro médio ${((100 * sum) / Math.max(count, 1)).toFixed(2)} %, maior ${(100 * worst).toFixed(2)} % em x = ${at.toFixed(2)} m; x: motor/referência ${samples.join(' · ')}`,
    );
    check(count > 100, `rect-shadow: só ${count} pixels medidos`);
    check(
        worst <= 0.05,
        `rect-shadow: a fração visível difere ${(100 * worst).toFixed(2)} % da referência em x = ${at.toFixed(2)} m (≤ 5 %)`,
    );
}

async function caseSunTravel(): Promise<void> {
    const end = 0.6;
    // Em volta da origem e longe dela (a âncora das páginas é a origem do mundo: longe, a página de um ponto muda mais
    // de um quadro para o outro); 0,36° por quadro e, a luz lenta, 0,02° e 0,002° (o cache das páginas não recomeça em
    // todo quadro). Duas contagens de quadros: o último cai nas duas fatias da série do referencial e em fases
    // diferentes do cache.
    for (const [name, center, runs] of [
        [
            'origem',
            [0, 0],
            [
                [0.36, 180],
                [0.36, 179],
                [0.02, 180],
                [0.02, 177],
                [0.002, 180],
                [0.002, 177],
            ],
        ],
        [
            'longe',
            [300, -200],
            [
                [0.36, 180],
                [0.002, 177],
            ],
        ],
    ] as const) {
        const still = await sunTravelImage(end, 0, 60, center);
        for (const [d, frames] of runs) {
            const step = (d * Math.PI) / 180;
            const moving = await sunTravelImage(end, step, frames, center);
            // O chão aceso (o difuso branco sob a luz a 45°): a escala das diferenças.
            const lit = (3 * Math.SQRT1_2) / Math.PI;
            let sum = 0;
            let wrong = 0;
            const n = still.width * still.height;
            for (let i = 0; i < n; i++) {
                const e = Math.abs(moving.data[i * 4]! - still.data[i * 4]!) / lit;
                sum += e;
                if (e > 0.25) wrong++;
            }
            const mean = sum / n;
            const far = wrong / n;
            log(
                `sun-travel: ${name}, ${d}° por quadro, ${frames} quadros — diferença média ${(100 * mean).toFixed(4)} % do chão aceso; ${(100 * far).toFixed(4)} % dos pixels a mais de 25 %`,
            );
            check(
                mean <= 0.0005 && far <= 0.0005,
                `sun-travel: ${name}, ${d}° por quadro, ${frames} quadros — a sombra da luz que gira difere da parada: média ${(100 * mean).toFixed(4)} %, ${(100 * far).toFixed(4)} % dos pixels a mais de 25 %`,
            );
        }
    }
    await sunTravelMany();
}

/** As três direcionais dos casos `shadow-sum` e `shadow-limit`: azimute e elevação (rad), cor e intensidade. */
const SHADOW_SUM_LIGHTS = [
    { azimuth: 0.6, tilt: Math.PI / 4, color: [1, 0.35, 0.3, 1], intensity: 3 },
    { azimuth: 2.7, tilt: 0.6, color: [0.3, 1, 0.4, 1], intensity: 2 },
    { azimuth: 4.5, tilt: 0.95, color: [0.35, 0.45, 1, 1], intensity: 2.5 },
] as const;

/** O que cada uma das três luzes faz numa cena: fora dela, sem sombra ou com sombra. */
type ShadowSumLight = 'off' | 'plain' | 'shadow';

/** A cena dos casos `shadow-sum` e `shadow-limit`: o chão difuso, doze esferas e as luzes pedidas (`null`: fora). */
async function shadowSumScene(
    setup: readonly ShadowSumLight[],
    prepare?: (app: Application) => void,
): Promise<{
    app: Application;
    canvas: HTMLCanvasElement;
    lights: (DirectionalLight | undefined)[];
    read: () => Promise<HdrImage>;
}> {
    const { app, canvas } = await createApp(640, 400);
    noAmbient(app);
    prepare?.(app);
    app.world.insert(
        new Camera({ fov: Math.PI / 3, near: 0.1, far: 40 }).add(
            new Transform({
                position: [0, 3.5, 7, 1],
                rotation: Transform.lookRotation([0, 3.5, 7], [0, 0, 0], [0, 1, 0]),
            }),
        ),
    );
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform())
            .add(new MaterialFunction({ code: DIFFUSE_ONLY, lobes: ['diffuse'] })),
    );
    const lights = SHADOW_SUM_LIGHTS.map((spec, k) => {
        const mode = setup[k] ?? 'off';
        if (mode === 'off') return undefined;
        const light = new DirectionalLight({
            direction: [
                Math.sin(spec.tilt) * Math.sin(spec.azimuth),
                -Math.cos(spec.tilt),
                Math.sin(spec.tilt) * Math.cos(spec.azimuth),
                0,
            ],
            color: [...spec.color],
            intensity: spec.intensity,
            castShadow: mode === 'shadow',
            angularRadius: 0.00466,
        });
        app.world.insert(light);
        return light;
    });
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * Math.PI;
        const r = 1.2 + 0.9 * (i % 3);
        app.world.insert(
            new SphereGeometry({ radius: 0.35 })
                .add(new StandardMaterial({ albedo: [0.6, 0.6, 0.6, 1] }))
                .add(new Transform({ position: [r * Math.cos(a), 0.35, r * Math.sin(a), 1] })),
        );
    }
    await settle(app, 600);
    const read = async (): Promise<HdrImage> => {
        const texture = app.resources.textureOf(app.defaults.targets, 'color');
        if (texture === undefined) throw new Error('alvo HDR não alocado');
        return readHdrTexture(app, texture);
    };
    return { app, canvas, lights, read };
}

/** As imagens de uma luz só (com e sem sombra) dos casos de soma, feitas uma vez. */
const shadowSumSingles = new Map<string, Promise<HdrImage>>();

/** A imagem da cena só com a luz `k`, com sombra (`shadow`) ou sem; `k` −1: sem luz nenhuma (o fundo). */
function shadowSumSingle(k: number, shadow: boolean): Promise<HdrImage> {
    const key = `${k}:${shadow}`;
    let image = shadowSumSingles.get(key);
    if (image === undefined) {
        image = (async () => {
            const setup = SHADOW_SUM_LIGHTS.map(
                (_, i): ShadowSumLight => (i !== k ? 'off' : shadow ? 'shadow' : 'plain'),
            );
            const s = await shadowSumScene(setup);
            const hdr = await s.read();
            dispose(s.app, s.canvas);
            return hdr;
        })();
        shadowSumSingles.set(key, image);
    }
    return image;
}

/**
 * A imagem `got` contra a soma das imagens de uma luz só (`setup`: cada luz fora, sem sombra ou com sombra), descontado
 * o fundo comum a elas: a diferença
 * média e a fração dos pixels a mais de 25 %, sobre o chão aceso pelas três luzes (o maior canal da soma das irradiâncias
 * no chão aberto).
 */
async function shadowSumError(
    got: HdrImage,
    setup: readonly ShadowSumLight[],
): Promise<{ mean: number; far: number }> {
    const parts: HdrImage[] = [];
    for (let k = 0; k < setup.length; k++)
        if (setup[k] !== 'off') parts.push(await shadowSumSingle(k, setup[k] === 'shadow'));
    // O que não vem das luzes (o fundo do quadro) está em cada imagem de uma luz: entra uma vez só na soma.
    const base = await shadowSumSingle(-1, false);
    const lit = Math.max(
        ...[0, 1, 2].map((c) =>
            SHADOW_SUM_LIGHTS.reduce(
                (sum, l) => sum + (l.intensity * Math.cos(l.tilt) * l.color[c]!) / Math.PI,
                0,
            ),
        ),
    );
    const n = got.width * got.height;
    let sum = 0;
    let wrong = 0;
    for (let i = 0; i < n; i++) {
        let e = 0;
        for (let c = 0; c < 3; c++) {
            let expected = base.data[i * 4 + c]! * (1 - parts.length);
            for (const part of parts) expected += part.data[i * 4 + c]!;
            e = Math.max(e, Math.abs(got.data[i * 4 + c]! - expected) / lit);
        }
        sum += e;
        if (e > 0.25) wrong++;
    }
    return { mean: sum / n, far: wrong / n };
}

/** Registra e confere uma medida dos casos de soma contra a SC-001 (1 % na média, 1 % dos pixels a mais de 25 %). */
function shadowSumCheck(name: string, what: string, e: { mean: number; far: number }): void {
    log(
        `${name}: ${what} — diferença média ${(100 * e.mean).toFixed(4)} % do chão aceso; ${(100 * e.far).toFixed(4)} % dos pixels a mais de 25 %`,
    );
    check(
        e.mean <= 0.01 && e.far <= 0.01,
        `${name}: ${what} — difere da soma das luzes: média ${(100 * e.mean).toFixed(4)} %, ${(100 * e.far).toFixed(4)} % dos pixels a mais de 25 %`,
    );
}

/** Um quadro depois de uma mudança na cena: a imagem do quadro seguinte a ela. */
async function nextFrameImage(s: {
    app: Application;
    read: () => Promise<HdrImage>;
}): Promise<HdrImage> {
    await nextGpuFrame(s.app);
    s.app.step(1 / 60);
    return s.read();
}

async function caseShadowSum(): Promise<void> {
    const name = 'shadow-sum';
    const s = await shadowSumScene(['shadow', 'shadow', 'shadow']);
    const unavailable: unknown[] = [];
    s.app.events.on('shadowUnavailable', (e) => unavailable.push(e.light));
    // SC-001: as três com sombra contra a soma das três imagens de uma luz.
    shadowSumCheck(
        name,
        'três direcionais com sombra',
        await shadowSumError(await s.read(), ['shadow', 'shadow', 'shadow']),
    );
    const middle = s.lights[1]!;
    // FR-015: a do meio apagada — no quadro seguinte, só as outras duas, cada uma com a sua sombra.
    const intensity = middle.data.intensity;
    middle.data.intensity = 0;
    shadowSumCheck(
        name,
        'uma luz apagada, no quadro seguinte',
        await shadowSumError(await nextFrameImage(s), ['shadow', 'off', 'shadow']),
    );
    // Acesa de novo com a sombra desligada: ilumina sem sombra, e as outras não mudam.
    middle.data.intensity = intensity;
    middle.data.castShadow = 0;
    shadowSumCheck(
        name,
        'uma luz com a sombra desligada, no quadro seguinte',
        await shadowSumError(await nextFrameImage(s), ['shadow', 'plain', 'shadow']),
    );
    // A sombra ligada de novo: a luz recupera a faixa e as páginas dela (alguns quadros).
    middle.data.castShadow = 1;
    for (let i = 0; i < 8; i++) {
        await nextGpuFrame(s.app);
        s.app.step(1 / 60);
    }
    shadowSumCheck(
        name,
        'a sombra ligada de novo',
        await shadowSumError(await s.read(), ['shadow', 'shadow', 'shadow']),
    );
    // Retirada da cena: no quadro seguinte, só as outras duas.
    s.app.world.remove(middle);
    shadowSumCheck(
        name,
        'uma luz retirada, no quadro seguinte',
        await shadowSumError(await nextFrameImage(s), ['shadow', 'off', 'shadow']),
    );
    check(
        unavailable.length === 0,
        `${name}: ${unavailable.length} avisos de sombra indisponível com três luzes (o teto é maior)`,
    );
    dispose(s.app, s.canvas);
}

async function caseShadowLimit(): Promise<void> {
    const name = 'shadow-limit';
    const unavailable: { light: unknown; reason: string }[] = [];
    // O teto de duas luzes com sombra, posto antes de as luzes entrarem.
    const s = await shadowSumScene(['shadow', 'shadow', 'shadow'], (app) => {
        app.defaults.renderer.shadows.views = 2;
        app.events.on('shadowUnavailable', (e) => unavailable.push(e));
    });
    const names = (): string =>
        unavailable
            .map((e) => `${s.lights.indexOf(e.light as DirectionalLight)}:${e.reason}`)
            .join(' ');
    // SC-006: a terceira luz (a última a entrar) é nomeada e ilumina sem sombra.
    log(`${name}: teto 2, três luzes com sombra — avisos: ${names()}`);
    check(names() === '2:limit', `${name}: avisos '${names()}' (esperado '2:limit')`);
    shadowSumCheck(
        name,
        'a luz além do teto sem sombra, as outras com a delas',
        await shadowSumError(await s.read(), ['shadow', 'shadow', 'plain']),
    );
    // O teto sobe para três: a terceira ganha a sombra, sem aviso novo.
    s.app.defaults.renderer.shadows.views = 3;
    for (let i = 0; i < 8; i++) {
        await nextGpuFrame(s.app);
        s.app.step(1 / 60);
    }
    shadowSumCheck(
        name,
        'o teto em 3: as três com sombra',
        await shadowSumError(await s.read(), ['shadow', 'shadow', 'shadow']),
    );
    check(names() === '2:limit', `${name}: avisos '${names()}' depois de o teto subir`);
    // O teto baixa para um (o que a troca de perfil faz): a segunda e a terceira saem, com o evento.
    s.app.defaults.renderer.shadows.views = 1;
    for (let i = 0; i < 8; i++) {
        await nextGpuFrame(s.app);
        s.app.step(1 / 60);
    }
    log(`${name}: teto 1 — avisos: ${names()}`);
    check(
        names() === '2:limit 1:limit 2:limit',
        `${name}: avisos '${names()}' (esperado '2:limit 1:limit 2:limit')`,
    );
    shadowSumCheck(
        name,
        'o teto em 1: só a primeira com sombra',
        await shadowSumError(await s.read(), ['shadow', 'plain', 'plain']),
    );
    dispose(s.app, s.canvas);
}

/** Posição z (m) do centro da linha `py` na câmera de cima. */
function topWorldZ(py: number, height: number, h: number): number {
    return ((py + 0.5) / h - 0.5) * height;
}

/**
 * A cena dos casos `spot-shadow` e `point-shadow` vista de cima (4 m de altura da imagem, 1 cm por pixel): o chão
 * difuso branco, uma direcional fraca a pino sem sombra (o chão fora do alcance da luz local tem luz) e a luz local
 * `light`, com uma placa fina (`plate`: centro e meias medidas em x e z, a `height` do chão) entre ela e o chão.
 */
async function localShadowImage(
    light: SpotLight | PointLight,
    plate: { readonly center: readonly [number, number]; readonly half: readonly [number, number] },
    height: number,
): Promise<HdrImage> {
    const { app, canvas } = await createApp(LOCAL_W, LOCAL_H);
    noAmbient(app);
    topCamera(app, LOCAL_VIEW, 8);
    diffusePlane(app, 16);
    app.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], intensity: LOCAL_FILL }));
    app.world.insert(light);
    app.world.insert(
        new BoxGeometry({ size: [2 * plate.half[0], 0.002, 2 * plate.half[1]] })
            .add(new StandardMaterial({ albedo: [0.3, 0.3, 0.3, 1] }))
            .add(new Transform({ position: [plate.center[0], height, plate.center[1], 1] })),
    );
    const hdr = await renderHdr(app);
    dispose(app, canvas);
    return hdr;
}

/** O alvo, a altura da imagem (m) e a direcional de preenchimento dos casos das luzes locais com sombra. */
const LOCAL_W = 800;
const LOCAL_H = 400;
const LOCAL_VIEW = 4;
const LOCAL_FILL = 0.5;
/** A radiância do chão só com a direcional de preenchimento (difuso branco, a pino). */
const LOCAL_FLOOR = LOCAL_FILL / Math.PI;
/**
 * A tolerância da borda da sombra das luzes locais: 2 cm — um texel do mapa no chão (o nível é o da resolução na tela:
 * o texel fica entre um e dois pixels da câmera, de 1 cm) e meio pixel da câmera de cada lado da leitura.
 */
const LOCAL_EDGE = 0.02;

/**
 * A fração da luz local que chega a cada pixel: a cena com sombra sobre a mesma cena sem sombra, descontada a
 * direcional de preenchimento — 1 no chão aceso, 0 na sombra; `undefined` onde a luz local não chega (fora do cone, do
 * alcance) ou onde a câmera vê a placa.
 */
function localFraction(
    shadowed: HdrImage,
    plain: HdrImage,
    x: number,
    y: number,
): number | undefined {
    const lit = hdrAt(plain, x, y)[0] - LOCAL_FLOOR;
    if (lit < 0.02) return undefined;
    return (hdrAt(shadowed, x, y)[0] - LOCAL_FLOOR) / lit;
}

async function caseSpotShadow(): Promise<void> {
    const name = 'spot-shadow';
    // A luz de foco a 4 m, a pino, cone externo de 0,5 rad (2,19 m de raio no chão); a placa a 2 m, de x = −1,2 a 0,3:
    // a aresta em x = 0,3 projeta a borda da sombra em x = 0,3 · 4 / (4 − 2) = 0,6.
    const H = 4;
    const h = 2;
    const outer = 0.5;
    const edge = 0.3;
    const spot = (castShadow: boolean): SpotLight =>
        new SpotLight({
            position: [0, H, 0, 1],
            direction: [0, -1, 0, 0],
            innerCone: 0.4,
            outerCone: outer,
            intensity: 40,
            range: 12,
            castShadow,
        });
    const plate = { center: [edge - 0.75, 0], half: [0.75, 0.6] } as const;
    const shadowed = await localShadowImage(spot(true), plate, h);
    const plain = await localShadowImage(spot(false), plate, h);
    const row = LOCAL_H / 2;
    const expected = (edge * H) / (H - h);
    // A borda: onde a fração cruza 50 %, na linha z = 0, à direita da placa.
    let found = Number.NaN;
    for (let x = topPixel(edge + 0.05, 0, LOCAL_VIEW, LOCAL_W, LOCAL_H)[0]; x < LOCAL_W - 1; x++) {
        const a = localFraction(shadowed, plain, x, row);
        const b = localFraction(shadowed, plain, x + 1, row);
        if (a === undefined || b === undefined) continue;
        if (a < 0.5 && b >= 0.5) {
            found = topWorldX(x + (0.5 - a) / (b - a), LOCAL_VIEW, LOCAL_W, LOCAL_H);
            break;
        }
    }
    // Dentro da sombra (x = 0,45) e no chão aceso (x = 1,2), longe da borda.
    const inside = localFraction(
        shadowed,
        plain,
        topPixel(0.45, 0, LOCAL_VIEW, LOCAL_W, LOCAL_H)[0],
        row,
    );
    const outside = localFraction(
        shadowed,
        plain,
        topPixel(1.2, 0, LOCAL_VIEW, LOCAL_W, LOCAL_H)[0],
        row,
    );
    log(
        `${name}: borda da sombra em x = ${found.toFixed(4)} m (a geometria dá ${expected.toFixed(4)}; ${(1000 * Math.abs(found - expected)).toFixed(1)} mm); fração da luz na sombra ${inside?.toFixed(4)}, no chão aceso ${outside?.toFixed(4)}`,
    );
    check(
        Math.abs(found - expected) <= LOCAL_EDGE,
        `${name}: borda em ${found.toFixed(4)} m contra ${expected.toFixed(4)} m`,
    );
    check(inside !== undefined && inside < 0.02, `${name}: luz na sombra (${inside})`);
    check(
        outside !== undefined && Math.abs(outside - 1) < 0.01,
        `${name}: sombra no chão aceso (${outside})`,
    );
    // Fora do cone externo (a mais de 2,19 m do eixo, com 5 cm de folga): nem luz da luz de foco nem sombra dela — a
    // imagem é a da direcional de preenchimento, igual com e sem a sombra.
    const reach = H * Math.tan(outer) + 0.05;
    let leak = 0;
    let differ = 0;
    let counted = 0;
    for (let y = 0; y < LOCAL_H; y++)
        for (let x = 0; x < LOCAL_W; x++) {
            const wx = topWorldX(x, LOCAL_VIEW, LOCAL_W, LOCAL_H);
            const wz = topWorldZ(y, LOCAL_VIEW, LOCAL_H);
            if (Math.hypot(wx, wz) < reach) continue;
            counted++;
            leak = Math.max(leak, Math.abs(hdrAt(shadowed, x, y)[0] - LOCAL_FLOOR) / LOCAL_FLOOR);
            differ = Math.max(
                differ,
                Math.abs(hdrAt(shadowed, x, y)[0] - hdrAt(plain, x, y)[0]) / LOCAL_FLOOR,
            );
        }
    log(
        `${name}: fora do cone (${counted} pixels) — maior desvio do chão só com o preenchimento ${(100 * leak).toFixed(3)} %; maior diferença com e sem a sombra ${(100 * differ).toFixed(3)} %`,
    );
    check(leak <= 0.01, `${name}: luz ou sombra fora do cone (${(100 * leak).toFixed(3)} %)`);
    check(
        differ <= 0.001,
        `${name}: a sombra muda a imagem fora do cone (${(100 * differ).toFixed(3)} %)`,
    );
}

async function casePointShadow(): Promise<void> {
    const name = 'point-shadow';
    // A pontual a 2 m do chão: a face de baixo do cubo cobre |x|, |z| < 2 no chão; além, as faces dos lados. A placa a
    // 1 m, de x = −1,5 a 1,5 e z = −1 a 0,25: a aresta em z = 0,25 projeta a borda da sombra em z = 0,5, de x = −3 a
    // 3 — cruzando a aresta entre a face de baixo e a face +x em x = 2.
    const H = 2;
    const h = 1;
    const edge = 0.25;
    const point = (castShadow: boolean): PointLight =>
        new PointLight({ position: [0, H, 0, 1], intensity: 12, range: 14, castShadow });
    const plate = { center: [0, edge - 0.625], half: [1.5, 0.625] } as const;
    const shadowed = await localShadowImage(point(true), plate, h);
    const plain = await localShadowImage(point(false), plate, h);
    const expected = (edge * H) / (H - h);
    // A borda (onde a fração cruza 50 % ao longo de z) em colunas dos dois lados da aresta das faces e sobre ela.
    const columns = [0.5, 1.6, 1.8, 1.9, 1.96, 2.0, 2.04, 2.1, 2.2, 2.4, 2.8];
    const edges: number[] = [];
    for (const wx of columns) {
        const x = topPixel(wx, 0, LOCAL_VIEW, LOCAL_W, LOCAL_H)[0];
        let found = Number.NaN;
        for (
            let y = topPixel(0, edge + 0.05, LOCAL_VIEW, LOCAL_W, LOCAL_H)[1];
            y < LOCAL_H - 1;
            y++
        ) {
            const a = localFraction(shadowed, plain, x, y);
            const b = localFraction(shadowed, plain, x, y + 1);
            if (a === undefined || b === undefined) continue;
            if (a < 0.5 && b >= 0.5) {
                found = topWorldZ(y + (0.5 - a) / (b - a), LOCAL_VIEW, LOCAL_H);
                break;
            }
        }
        edges.push(found);
    }
    const worst = Math.max(...edges.map((z) => Math.abs(z - expected)));
    let step = 0;
    for (let i = 1; i < edges.length; i++)
        step = Math.max(step, Math.abs(edges[i]! - edges[i - 1]!));
    log(
        `${name}: borda da sombra em z = ${edges.map((z) => z.toFixed(4)).join(', ')} m nas colunas x = ${columns.join(', ')} (a geometria dá ${expected.toFixed(4)}; maior erro ${(1000 * worst).toFixed(1)} mm; maior degrau entre colunas ${(1000 * step).toFixed(1)} mm)`,
    );
    check(
        edges.every((z) => Math.abs(z - expected) <= LOCAL_EDGE),
        `${name}: borda a ${(1000 * worst).toFixed(1)} mm da posição geométrica`,
    );
    check(
        step <= 0.01,
        `${name}: degrau de ${(1000 * step).toFixed(1)} mm na borda entre as faces`,
    );
    // Sem emenda: ao longo das linhas que cruzam a aresta das faces (x = 2), no chão aceso (z = 1) e na sombra
    // (z = 0,35), a fração da luz não muda ao cruzar — 1 e 0 dos dois lados, pixel a pixel.
    let seamLit = 0;
    let seamDark = 0;
    const from = topPixel(1.7, 0, LOCAL_VIEW, LOCAL_W, LOCAL_H)[0];
    const to = topPixel(2.3, 0, LOCAL_VIEW, LOCAL_W, LOCAL_H)[0];
    const litRow = topPixel(0, 1, LOCAL_VIEW, LOCAL_W, LOCAL_H)[1];
    const darkRow = topPixel(0, 0.35, LOCAL_VIEW, LOCAL_W, LOCAL_H)[1];
    for (let x = from; x <= to; x++) {
        seamLit = Math.max(seamLit, Math.abs((localFraction(shadowed, plain, x, litRow) ?? 0) - 1));
        seamDark = Math.max(seamDark, Math.abs(localFraction(shadowed, plain, x, darkRow) ?? 1));
    }
    // A outra aresta (z = 2, entre a face de baixo e a face +z), no chão aceso, ao longo de z.
    let seamOther = 0;
    const column = topPixel(0.7, 0, LOCAL_VIEW, LOCAL_W, LOCAL_H)[0];
    for (
        let y = topPixel(0, 1.8, LOCAL_VIEW, LOCAL_W, LOCAL_H)[1];
        y < Math.min(LOCAL_H, topPixel(0, 1.99, LOCAL_VIEW, LOCAL_W, LOCAL_H)[1] + 1);
        y++
    )
        seamOther = Math.max(
            seamOther,
            Math.abs((localFraction(shadowed, plain, column, y) ?? 0) - 1),
        );
    log(
        `${name}: cruzando a aresta das faces em x = 2 (de 1,7 a 2,3 m) — maior desvio no chão aceso ${(100 * seamLit).toFixed(3)} %, na sombra ${(100 * seamDark).toFixed(3)} %; junto à aresta em z = 2, ${(100 * seamOther).toFixed(3)} %`,
    );
    check(seamLit <= 0.01, `${name}: emenda no chão aceso (${(100 * seamLit).toFixed(3)} %)`);
    check(seamDark <= 0.01, `${name}: emenda na sombra (${(100 * seamDark).toFixed(3)} %)`);
    check(
        seamOther <= 0.01,
        `${name}: emenda junto à aresta em z = 2 (${(100 * seamOther).toFixed(3)} %)`,
    );
}

/**
 * O alvo HDR dos casos `spot-travel` e `point-travel`: as esferas sobre o chão (a cena do `sun-travel`) sob uma luz
 * local com sombra que anda 1 cm por quadro em x até o lugar final — com `moving`, `frames` quadros de caminho; sem
 * ele, parada no lugar final.
 */
async function localTravelImage(
    kind: 'spot' | 'point',
    moving: boolean,
    frames: number,
): Promise<HdrImage> {
    const { app, canvas } = await createApp(640, 400);
    noAmbient(app);
    app.world.insert(
        new Camera({ fov: Math.PI / 3, near: 0.1, far: 40 }).add(
            new Transform({
                position: [0, 3.5, 7, 1],
                rotation: Transform.lookRotation([0, 3.5, 7], [0, 0, 0], [0, 1, 0]),
            }),
        ),
    );
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform())
            .add(new MaterialFunction({ code: DIFFUSE_ONLY, lobes: ['diffuse'] })),
    );
    const position = (left: number): [number, number, number, number] => [
        0.5 - (moving ? 0.01 * left : 0),
        LOCAL_TRAVEL_HEIGHT,
        0.8,
        1,
    ];
    const light =
        kind === 'spot'
            ? new SpotLight({
                  position: position(frames),
                  direction: [-0.1, -1, -0.15, 0],
                  innerCone: 0.7,
                  outerCone: 0.9,
                  intensity: LOCAL_TRAVEL_INTENSITY,
                  range: 20,
                  castShadow: true,
              })
            : new PointLight({
                  position: position(frames),
                  intensity: LOCAL_TRAVEL_INTENSITY,
                  range: 20,
                  castShadow: true,
              });
    app.world.insert(light);
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * Math.PI;
        const r = 1.2 + 0.9 * (i % 3);
        app.world.insert(
            new SphereGeometry({ radius: 0.35 })
                .add(new StandardMaterial({ albedo: [0.6, 0.6, 0.6, 1] }))
                .add(new Transform({ position: [r * Math.cos(a), 0.35, r * Math.sin(a), 1] })),
        );
    }
    await settle(app, 600);
    for (let i = 1; i <= frames; i++) {
        if (moving) light.data.position = position(frames - i);
        if (i > 1) await nextGpuFrame(app);
        app.step(1 / 60);
    }
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    const hdr = await readHdrTexture(app, texture);
    dispose(app, canvas);
    return hdr;
}

/** A altura e a intensidade da luz local dos casos de movimento. */
const LOCAL_TRAVEL_HEIGHT = 4;
const LOCAL_TRAVEL_INTENSITY = 40;

/** A luz local andando a cada quadro contra a parada no lugar final (SC-002). */
async function localTravel(kind: 'spot' | 'point'): Promise<void> {
    const name = `${kind}-travel`;
    const still = await localTravelImage(kind, false, 60);
    // O chão aceso sob a luz (a pino, à altura dela): a escala das diferenças.
    const lit = LOCAL_TRAVEL_INTENSITY / (LOCAL_TRAVEL_HEIGHT * LOCAL_TRAVEL_HEIGHT) / Math.PI;
    // A cena tem sombra: parte do chão aceso sob a luz está escura (abaixo de um décimo dele) na imagem parada.
    let shaded = 0;
    for (let i = 0; i < still.width * still.height; i++)
        if (still.data[i * 4]! > 0 && still.data[i * 4]! < 0.1 * lit) shaded++;
    for (const frames of [180, 177]) {
        const moving = await localTravelImage(kind, true, frames);
        let sum = 0;
        let wrong = 0;
        const n = still.width * still.height;
        for (let i = 0; i < n; i++) {
            const e = Math.abs(moving.data[i * 4]! - still.data[i * 4]!) / lit;
            sum += e;
            if (e > 0.25) wrong++;
        }
        const mean = sum / n;
        const far = wrong / n;
        log(
            `${name}: a luz andando 1 cm por quadro, ${frames} quadros — diferença média ${(100 * mean).toFixed(4)} % do chão aceso; ${(100 * far).toFixed(4)} % dos pixels a mais de 25 %`,
        );
        check(
            mean <= 0.0005 && far <= 0.0005,
            `${name}: ${frames} quadros — a sombra da luz que anda difere da parada: média ${(100 * mean).toFixed(4)} %, ${(100 * far).toFixed(4)} % dos pixels a mais de 25 %`,
        );
    }
    log(`${name}: ${shaded} pixels do chão na sombra na imagem parada`);
    check(shaded > 500, `${name}: a cena não tem sombra para comparar (${shaded} pixels)`);
}

async function caseSpotTravel(): Promise<void> {
    await localTravel('spot');
}

async function casePointTravel(): Promise<void> {
    await localTravel('point');
}

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('LIGHTING SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

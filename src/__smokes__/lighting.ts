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
//     luz parada.
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

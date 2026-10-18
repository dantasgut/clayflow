// Spec 011 — Smoke dos materiais por nós (US3, SC-008; a US5 acrescenta a galeria e a composição da biblioteca).
//
// Cada caso monta uma cena pequena com câmera ortográfica de frente e lê a radiância linear do alvo HDR. Casos:
//   - layer-two-highlights: dielétrico liso em camada sobre uma base com realce largo — dois realces e a base atenuada;
//   - transmission-refraction: o padrão atrás de uma placa inclinada aparece deslocado; Fresnel rasante; Beer-Lambert
//     pela espessura (razão entre duas placas);
//   - transmission-dispersion: bordas refratadas com separação de cores pelo número de Abbe (e sem ela, sem Abbe);
//   - translucent-backlit: parede fina iluminada por trás deixa a luz passar (o difuso não);
//   - sheen-rim: o brilho de fibra deixa a borda mais clara que o centro;
//   - anisotropy-rotate: o realce anisotrópico se alonga perpendicular à tangente (do nó de tangente pelo uv) e gira com
//     ela;
//   - thin-film-angle: a cor do filme fino muda com o ângulo;
//   - subsurface-terminator: a subsuperfície passa da linha de sombra, mais no vermelho;
//   - emission-hdr: emissão acima de 1 chega ao HDR sem corte;
//   - closure-mix: mistura por máscara contínua; dois especulares fundidos pela regra (α² médio);
//   - graph-specialization: grafo difuso + especular custa o mesmo que o material pronto; 60 s mudando valores sem
//     recompilar; religar recompila sem quadro sem o objeto;
//   - material-fn-compat: a função da 009 (`SurfaceParams`) desenha igual ao material pronto;
//   - transmission-layers: vidro atrás de vidro aparece; IOR 1 é invisível;
//   - sanitize: fechamento com NaN não chega ao HDR.
// Para rodar: `npm run smoke -- materials [--query case=closure-mix]`. Resultado: `MATERIALS SMOKE PASSED` ou `FAIL: …`.
import {
    BoxGeometry,
    DirectionalLight,
    MaterialFunction,
    NodeGraph,
    nodes,
    PlaneGeometry,
    PointLight,
    SphereGeometry,
    StandardMaterial,
    Transform,
} from 'clayflow';
import type { Application, LobeName } from 'clayflow';
import { capture } from './support/extensionScenes';
import { hdrAt, type HdrImage } from './support/imageMeasures';
import { gpuFrameTimes, median } from './support/gpuTiming';
import {
    closureFn,
    disposeApp,
    frontCamera,
    frontPixel,
    materialApp,
    materialGraph,
    renderHdr,
} from './support/materialScenes';

function log(msg: string): void {
    console.log(`[materials] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

const lum = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

/** Sem a luz ambiente: só as luzes da cena (e a emissão) iluminam. */
function noAmbient(app: Application): void {
    app.world.remove(app.defaults.ambient);
}

/** Esfera de malha fina com o material dado. */
function sphere(app: Application, x: number, y: number, r: number, fn: MaterialFunction): void {
    app.world.insert(
        new SphereGeometry({ radius: r, latSegments: 96, lonSegments: 192 })
            .add(new StandardMaterial())
            .add(new Transform({ position: [x, y, 0, 1] }))
            .add(fn),
    );
}

/** Fundo emissivo de listras verticais pretas e brancas (período `period`), em z = −2, independente da luz. */
function stripes(app: Application, period: number, luminance = 1): void {
    app.world.insert(
        new PlaneGeometry({ size: [20, 20] })
            .add(new StandardMaterial())
            .add(
                new Transform({
                    position: [0, 0, -2, 1],
                    rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
                }),
            )
            .add(
                closureFn(
                    `let k = step(0.5, fract(s.world_position.x / data.period));
    return closure_emission(vec3f(1.0), data.l * k);`,
                    ['emission'],
                    { period: 'f32', l: 'f32' },
                    { period, l: luminance },
                ),
            ),
    );
}

/** Perfil de luminância ao longo da linha `y` entre `x0` e `x1` (pixels). */
function profile(img: HdrImage, y: number, x0: number, x1: number): number[] {
    const out: number[] = [];
    for (let x = x0; x < x1; x++) out.push(lum(hdrAt(img, x, y)));
    return out;
}

/** Posições (subpixel) onde o canal `ch` cruza `level` ao longo da linha `y`. */
function crossings(
    img: HdrImage,
    y: number,
    x0: number,
    x1: number,
    ch: number,
    level: number,
): number[] {
    const out: number[] = [];
    for (let x = x0; x < x1 - 1; x++) {
        const a = hdrAt(img, x, y)[ch]!;
        const b = hdrAt(img, x + 1, y)[ch]!;
        if ((a - level) * (b - level) < 0) out.push(x + (level - a) / (b - a));
    }
    return out;
}

// ── Camadas ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function caseLayer(): Promise<void> {
    const W = 600;
    const H = 200;
    const height = 2;
    const { app, canvas } = await materialApp(W, H, engineErrors);
    noAmbient(app);
    frontCamera(app, height);
    const l = [0.35, 0.3, 1];
    app.world.insert(
        new DirectionalLight({ direction: [-l[0]!, -l[1]!, -l[2]!, 0], intensity: 3 }),
    );
    const base = `closure_add(closure_diffuse(vec3f(0.5, 0.3, 0.15), 1.0), closure_dielectric(1.5, vec3f(1.0), 0.45, 0.0, vec3f(0.0)))`;
    const coat = `closure_dielectric(1.5, vec3f(1.0), 0.04, 0.0, vec3f(0.0))`;
    sphere(app, -2, 0, 0.8, closureFn(`return ${base};`, ['diffuse', 'specular']));
    sphere(
        app,
        0,
        0,
        0.8,
        closureFn(
            `return closure_layer(${coat}, closure_diffuse(vec3f(0.5, 0.3, 0.15), 1.0), vec3f(1.0), 1.0);`,
            ['diffuse', 'specular', 'coat'],
        ),
    );
    sphere(
        app,
        2,
        0,
        0.8,
        closureFn(`return closure_layer(${coat}, ${base}, vec3f(1.0), 1.0);`, [
            'diffuse',
            'specular',
            'coat',
        ]),
    );
    const img = await renderHdr(app);
    disposeApp(app, canvas);
    // Centro do realce: a normal na meia direção entre a luz e o observador (+z).
    const len = Math.hypot(l[0]!, l[1]!, l[2]! + 1);
    const hx = l[0]! / len;
    const hy = l[1]! / len;
    const peakOf = (cx: number) => {
        const [px, py] = frontPixel(cx + 0.8 * hx, 0.8 * hy, height, W, H);
        const p = profile(img, py, px - 40, px + 40);
        return { p, center: 40 };
    };
    const [a, b, c] = [-2, 0, 2].map(peakOf);
    // Largura do realce: pixels acima da metade do excesso sobre o difuso (as pontas do perfil).
    const width = (p: readonly number[]): number => {
        const floor = Math.min(p[0]!, p[p.length - 1]!);
        const top = Math.max(...p);
        return p.filter((v) => v - floor > (top - floor) / 2).length;
    };
    const wa = width(a!.p);
    const wb = width(b!.p);
    const d = 14; // fora do realce nítido, dentro do largo
    const broadC = c!.p[c!.center + d]!;
    const broadB = b!.p[b!.center + d]!;
    const peakC = Math.max(...c!.p);
    log(
        `layer-two-highlights: largura do realce — base ${wa} px, verniz ${wb} px; no verniz sobre a base, pico ${peakC.toFixed(3)} e a ${d} px ${broadC.toFixed(3)} (verniz sobre difuso ${broadB.toFixed(3)})`,
    );
    check(
        wb * 3 <= wa,
        `layer-two-highlights: o realce do verniz não é nítido (${wb} px × ${wa} px)`,
    );
    check(peakC > 2 * broadC, 'layer-two-highlights: falta o realce nítido de cima');
    check(broadC > 1.1 * broadB, 'layer-two-highlights: falta o realce largo de baixo');
    // A base sob o verniz é atenuada pelo que ele reflete (na região só difusa, longe dos realces).
    const [dx, dy] = frontPixel(-2 - 0.5, -0.3, height, W, H);
    const [lx, ly] = frontPixel(2 - 0.5, -0.3, height, W, H);
    const ratio = lum(hdrAt(img, lx, ly)) / lum(hdrAt(img, dx, dy));
    log(
        `layer-two-highlights: base sob o verniz / base sozinha na região difusa = ${ratio.toFixed(3)}`,
    );
    check(ratio < 1 && ratio > 0.85, `layer-two-highlights: atenuação da base fora (${ratio})`);
}

// ── Transmissão ──────────────────────────────────────────────────────────────────────────────────────────────────

const GLASS_CODE = `return closure_add(
        closure_dielectric(data.ior, vec3f(1.0), data.rough, 0.0, vec3f(0.0)),
        closure_transmission(data.ior, data.color, data.depth, data.abbe, data.rough),
    );`;

function glassFn(ior: number, color = [1, 1, 1], depth = 0, abbe = 0, rough = 0): MaterialFunction {
    return closureFn(
        GLASS_CODE,
        ['specular', 'transmission'],
        {
            ior: 'f32',
            color: 'vec3f',
            depth: 'f32',
            abbe: 'f32',
            rough: 'f32',
        },
        { ior, color, depth, abbe, rough },
    );
}

/** Placa de vidro (caixa fina) girada `angle` em torno de y. */
function slab(
    app: Application,
    x: number,
    thickness: number,
    angle: number,
    fn: MaterialFunction,
): void {
    app.world.insert(
        new BoxGeometry({ size: [1.2, 1.2, thickness] })
            .add(new StandardMaterial())
            .add(
                new Transform({
                    position: [x, 0, 0, 1],
                    rotation: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
                }),
            )
            .add(fn),
    );
}

async function caseRefraction(): Promise<void> {
    const W = 600;
    const H = 200;
    const height = 2;
    // Deslocamento: o padrão através da placa inclinada × sem placa.
    const shots: HdrImage[] = [];
    for (const withGlass of [false, true]) {
        const { app, canvas } = await materialApp(W, H, engineErrors);
        noAmbient(app);
        frontCamera(app, height);
        stripes(app, 0.25);
        if (withGlass) slab(app, 0, 0.4, Math.PI / 6, glassFn(1.5));
        shots.push(await renderHdr(app));
        disposeApp(app, canvas);
    }
    const y = H / 2;
    const [x0] = frontPixel(-0.3, 0, height, W, H);
    const [x1] = frontPixel(0.3, 0, height, W, H);
    // Deslocamento: o desvio que melhor alinha o perfil através da placa ao perfil sem ela (correlação).
    const pa = profile(shots[0]!, y, x0, x1);
    const pb = profile(shots[1]!, y, x0, x1);
    const top = Math.max(...pb, 1e-6);
    let avg = 0;
    let best = Infinity;
    for (let d = -40; d <= 40; d++) {
        let e = 0;
        let n = 0;
        for (let k = 0; k < pb.length; k++) {
            const q = pa[k - d];
            if (q === undefined) continue;
            e += (pb[k]! / top - q) ** 2;
            n++;
        }
        if (n > pb.length / 2 && e / n < best) {
            best = e / n;
            avg = d;
        }
    }
    log(
        `transmission-refraction: o padrão através da placa inclinada (30°, IOR 1,5) aparece deslocado ${avg} px`,
    );
    check(
        Number.isFinite(avg) && Math.abs(avg) > 1,
        `transmission-refraction: o padrão não se deslocou (${avg} px)`,
    );

    // Fresnel rasante: esfera de vidro sobre fundo preto num hemisfério branco — a borda reflete mais que o centro.
    {
        const { app, canvas } = await materialApp(200, 200, engineErrors);
        frontCamera(app, 2.2);
        app.defaults.ambient.data.skyColor = [1, 1, 1, 1];
        app.defaults.ambient.data.groundColor = [1, 1, 1, 1];
        app.defaults.ambient.data.intensity = 1;
        app.world.insert(
            new PlaneGeometry({ size: [20, 20] })
                .add(new StandardMaterial())
                .add(
                    new Transform({
                        position: [0, 0, -3, 1],
                        rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
                    }),
                )
                .add(closureFn('return closure_emission(vec3f(0.0), 0.0);', ['emission'])),
        );
        sphere(app, 0, 0, 1, glassFn(1.5));
        const img = await renderHdr(app);
        disposeApp(app, canvas);
        const center = lum(hdrAt(img, 100, 100));
        const rim = lum(hdrAt(img, 100 + Math.round(0.97 * 90.9), 100));
        log(
            `transmission-refraction: Fresnel — centro ${center.toFixed(3)}, borda ${rim.toFixed(3)}`,
        );
        check(
            rim > 4 * center,
            `transmission-refraction: a borda não reflete mais que o centro (${rim} × ${center})`,
        );
    }

    // Beer-Lambert: placas de 0,25 e 0,5 com a cor 0,5 a 0,25 de percurso — razão 0,5 entre as duas.
    {
        const { app, canvas } = await materialApp(W, H, engineErrors);
        noAmbient(app);
        frontCamera(app, height);
        app.world.insert(
            new PlaneGeometry({ size: [20, 20] })
                .add(new StandardMaterial())
                .add(
                    new Transform({
                        position: [0, 0, -2, 1],
                        rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
                    }),
                )
                .add(closureFn('return closure_emission(vec3f(1.0), 1.0);', ['emission'])),
        );
        slab(app, -1, 0.25, 0, glassFn(1.5, [0.5, 0.5, 0.5], 0.25));
        slab(app, 1, 0.5, 0, glassFn(1.5, [0.5, 0.5, 0.5], 0.25));
        const img = await renderHdr(app);
        disposeApp(app, canvas);
        const [ax, ay] = frontPixel(-1, 0, height, W, H);
        const [bx, by] = frontPixel(1, 0, height, W, H);
        const thin = lum(hdrAt(img, ax, ay));
        const thick = lum(hdrAt(img, bx, by));
        const ratio = thick / thin;
        log(
            `transmission-refraction: Beer-Lambert — placa fina ${thin.toFixed(4)}, grossa ${thick.toFixed(4)}, razão ${ratio.toFixed(4)} (esperado 0,5)`,
        );
        check(
            Math.abs(ratio - 0.5) <= 0.5 * 0.03,
            `transmission-refraction: Beer-Lambert com razão ${ratio}`,
        );
    }
}

async function caseDispersion(): Promise<void> {
    const W = 600;
    const H = 200;
    const height = 2;
    const separation: number[] = [];
    for (const abbe of [0, 40, 18]) {
        const { app, canvas } = await materialApp(W, H, engineErrors);
        noAmbient(app);
        frontCamera(app, height);
        stripes(app, 0.5);
        slab(app, 0, 0.6, Math.PI / 5, glassFn(1.7, [1, 1, 1], 0, abbe));
        const img = await renderHdr(app);
        disposeApp(app, canvas);
        const [x0] = frontPixel(-0.3, 0, height, W, H);
        const [x1] = frontPixel(0.3, 0, height, W, H);
        const r = crossings(img, H / 2, x0, x1, 0, 0.5);
        const b = crossings(img, H / 2, x0, x1, 2, 0.5);
        const n = Math.min(r.length, b.length);
        let worst = 0;
        for (let k = 0; k < n; k++) worst = Math.max(worst, Math.abs(r[k]! - b[k]!));
        separation.push(worst);
    }
    log(
        `transmission-dispersion: separação vermelho–azul nas bordas — sem dispersão ${separation[0]!.toFixed(2)} px, Abbe 40 ${separation[1]!.toFixed(2)} px, Abbe 18 ${separation[2]!.toFixed(2)} px`,
    );
    check(
        separation[0]! < 0.3,
        `transmission-dispersion: cores separadas sem dispersão (${separation[0]} px)`,
    );
    check(
        separation[2]! > separation[1]! && separation[1]! > separation[0]! + 0.1,
        'transmission-dispersion: a separação não cresce quando o número de Abbe cai',
    );
}

async function caseTranslucent(): Promise<void> {
    const W = 400;
    const H = 200;
    const height = 2;
    const { app, canvas } = await materialApp(W, H, engineErrors);
    noAmbient(app);
    frontCamera(app, height);
    // Luz atrás das placas, apontando para a câmera.
    app.world.insert(new DirectionalLight({ direction: [0, 0, 1, 0], intensity: 3 }));
    const plate = (x: number, fn: MaterialFunction) =>
        app.world.insert(
            new PlaneGeometry({ size: [1.4, 1.4] })
                .add(new StandardMaterial())
                .add(
                    new Transform({
                        position: [x, 0, 0, 1],
                        rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
                    }),
                )
                .add(fn),
        );
    plate(-1, closureFn('return closure_translucent(vec3f(1.0, 0.8, 0.6));', ['translucent']));
    plate(1, closureFn('return closure_diffuse(vec3f(1.0, 0.8, 0.6), 0.0);', ['diffuse']));
    const img = await renderHdr(app);
    disposeApp(app, canvas);
    const [ax, ay] = frontPixel(-1, 0, height, W, H);
    const [bx, by] = frontPixel(1, 0, height, W, H);
    const thin = hdrAt(img, ax, ay);
    const diffuse = lum(hdrAt(img, bx, by));
    log(
        `translucent-backlit: parede fina contraluz ${thin.map((v) => v.toFixed(3)).join(', ')}; difuso ${diffuse.toFixed(4)}`,
    );
    check(lum(thin) > 0.3, `translucent-backlit: a luz de trás não atravessou (${lum(thin)})`);
    check(thin[0] > thin[2], 'translucent-backlit: a cor da parede fina não tingiu a luz');
    check(diffuse < 0.02, `translucent-backlit: o difuso deixou passar luz de trás (${diffuse})`);
}

async function caseSheen(): Promise<void> {
    const W = 400;
    const H = 200;
    const height = 2;
    const { app, canvas } = await materialApp(W, H, engineErrors);
    noAmbient(app);
    frontCamera(app, height);
    app.world.insert(new DirectionalLight({ direction: [0, 0, -1, 0], intensity: 3 }));
    sphere(
        app,
        -1,
        0,
        0.8,
        closureFn(
            'return closure_add(closure_diffuse(vec3f(0.04), 0.0), closure_sheen(vec3f(1.0), 0.3));',
            ['diffuse', 'sheen'],
        ),
    );
    sphere(app, 1, 0, 0.8, closureFn('return closure_diffuse(vec3f(0.5), 0.0);', ['diffuse']));
    const img = await renderHdr(app);
    disposeApp(app, canvas);
    const ratio = (cx: number): number => {
        const [x, y] = frontPixel(cx, 0, height, W, H);
        const r = Math.round((0.8 / height) * H);
        return lum(hdrAt(img, x + Math.round(0.95 * r), y)) / lum(hdrAt(img, x, y));
    };
    const velvet = ratio(-1);
    const matte = ratio(1);
    log(`sheen-rim: borda/centro — veludo ${velvet.toFixed(2)}, difuso ${matte.toFixed(2)}`);
    check(velvet > 1.3, `sheen-rim: a borda do veludo não brilha mais que o centro (${velvet})`);
    check(matte < 1, `sheen-rim: referência difusa com borda mais clara (${matte})`);
}

// ── Anisotropia, filme fino, subsuperfície, emissão ─────────────────────────────────────────────────────────────

async function caseAnisotropy(): Promise<void> {
    const W = 400;
    const H = 200;
    const height = 2;
    const { app, canvas } = await materialApp(W, H, engineErrors);
    noAmbient(app);
    frontCamera(app, height);
    const graph = (rotated: boolean) =>
        materialGraph(
            {
                t: nodes.geometry.tangentUv,
                ...(rotated
                    ? { n: nodes.math.value3.with({ value: [0, 0, 1] }), r: nodes.math.cross }
                    : {}),
                metal: nodes.bsdf.conductor.with({
                    color: [0.95, 0.93, 0.88],
                    roughness: 0.35,
                    anisotropy: 0.8,
                }),
            },
            rotated
                ? [
                      ['n.value', 'r.a'],
                      ['t.value', 'r.b'],
                      ['r.value', 'metal.tangent'],
                  ]
                : [['t.value', 'metal.tangent']],
            'metal.value',
        );
    for (const [x, rotated] of [
        [-1, false],
        [1, true],
    ] as const) {
        app.world.insert(
            new PlaneGeometry({ size: [1.8, 1.8] })
                .add(new StandardMaterial())
                .add(
                    new Transform({
                        position: [x, 0, 0, 1],
                        rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
                    }),
                )
                .add(graph(rotated)),
        );
        app.world.insert(new PointLight({ position: [x, 0, 0.6, 1], intensity: 2, range: 5 }));
    }
    const img = await renderHdr(app);
    disposeApp(app, canvas);
    const moments = (cx: number): { xx: number; yy: number } => {
        const [px, py] = frontPixel(cx, 0, height, W, H);
        const r = 80;
        let peak = 0;
        for (let y = py - r; y < py + r; y++)
            for (let x = px - r; x < px + r; x++) peak = Math.max(peak, lum(hdrAt(img, x, y)));
        let w = 0;
        let xx = 0;
        let yy = 0;
        for (let y = py - r; y < py + r; y++)
            for (let x = px - r; x < px + r; x++) {
                const v = lum(hdrAt(img, x, y));
                if (v < peak / 2) continue;
                w += v;
                xx += v * (x - px) ** 2;
                yy += v * (y - py) ** 2;
            }
        return { xx: xx / w, yy: yy / w };
    };
    const a = moments(-1);
    const b = moments(1);
    const ea = a.yy / a.xx;
    const eb = b.xx / b.yy;
    log(
        `anisotropy-rotate: tangente u (x) → alongamento vertical ${ea.toFixed(2)}×; tangente girada 90° → horizontal ${eb.toFixed(2)}×`,
    );
    check(ea > 1.8, `anisotropy-rotate: o realce não se alonga perpendicular à tangente (${ea})`);
    check(eb > 1.8, `anisotropy-rotate: girar a tangente não girou o realce (${eb})`);
}

async function caseThinFilm(): Promise<void> {
    const W = 200;
    const H = 200;
    const { app, canvas } = await materialApp(W, H, engineErrors);
    frontCamera(app, 2.2);
    app.defaults.ambient.data.skyColor = [1, 1, 1, 1];
    app.defaults.ambient.data.groundColor = [1, 1, 1, 1];
    app.defaults.ambient.data.intensity = 1;
    sphere(
        app,
        0,
        0,
        1,
        closureFn(
            'return closure_thin_film(closure_add(closure_diffuse(vec3f(0.0), 0.0), closure_dielectric(1.5, vec3f(1.0), 0.05, 0.0, vec3f(0.0))), 400.0, 1.33);',
            ['diffuse', 'specular', 'thinFilm'],
        ),
    );
    const img = await renderHdr(app);
    disposeApp(app, canvas);
    const chroma = (x: number): number[] => {
        const c = hdrAt(img, x, 100);
        const s = c[0] + c[1] + c[2];
        return [c[0] / s, c[1] / s, c[2] / s];
    };
    const center = chroma(100);
    const edge = chroma(100 + Math.round(0.85 * 90.9));
    const shift = Math.hypot(center[0]! - edge[0]!, center[1]! - edge[1]!, center[2]! - edge[2]!);
    log(
        `thin-film-angle: cromaticidade centro (${center.map((v) => v.toFixed(3)).join(', ')}) × borda (${edge.map((v) => v.toFixed(3)).join(', ')}) — distância ${shift.toFixed(3)}`,
    );
    check(shift > 0.05, `thin-film-angle: a cor não muda com o ângulo (${shift})`);
}

async function caseSubsurface(): Promise<void> {
    const W = 400;
    const H = 200;
    const height = 2;
    const { app, canvas } = await materialApp(W, H, engineErrors);
    noAmbient(app);
    frontCamera(app, height);
    app.world.insert(new DirectionalLight({ direction: [-1, 0, 0, 0], intensity: 3 }));
    sphere(
        app,
        -1,
        0,
        0.8,
        closureFn('return closure_subsurface(vec3f(0.9, 0.6, 0.45), vec3f(1.0, 0.4, 0.2));', [
            'subsurface',
        ]),
    );
    sphere(
        app,
        1,
        0,
        0.8,
        closureFn('return closure_diffuse(vec3f(0.9, 0.6, 0.45), 0.0);', ['diffuse']),
    );
    const img = await renderHdr(app);
    disposeApp(app, canvas);
    // Do lado escuro: n·l = −0,2 (x = −0,2 R do centro, na linha do meio).
    const at = (cx: number) => {
        const [x, y] = frontPixel(cx - 0.2 * 0.8, 0, height, W, H);
        return hdrAt(img, x, y);
    };
    const sss = at(-1);
    const diffuse = at(1);
    log(
        `subsurface-terminator: em n·l = −0,2 — subsuperfície (${sss.map((v) => v.toFixed(3)).join(', ')}), difuso (${diffuse.map((v) => v.toFixed(3)).join(', ')})`,
    );
    check(sss[0] > 0.02, `subsurface-terminator: a luz não passou da linha de sombra (${sss[0]})`);
    check(
        sss[0] > sss[1] && sss[1] > sss[2],
        'subsurface-terminator: a transição não é na cor do espalhamento (vermelho > verde > azul)',
    );
    check(
        lum(diffuse) < 1e-3,
        `subsurface-terminator: difuso com luz no lado escuro (${lum(diffuse)})`,
    );
}

async function caseEmission(): Promise<void> {
    const { app, canvas } = await materialApp(100, 100, engineErrors);
    noAmbient(app);
    frontCamera(app, 2);
    app.world.insert(
        new PlaneGeometry({ size: [4, 4] })
            .add(new StandardMaterial())
            .add(new Transform({ rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)] }))
            .add(
                materialGraph(
                    { e: nodes.bsdf.emission.with({ color: [1, 0.5, 0.25], luminance: 5 }) },
                    [],
                    'e.value',
                ),
            ),
    );
    const img = await renderHdr(app);
    disposeApp(app, canvas);
    const c = hdrAt(img, 50, 50);
    log(`emission-hdr: (${c.map((v) => v.toFixed(3)).join(', ')}) — esperado (5, 2,5, 1,25)`);
    check(
        Math.abs(c[0] - 5) / 5 < 0.01 && Math.abs(c[1] - 2.5) / 2.5 < 0.01,
        `emission-hdr: emissão ${c.join(', ')}`,
    );
}

// ── Composição e especialização ─────────────────────────────────────────────────────────────────────────────────

async function caseMix(): Promise<void> {
    const W = 400;
    const H = 100;
    const height = 1;
    {
        const { app, canvas } = await materialApp(W, H, engineErrors);
        noAmbient(app);
        frontCamera(app, height);
        app.world.insert(new DirectionalLight({ direction: [0, 0, -1, 0], intensity: Math.PI }));
        app.world.insert(
            new PlaneGeometry({ size: [8, 8] })
                .add(new StandardMaterial())
                .add(
                    new Transform({
                        rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
                    }),
                )
                .add(
                    closureFn(
                        'return closure_mix(closure_diffuse(vec3f(1.0, 0.0, 0.0), 0.0), closure_diffuse(vec3f(0.0, 0.0, 1.0), 0.0), clamp(s.world_position.x * 0.5 + 0.5, 0.0, 1.0));',
                        ['diffuse'],
                    ),
                ),
        );
        const img = await renderHdr(app);
        disposeApp(app, canvas);
        let worst = 0;
        let monotone = true;
        for (let x = 1; x < W; x++) {
            const a = hdrAt(img, x - 1, H / 2);
            const b = hdrAt(img, x, H / 2);
            worst = Math.max(worst, Math.abs(b[0] - a[0]), Math.abs(b[2] - a[2]));
            if (b[0] > a[0] + 1e-4 || b[2] < a[2] - 1e-4) monotone = false;
        }
        const left = hdrAt(img, 0, H / 2);
        const right = hdrAt(img, W - 1, H / 2);
        log(
            `closure-mix: máscara contínua — maior passo ${worst.toFixed(4)}, ${monotone ? 'monótona' : 'NÃO monótona'}; pontas (${left.map((v) => v.toFixed(3)).join(', ')}) e (${right.map((v) => v.toFixed(3)).join(', ')})`,
        );
        check(worst < 0.02 && monotone, `closure-mix: mistura descontínua (${worst})`);
    }
    {
        // Fusão: dois especulares (0,1 e 0,9) a 50 % = um especular de rugosidade (média de α²)^(1/4).
        const W2 = 400;
        const H2 = 200;
        const { app, canvas } = await materialApp(W2, H2, engineErrors);
        noAmbient(app);
        frontCamera(app, 2);
        app.world.insert(new DirectionalLight({ direction: [-0.3, -0.3, -1, 0], intensity: 3 }));
        const merged = Math.pow((0.1 ** 4 + 0.9 ** 4) / 2, 0.25);
        sphere(
            app,
            -1,
            0,
            0.8,
            closureFn(
                'return closure_mix(closure_dielectric(1.5, vec3f(1.0), 0.1, 0.0, vec3f(0.0)), closure_dielectric(1.5, vec3f(1.0), 0.9, 0.0, vec3f(0.0)), 0.5);',
                ['specular'],
            ),
        );
        sphere(
            app,
            1,
            0,
            0.8,
            closureFn(
                `return closure_dielectric(1.5, vec3f(1.0), ${merged.toFixed(8)}, 0.0, vec3f(0.0));`,
                ['specular'],
            ),
        );
        const img = await renderHdr(app);
        disposeApp(app, canvas);
        let worst = 0;
        const r = Math.round((0.75 / 2) * H2);
        const [ax, ay] = frontPixel(-1, 0, 2, W2, H2);
        const [bx] = frontPixel(1, 0, 2, W2, H2);
        for (let dy = -r; dy <= r; dy += 2)
            for (let dx = -r; dx <= r; dx += 2) {
                if (dx * dx + dy * dy > r * r) continue;
                const a = lum(hdrAt(img, ax + dx, ay + dy));
                const b = lum(hdrAt(img, bx + dx, ay + dy));
                worst = Math.max(worst, Math.abs(a - b) / Math.max(b, 0.01));
            }
        log(
            `closure-mix: fusão de dois especulares pela regra (α² médio → rugosidade ${merged.toFixed(3)}) — maior diferença ${(100 * worst).toFixed(2)} %`,
        );
        check(worst < 0.02, `closure-mix: a fusão não seguiu a regra documentada (${worst})`);
    }
}

/** Grafo difuso + especular (o mesmo que o material pronto). */
function plainGraph(color: [number, number, number]): NodeGraph {
    return new NodeGraph({
        nodes: {
            d: nodes.bsdf.diffuse.with({ color }),
            s: nodes.bsdf.dielectric.with({ ior: 1.5, roughness: 0.5 }),
            a: nodes.closure.add,
            out: nodes.output.closure,
        },
        links: [
            ['d.value', 'a.b'],
            ['s.value', 'a.a'],
            ['a.value', 'out.closure'],
        ],
        output: 'out.value',
    });
}

async function caseSpecialization(): Promise<void> {
    // Custo: 900 esferas, material pronto × grafo com os mesmos lobos.
    const gpu: number[] = [];
    for (const graph of [false, true]) {
        const { app, canvas } = await materialApp(640, 360, engineErrors, { profiling: true });
        app.world.insert(new DirectionalLight({ direction: [-0.4, -1, -0.6, 0], intensity: 3 }));
        frontCamera(app, 32);
        for (let i = 0; i < 900; i++) {
            const e = new SphereGeometry({ radius: 0.45, latSegments: 16, lonSegments: 32 })
                .add(new StandardMaterial({ albedo: [0.8, 0.5, 0.3, 1], roughness: 0.5 }))
                .add(
                    new Transform({ position: [(i % 30) - 14.5, Math.floor(i / 30) - 14.5, 0, 1] }),
                );
            if (graph) e.add(new MaterialFunction({ graph: plainGraph([0.8, 0.5, 0.3]) }));
            app.world.insert(e);
        }
        await renderHdr(app, 1, 1200);
        const samples = await gpuFrameTimes(app, 120);
        disposeApp(app, canvas);
        gpu.push(samples.count > 0 ? median(samples.times) : NaN);
    }
    const ratio = gpu[1]! / gpu[0]!;
    log(
        `graph-specialization: GPU por quadro (mediana) — pronto ${gpu[0]!.toFixed(3)} ms, grafo difuso + especular ${gpu[1]!.toFixed(3)} ms (×${ratio.toFixed(3)})`,
    );
    if (Number.isFinite(ratio))
        check(ratio <= 1.15, `graph-specialization: o grafo custa ×${ratio} o material pronto`);
    else
        log(
            'graph-specialization: sem consulta de tempo da GPU neste dispositivo — custo não medido',
        );

    // Valores mudando por 60 s simulados: nenhum pipeline novo. Religar: recompila sem quadro sem o objeto.
    const { app, canvas } = await materialApp(200, 200, engineErrors);
    app.world.insert(new DirectionalLight({ direction: [-0.4, -1, -0.6, 0], intensity: 3 }));
    frontCamera(app, 2);
    const fn = new MaterialFunction({ graph: plainGraph([0.8, 0.2, 0.2]) });
    app.world.insert(
        new SphereGeometry({ radius: 0.8 })
            .add(new StandardMaterial())
            .add(new Transform())
            .add(fn),
    );
    await renderHdr(app);
    const core = app.core as unknown as { create: (spec: { kind?: string }) => unknown };
    const create = core.create.bind(core);
    let pipelines = 0;
    core.create = (spec) => {
        if (spec.kind === 'pipeline' || spec.kind === 'shader') pipelines++;
        return create(spec);
    };
    for (let i = 0; i < 3600; i++) {
        fn.values.d_color = [0.5 + 0.5 * Math.sin(i / 30), 0.3, 0.2];
        fn.values.s_roughness = 0.2 + 0.6 * (0.5 + 0.5 * Math.cos(i / 40));
        app.step(1 / 60);
    }
    const valueCompiles = pipelines;
    // Religar: troca o difuso pelo veludo (topologia nova) e confere cada quadro até compilar.
    fn.setGraph(
        new NodeGraph({
            nodes: {
                d: nodes.bsdf.diffuse.with({ color: [0.1, 0.1, 0.4] }),
                v: nodes.bsdf.sheen,
                a: nodes.closure.add,
                out: nodes.output.closure,
            },
            links: [
                ['d.value', 'a.a'],
                ['v.value', 'a.b'],
                ['a.value', 'out.closure'],
            ],
            output: 'out.value',
        }),
    );
    let missing = 0;
    for (let i = 0; i < 40; i++) {
        app.step(1 / 60);
        const img = capture(canvas);
        const k = (100 * 200 + 100) * 4;
        if (img.data[k]! + img.data[k + 1]! + img.data[k + 2]! < 40) missing++;
        await new Promise((r) => setTimeout(r, 16));
    }
    core.create = create;
    disposeApp(app, canvas);
    log(
        `graph-specialization: 3600 quadros (60 s) mudando valores → ${valueCompiles} compilações; religar → ${pipelines - valueCompiles} compilações, ${missing} quadros sem o objeto`,
    );
    check(valueCompiles === 0, `graph-specialization: mudar valores recompilou (${valueCompiles})`);
    check(pipelines - valueCompiles > 0, 'graph-specialization: religar não recompilou');
    check(
        missing === 0,
        `graph-specialization: ${missing} quadros sem o objeto na troca de topologia`,
    );
}

async function caseCompat(): Promise<void> {
    const W = 400;
    const H = 200;
    const height = 2;
    const { app, canvas } = await materialApp(W, H, engineErrors);
    frontCamera(app, height);
    app.world.insert(new DirectionalLight({ direction: [-0.3, -0.5, -1, 0], intensity: 3 }));
    const albedo: [number, number, number, number] = [0.7, 0.35, 0.2, 1];
    app.world.insert(
        new SphereGeometry({ radius: 0.8, latSegments: 64, lonSegments: 128 })
            .add(new StandardMaterial({ albedo, roughness: 0.3, metallic: 0.4 }))
            .add(new Transform({ position: [-1, 0, 0, 1] })),
    );
    app.world.insert(
        new SphereGeometry({ radius: 0.8, latSegments: 64, lonSegments: 128 })
            .add(new StandardMaterial({ albedo, roughness: 0.3, metallic: 0.4 }))
            .add(new Transform({ position: [1, 0, 0, 1] }))
            .add(
                new MaterialFunction({
                    code: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    return SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0));
}`,
                }),
            ),
    );
    const img = await renderHdr(app);
    disposeApp(app, canvas);
    let worst = 0;
    const r = Math.round((0.75 / height) * H);
    const [ax, ay] = frontPixel(-1, 0, height, W, H);
    const [bx] = frontPixel(1, 0, height, W, H);
    for (let dy = -r; dy <= r; dy += 2)
        for (let dx = -r; dx <= r; dx += 2) {
            if (dx * dx + dy * dy > r * r) continue;
            const a = hdrAt(img, ax + dx, ay + dy);
            const b = hdrAt(img, bx + dx, ay + dy);
            for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(a[k]! - b[k]!));
        }
    log(
        `material-fn-compat: função da 009 × material pronto — maior diferença ${worst.toExponential(2)}`,
    );
    check(worst < 2e-3, `material-fn-compat: a função da 009 desenha diferente (${worst})`);
}

async function caseLayers(): Promise<void> {
    const W = 400;
    const H = 200;
    const height = 2;
    {
        const { app, canvas } = await materialApp(W, H, engineErrors);
        noAmbient(app);
        frontCamera(app, height);
        stripes(app, 0.2);
        // Vidro verde atrás e vidro claro na frente, sobrepostos na vista.
        app.world.insert(
            new SphereGeometry({ radius: 0.55, latSegments: 64, lonSegments: 128 })
                .add(new StandardMaterial())
                .add(new Transform({ position: [0.3, 0, -0.9, 1] }))
                .add(glassFn(1.5, [0.2, 0.8, 0.3], 0.3)),
        );
        sphere(app, -0.3, 0, 0.55, glassFn(1.5));
        const img = await renderHdr(app);
        disposeApp(app, canvas);
        // Pelo disco do vidro da frente (spec 034: a refração traçada; a lente desvia os raios — o que se vê por um
        // pixel é onde o raio refratado chega, que pode ser uma listra preta): a luz média sem buraco e o vidro verde
        // de trás visto através dele em parte do disco.
        const [cx, cy] = frontPixel(-0.3, 0, height, W, H);
        const radius = (0.55 / ((height * W) / H)) * W * 0.95;
        let total = 0;
        let green = 0;
        let count = 0;
        let finite = true;
        for (let dy = -radius; dy <= radius; dy++)
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy > radius * radius) continue;
                const c = hdrAt(img, Math.round(cx + dx), Math.round(cy + dy));
                finite &&= c.every((v) => Number.isFinite(v));
                total += lum(c);
                if (c[1] > 0.05 && c[1] > c[0] * 1.2) green++;
                count++;
            }
        const mean = total / Math.max(count, 1);
        log(
            `transmission-layers: pelo vidro da frente — luz média ${mean.toFixed(3)}, ${((100 * green) / count).toFixed(1)} % dos pixels verdes (o vidro de trás através dele)`,
        );
        check(finite && mean > 0.05, 'transmission-layers: buraco através dos dois vidros');
        check(
            green >= count * 0.02,
            'transmission-layers: o vidro de trás não aparece através do da frente',
        );
    }
    {
        const shots: HdrImage[] = [];
        for (const glass of [false, true]) {
            const { app, canvas } = await materialApp(W, H, engineErrors);
            noAmbient(app);
            frontCamera(app, height);
            stripes(app, 0.2);
            if (glass) sphere(app, 0, 0, 0.7, glassFn(1));
            shots.push(await renderHdr(app));
            disposeApp(app, canvas);
        }
        let worst = 0;
        let finite = true;
        const r = Math.round((0.6 / height) * H);
        const [cx, cy] = frontPixel(0, 0, height, W, H);
        for (let dy = -r; dy <= r; dy += 2)
            for (let dx = -r; dx <= r; dx += 2) {
                if (dx * dx + dy * dy > r * r) continue;
                const a = hdrAt(shots[0]!, cx + dx, cy + dy);
                const b = hdrAt(shots[1]!, cx + dx, cy + dy);
                if (!b.every((v) => Number.isFinite(v))) finite = false;
                worst = Math.max(worst, Math.abs(lum(a) - lum(b)));
            }
        log(`transmission-ior1: vidro de IOR 1 × fundo — maior diferença ${worst.toFixed(4)}`);
        check(finite, 'transmission-ior1: valor não finito com IOR 1');
        check(worst < 0.03, `transmission-ior1: o vidro de IOR 1 não é invisível (${worst})`);
    }
}

async function caseSanitize(): Promise<void> {
    const { app, canvas } = await materialApp(160, 160, engineErrors);
    frontCamera(app, 2);
    app.world.insert(new DirectionalLight({ direction: [-0.3, -0.5, -1, 0], intensity: 3 }));
    sphere(
        app,
        0,
        0,
        0.8,
        closureFn(
            `let bad = data.zero / data.zero;
    var c = closure_add(closure_diffuse(vec3f(bad), bad), closure_dielectric(bad, vec3f(1.0), bad, 0.0, vec3f(bad)));
    c.emission = vec3f(1.0 / data.zero, -5.0, bad);
    return c;`,
            ['diffuse', 'specular', 'emission'] as LobeName[],
            { zero: 'f32' },
            { zero: 0 },
        ),
    );
    const img = await renderHdr(app);
    disposeApp(app, canvas);
    let bad = 0;
    let max = 0;
    for (let i = 0; i < img.data.length; i++) {
        const v = img.data[i]!;
        if (!Number.isFinite(v)) bad++;
        else max = Math.max(max, v);
    }
    log(
        `sanitize: fechamento com NaN/∞/negativos → ${bad} valores não finitos no HDR (máximo ${max.toFixed(1)})`,
    );
    check(bad === 0, `sanitize: ${bad} valores não finitos no alvo HDR`);
}

const CASES: Record<string, () => Promise<void>> = {
    'layer-two-highlights': caseLayer,
    'transmission-refraction': caseRefraction,
    'transmission-dispersion': caseDispersion,
    'translucent-backlit': caseTranslucent,
    'sheen-rim': caseSheen,
    'anisotropy-rotate': caseAnisotropy,
    'thin-film-angle': caseThinFilm,
    'subsurface-terminator': caseSubsurface,
    'emission-hdr': caseEmission,
    'closure-mix': caseMix,
    'graph-specialization': caseSpecialization,
    'material-fn-compat': caseCompat,
    'transmission-layers': caseLayers,
    sanitize: caseSanitize,
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        try {
            await run();
        } catch (err) {
            failures.push(
                `${name}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
            );
        }
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('MATERIALS SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

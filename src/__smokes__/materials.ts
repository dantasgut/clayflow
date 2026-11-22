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
//   - sanitize: fechamento com NaN não chega ao HDR;
//   - gallery (US5): os 23 materiais prontos (`Materials.*`) em esferas sob a mesma luz, diante de uma parede xadrez —
//     madeira crua sem realce nítido e envernizada com realce nítido, veludo com a borda mais clara que o centro, metal
//     escovado com o realce alongado, vidro transparente com o xadrez refratado (`--query case=gallery&shot=1` grava o
//     quadro em `fixtures/zzGallery.png`);
//   - library-compose (US5): madeira crua e metal escovado (nós da biblioteca) misturados por ruído, e um material
//     pronto com a entrada da cor ligada a outro nó (xadrez).
// Para rodar: `npm run smoke -- materials [--query case=closure-mix]`. Resultado: `MATERIALS SMOKE PASSED` ou `FAIL: …`.
import {
    BoxGeometry,
    DirectionalLight,
    MaterialFunction,
    Materials,
    NodeGraph,
    nodes,
    PlaneGeometry,
    PointLight,
    SphereGeometry,
    StandardMaterial,
    Transform,
} from 'clayflow/web';
import type { Application, LobeName, MaterialName } from 'clayflow/web';
import { capture, nextGpuFrame } from './support/extensionScenes';
import { hdrAt, type HdrImage } from './support/imageMeasures';
import {
    closureFn,
    disposeApp,
    frontCamera,
    frontPixel,
    materialApp,
    materialGraph,
    renderHdr,
    renderIntegral,
} from './support/materialScenes';
import { writeFixture } from './support/fixtures';
import { luminanceLinear, toPng } from './support/images';

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

const lum = luminanceLinear;

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

    // Fresnel rasante: esfera de vidro que absorve toda a luz que entra (a transmissão não volta) num hemisfério branco —
    // só o reflexo da primeira face, e a borda reflete mais que o centro. (Com o reflexo traçado, um fundo preto atrás
    // da esfera aparece no reflexo rasante da borda, que segue para trás: a esfera absorvente isola o Fresnel.)
    {
        const { app, canvas } = await materialApp(200, 200, engineErrors);
        frontCamera(app, 2.2);
        app.defaults.ambient.data.skyColor = [1, 1, 1, 1];
        app.defaults.ambient.data.groundColor = [1, 1, 1, 1];
        app.defaults.ambient.data.intensity = 1;
        sphere(app, 0, 0, 1, glassFn(1.5, [0.001, 0.001, 0.001], 0.01));
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
    // A vista de perto (400 px por unidade): a separação esperada entre o vermelho e o azul (1,0 px no Abbe 40, 2,3 px
    // no 18, pela placa de 0,6 a 36°) passa do bloco 2×2 do traçado da refração (meia resolução, spec 039); na integral
    // do pixel.
    const height = 0.5;
    const separation: number[] = [];
    for (const abbe of [0, 40, 18]) {
        const { app, canvas } = await materialApp(W, H, engineErrors, { antialias: 'accumulate' });
        noAmbient(app);
        frontCamera(app, height);
        stripes(app, 0.5);
        slab(app, 0, 0.6, Math.PI / 5, glassFn(1.7, [1, 1, 1], 0, abbe));
        const img = await renderIntegral(app);
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
        const samples: number[] = [];
        app.events.on('gpuFrameTimed', (e) => samples.push(e.totalMs));
        await renderHdr(app, 1, 1200);
        await app.whenReady({ timeoutMs: 60_000 });
        samples.length = 0;
        for (let i = 0; i < 120; i++) {
            app.step(1 / 60);
            await nextGpuFrame(app);
        }
        disposeApp(app, canvas);
        samples.sort((a, b) => a - b);
        gpu.push(samples[Math.floor(samples.length / 2)] ?? NaN);
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
        // Fundo branco uniforme (com listras, o ponto medido através dos dois vidros cai numa listra preta ou branca
        // conforme a refração, e a cor do vidro de trás some na preta).
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
        const [x, y] = frontPixel(0.05, 0, height, W, H);
        const c = hdrAt(img, x, y);
        const finite = c.every((v) => Number.isFinite(v));
        // A esfera da frente é uma lente: o vidro verde de trás aparece nela invertido e deslocado, não no ponto em que as
        // duas se sobrepõem na vista — a fração do disco da esfera da frente que mostra o verde.
        const [fx, fy] = frontPixel(-0.3, 0, height, W, H);
        const fr = Math.floor((0.5 / height) * H);
        let disc = 0;
        let green = 0;
        for (let dy = -fr; dy <= fr; dy++)
            for (let dx = -fr; dx <= fr; dx++) {
                if (dx * dx + dy * dy > fr * fr) continue;
                const q = hdrAt(img, fx + dx, fy + dy);
                disc++;
                if (q[1] > q[0] * 1.2) green++;
            }
        const greenish = green / disc >= 0.05;
        log(
            `transmission-layers: através dos dois vidros (${c.map((v) => v.toFixed(3)).join(', ')}); o vidro verde em ${((100 * green) / disc).toFixed(1)} % do disco do vidro da frente — ${greenish ? 'o de trás aparece' : 'o de trás NÃO aparece'}`,
        );
        check(finite && lum(c) > 0.02, 'transmission-layers: buraco através dos dois vidros');
        check(greenish, 'transmission-layers: o vidro de trás não aparece através do da frente');
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

// ── Biblioteca de materiais prontos (US5) ───────────────────────────────────────────────────────────────────────

/** A galeria: 6 colunas × 4 linhas, na ordem das famílias; o vidro ao lado da casa vazia (a parede à vista). */
const GALLERY: readonly (readonly (MaterialName | null)[])[] = [
    ['woodRaw', 'woodVarnishedGloss', 'woodVarnishedMatte', 'leather', 'rubber', 'ceramic'],
    ['cotton', 'wool', 'velvet', 'silk', 'denim', 'sheerFabric'],
    ['plasticMatte', 'plasticGloss', 'metalPolished', 'metalBrushed', 'carPaint', 'metalOxidized'],
    ['porcelain', 'skin', 'wax', 'marble', 'glass', null],
];

/**
 * Parede difusa xadrez em z = −2 (casas de `cell` de lado, deslocadas `offset` casas em x e y), pelo grafo: o padrão é
 * material.
 */
function checkerWall(app: Application, cell: number, offset: readonly [number, number]): void {
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
                materialGraph(
                    {
                        s: nodes.input.surfaceSample(),
                        c: nodes.pattern.checker3.with({ scale: 1 / cell, offset: [...offset, 0] }),
                        ramp: nodes.color.ramp.with({
                            color_a: [0.06, 0.06, 0.07],
                            color_b: [0.6, 0.6, 0.58],
                        }),
                        d: nodes.bsdf.diffuse,
                    },
                    [
                        ['s.world_position', 'c.p'],
                        ['c.value', 'ramp.t'],
                        ['ramp.color', 'd.color'],
                    ],
                    'd.value',
                ),
            ),
    );
}

async function caseGallery(): Promise<void> {
    const W = 960;
    const H = 640;
    const height = 4.8;
    const R = 0.5;
    const STEP = 1.2;
    const { app, canvas } = await materialApp(W, H, engineErrors);
    frontCamera(app, height);
    // A mesma luz para todos: um sol de cima, à direita e de frente, mais o ambiente padrão da cena.
    const l = [0.35, 0.3, 1];
    app.world.insert(
        new DirectionalLight({ direction: [-l[0]!, -l[1]!, -l[2]!, 0], intensity: 3 }),
    );
    // Casas de 0,3: o passo das colunas (1,2) é um número par de casas — a parede atrás do vidro é igual à da casa vazia.
    // O xadrez deslocado um terço e um quarto de casa: o centro do vidro não cai num vértice do xadrez (a imagem
    // invertida pela esfera seria igual à direta).
    checkerWall(app, 0.3, [1 / 3, 1 / 4]);
    const center = new Map<MaterialName | 'empty', [number, number]>();
    GALLERY.forEach((row, j) => {
        row.forEach((name, i) => {
            const x = (i - 2.5) * STEP;
            const y = (1.5 - j) * STEP;
            center.set(name ?? 'empty', [x, y]);
            if (name !== null) sphere(app, x, y, R, Materials[name]());
        });
    });
    const started = performance.now();
    // 32 quadros: o sinal traçado do vidro (uma amostra por quadro) passa pelo filtro temporal da refração.
    const img = await renderHdr(app, 32, 1500);
    const ready = performance.now() - started;
    if (new URLSearchParams(location.search).get('shot') !== null) {
        // O canvas só vale na tarefa do quadro: um quadro e a captura, sem ceder entre os dois.
        app.step(0);
        await writeFixture('zzGallery.png', await toPng(capture(canvas)));
    }
    disposeApp(app, canvas);

    const px = (name: MaterialName | 'empty'): [number, number] => {
        const [x, y] = center.get(name)!;
        return frontPixel(x, y, height, W, H);
    };
    const r = (R / height) * H;
    // Todos desenhados, sem valores não finitos.
    let bad = 0;
    for (let k = 0; k < img.data.length; k++) if (!Number.isFinite(img.data[k]!)) bad++;
    const dark = [...center.keys()].filter((name) => {
        if (name === 'empty') return false;
        const [x, y] = px(name);
        let sum = 0;
        for (let dy = -8; dy <= 8; dy += 4)
            for (let dx = -8; dx <= 8; dx += 4) sum += lum(hdrAt(img, x + dx, y + dy));
        return !(sum > 0);
    });
    log(
        `gallery: ${center.size - 1} materiais prontos sob a mesma luz, ${W}×${H}; pronto em ${(ready / 1000).toFixed(1)} s; ${bad} valores não finitos; sem imagem: ${dark.length === 0 ? 'nenhum' : dark.join(', ')}`,
    );
    check(bad === 0, `gallery: ${bad} valores não finitos no alvo HDR`);
    check(dark.length === 0, `gallery: materiais sem imagem (${dark.join(', ')})`);

    // Realce do sol: a normal na meia direção entre a luz e o observador (+z).
    const len = Math.hypot(l[0]!, l[1]!, l[2]!);
    const hl = Math.hypot(l[0]! / len, l[1]! / len, l[2]! / len + 1);
    const hx = l[0]! / len / hl;
    const hy = l[1]! / len / hl;
    /** Nitidez do realce: o pico perto da meia direção sobre a mediana do anel de 12 a 16 px em volta dele. */
    const sharpness = (name: MaterialName): { ratio: number; peak: number } => {
        const [cx, cy] = px(name);
        const x0 = Math.round(cx + r * hx);
        const y0 = Math.round(cy - r * hy);
        let peak = 0;
        let at: [number, number] = [x0, y0];
        for (let dy = -6; dy <= 6; dy++)
            for (let dx = -6; dx <= 6; dx++) {
                const v = lum(hdrAt(img, x0 + dx, y0 + dy));
                if (v > peak) {
                    peak = v;
                    at = [x0 + dx, y0 + dy];
                }
            }
        const ring: number[] = [];
        for (let dy = -16; dy <= 16; dy++)
            for (let dx = -16; dx <= 16; dx++) {
                const d = Math.hypot(dx, dy);
                if (d >= 12 && d <= 16) ring.push(lum(hdrAt(img, at[0] + dx, at[1] + dy)));
            }
        ring.sort((a, b) => a - b);
        return { ratio: peak / ring[ring.length >> 1]!, peak };
    };
    const raw = sharpness('woodRaw');
    const gloss = sharpness('woodVarnishedGloss');
    const matte = sharpness('woodVarnishedMatte');
    log(
        `gallery: realce do sol (pico / mediana do anel a 12–16 px) — madeira crua ${raw.ratio.toFixed(2)}×, verniz brilhante ${gloss.ratio.toFixed(1)}× (pico ${gloss.peak.toFixed(1)}), verniz fosco ${matte.ratio.toFixed(2)}×`,
    );
    check(raw.ratio < 1.3, `gallery: a madeira crua tem realce nítido (${raw.ratio})`);
    check(gloss.ratio > 2, `gallery: a madeira envernizada não tem realce nítido (${gloss.ratio})`);
    check(
        gloss.ratio > matte.ratio && matte.ratio > raw.ratio,
        `gallery: o verniz fosco não fica entre a madeira crua e o verniz brilhante (${matte.ratio})`,
    );

    // Borda do veludo: o maior valor do anel a 0,93 R sobre o centro, contra um tecido sem pelo ereto e um fosco.
    const rim = (name: MaterialName): number => {
        const [cx, cy] = px(name);
        let top = 0;
        for (let k = 0; k < 64; k++) {
            const a = (2 * Math.PI * k) / 64;
            top = Math.max(
                top,
                lum(
                    hdrAt(
                        img,
                        Math.round(cx + 0.93 * r * Math.cos(a)),
                        Math.round(cy + 0.93 * r * Math.sin(a)),
                    ),
                ),
            );
        }
        return top / lum(hdrAt(img, cx, cy));
    };
    const velvet = rim('velvet');
    const cotton = rim('cotton');
    const rubber = rim('rubber');
    log(
        `gallery: borda/centro — veludo ${velvet.toFixed(2)}, algodão ${cotton.toFixed(2)}, borracha ${rubber.toFixed(2)}`,
    );
    check(velvet > 1.3, `gallery: a borda do veludo não brilha mais que o centro (${velvet})`);
    check(velvet > cotton, `gallery: o veludo não tem mais borda que o algodão (${cotton})`);

    // Realce alongado do metal escovado: razão dos eixos principais dos pixels acima de meio pico, na esfera.
    const elongation = (name: MaterialName): number => {
        const [cx, cy] = px(name);
        const inside: [number, number, number][] = [];
        let peak = 0;
        const rr = Math.floor(0.95 * r);
        for (let dy = -rr; dy <= rr; dy++)
            for (let dx = -rr; dx <= rr; dx++) {
                if (dx * dx + dy * dy > rr * rr) continue;
                const v = lum(hdrAt(img, cx + dx, cy + dy));
                inside.push([dx, dy, v]);
                peak = Math.max(peak, v);
            }
        let w = 0;
        let mx = 0;
        let my = 0;
        for (const [x, y, v] of inside)
            if (v >= peak / 2) {
                w += v;
                mx += v * x;
                my += v * y;
            }
        mx /= w;
        my /= w;
        let xx = 0;
        let yy = 0;
        let xy = 0;
        for (const [x, y, v] of inside)
            if (v >= peak / 2) {
                xx += (v * (x - mx) ** 2) / w;
                yy += (v * (y - my) ** 2) / w;
                xy += (v * (x - mx) * (y - my)) / w;
            }
        // Pixel único (realce abaixo do pixel): a variância do próprio pixel (1/12) nos dois eixos.
        xx += 1 / 12;
        yy += 1 / 12;
        const mean = (xx + yy) / 2;
        const dev = Math.hypot((xx - yy) / 2, xy);
        return Math.sqrt((mean + dev) / (mean - dev));
    };
    const brushed = elongation('metalBrushed');
    const polished = elongation('metalPolished');
    log(
        `gallery: realce do metal (razão dos eixos) — escovado ${brushed.toFixed(2)}×, polido ${polished.toFixed(2)}×`,
    );
    check(brushed > 1.8, `gallery: o realce do metal escovado não é alongado (${brushed})`);
    check(
        brushed > polished,
        `gallery: o metal polido é mais alongado que o escovado (${polished})`,
    );

    // Vidro: a parede aparece através dele (transparente) com o xadrez deslocado (refração) — o mesmo trecho da
    // parede à vista na casa vazia ao lado, duas linhas de casas.
    const [gx, gy] = px('glass');
    const [ex, ey] = px('empty');
    const span = Math.round(0.6 * r);
    const cellPx = (0.3 / height) * H;
    let through = 0;
    let wall = 0;
    let differ = 0;
    let n = 0;
    const flips = { glass: 0, wall: 0 };
    for (const row of [-0.25, 0.25]) {
        const dy = Math.round(row * cellPx * 2);
        const a = profile(img, gy + dy, gx - span, gx + span + 1);
        const b = profile(img, ey + dy, ex - span, ex + span + 1);
        const top = Math.max(...b);
        const low = Math.min(...b);
        const mid = (top + low) / 2;
        through = Math.max(through, ...a);
        wall = Math.max(wall, top);
        for (let k = 0; k < a.length; k++) {
            if (a[k]! > mid !== b[k]! > mid) differ++;
            n++;
            if (k > 0 && a[k]! > mid !== a[k - 1]! > mid) flips.glass++;
            if (k > 0 && b[k]! > mid !== b[k - 1]! > mid) flips.wall++;
        }
    }
    log(
        `gallery: vidro — casa clara da parede ${wall.toFixed(3)} à vista e ${through.toFixed(3)} através dele; ${((100 * differ) / n).toFixed(0)} % do trecho com a casa trocada; bordas do xadrez: ${flips.glass} através, ${flips.wall} à vista`,
    );
    check(through > 0.5 * wall, `gallery: o vidro não é transparente (${through} × ${wall})`);
    check(differ / n > 0.15, `gallery: o xadrez não aparece refratado (${differ} de ${n})`);
}

async function caseLibraryCompose(): Promise<void> {
    const W = 800;
    const H = 400;
    const height = 2;
    const R = 0.8;
    const { app, canvas } = await materialApp(W, H, engineErrors);
    noAmbient(app);
    frontCamera(app, height);
    app.world.insert(new DirectionalLight({ direction: [-0.35, -0.3, -1, 0], intensity: 3 }));
    // O grafo do quickstart: madeira crua e metal escovado, nós da biblioteca, misturados por ruído.
    const mixed = new NodeGraph({
        nodes: {
            s: nodes.input.surfaceSample(),
            a: nodes.material.woodRaw,
            b: nodes.material.metalBrushed,
            n: nodes.noise.gradient3.with({ scale: 3 }),
            x: nodes.closure.mix,
            out: nodes.output.closure,
        },
        links: [
            ['s.world_position', 'n.p'],
            ['a.value', 'x.a'],
            ['b.value', 'x.b'],
            ['n.value', 'x.t'],
            ['x.value', 'out.closure'],
        ],
        output: 'out.value',
    });
    // As três esferas na mesma posição do ruído (o ruído é da posição de mundo): uma por vez, no mesmo lugar.
    const shots: HdrImage[] = [];
    const fns = [
        Materials.woodRaw(),
        Materials.metalBrushed(),
        new MaterialFunction({ graph: mixed }),
    ];
    const spheres = fns.map((fn) =>
        new SphereGeometry({ radius: R, latSegments: 96, lonSegments: 192 })
            .add(new StandardMaterial())
            .add(new Transform({ position: [-1, 0, 0, 1] }))
            .add(fn),
    );
    // Material pronto com uma entrada ligada a outro nó: a cor do plástico brilhante vem de um xadrez (rampa de cor).
    sphere(
        app,
        1,
        0,
        R,
        materialGraph(
            {
                s: nodes.input.surfaceSample(),
                c: nodes.pattern.checker3.with({ scale: 2 }),
                ramp: nodes.color.ramp.with({
                    color_a: [0.8, 0.05, 0.05],
                    color_b: [0.05, 0.05, 0.8],
                }),
                p: nodes.material.plasticGloss,
            },
            [
                ['s.world_position', 'c.p'],
                ['c.value', 'ramp.t'],
                ['ramp.color', 'p.color'],
            ],
            'p.value',
        ),
    );
    for (const entity of spheres) {
        app.world.insert(entity);
        shots.push(await renderHdr(app));
        app.world.remove(entity);
    }
    disposeApp(app, canvas);
    const [wood, metal, mix] = shots as [HdrImage, HdrImage, HdrImage];
    const [cx, cy] = frontPixel(-1, 0, height, W, H);
    const r = Math.floor(((0.9 * R) / height) * H);
    let total = 0;
    let asWood = 0;
    let asMetal = 0;
    for (let dy = -r; dy <= r; dy += 2)
        for (let dx = -r; dx <= r; dx += 2) {
            if (dx * dx + dy * dy > r * r) continue;
            const a = lum(hdrAt(wood, cx + dx, cy + dy));
            const b = lum(hdrAt(metal, cx + dx, cy + dy));
            const m = lum(hdrAt(mix, cx + dx, cy + dy));
            // Só onde os dois materiais diferem o bastante para dizer qual é qual.
            if (Math.abs(a - b) < 0.02) continue;
            total++;
            const t = (m - a) / (b - a);
            if (Math.abs(t) < 0.05) asWood++;
            else if (Math.abs(t - 1) < 0.05) asMetal++;
        }
    // O ruído vai de −1 a 1 e a mistura prende em [0, 1]: metade da esfera é madeira pura; no resto os dois entram
    // (os especulares fundidos pela regra do `closure-mix`, não a média das duas imagens).
    const blended = total - asWood - asMetal;
    log(
        `library-compose: madeira crua × metal escovado por ruído — de ${total} pixels: ${((100 * asWood) / total).toFixed(0)} % iguais à madeira, ${((100 * asMetal) / total).toFixed(0)} % iguais ao metal, ${((100 * blended) / total).toFixed(0)} % com os dois`,
    );
    check(total > 1000, `library-compose: madeira e metal não se distinguem (${total} pixels)`);
    check(asWood / total > 0.15, `library-compose: a madeira não aparece na mistura (${asWood})`);
    check(
        (blended + asMetal) / total > 0.15,
        `library-compose: o metal não aparece na mistura (${blended + asMetal})`,
    );

    // A cor ligada: casas vizinhas do xadrez (0,5 de lado) com as duas cores da rampa; o realce do plástico continua.
    const at = (x: number, y: number): [number, number, number] => {
        const [qx, qy] = frontPixel(1 + x, y, height, W, H);
        return hdrAt(mix, qx, qy);
    };
    const one = at(-0.25, -0.25);
    const other = at(0.25, -0.25);
    const redBlue = (c: readonly number[]): number => c[0]! / Math.max(c[2]!, 1e-6);
    const lo = Math.min(redBlue(one), redBlue(other));
    const hi = Math.max(redBlue(one), redBlue(other));
    let peak = 0;
    const [sx, sy] = frontPixel(1, 0, height, W, H);
    const sr = Math.floor((R / height) * H);
    for (let dy = -sr; dy <= sr; dy++)
        for (let dx = -sr; dx <= sr; dx++)
            if (dx * dx + dy * dy <= sr * sr)
                peak = Math.max(peak, lum(hdrAt(mix, sx + dx, sy + dy)));
    log(
        `library-compose: plástico brilhante com a cor ligada ao xadrez — vermelho/azul ${hi.toFixed(1)} numa casa e ${lo.toFixed(3)} na vizinha; pico do realce ${peak.toFixed(1)}`,
    );
    check(
        hi > 4 && lo < 0.25,
        `library-compose: a cor ligada não chega ao material (${hi}, ${lo})`,
    );
    check(peak > 2, `library-compose: o plástico perdeu o realce (${peak})`);
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
    gallery: caseGallery,
    'library-compose': caseLibraryCompose,
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

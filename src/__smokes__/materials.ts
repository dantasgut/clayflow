// Spec 011 — Smoke dos materiais por nós (US3, SC-008; a US5 acrescenta a galeria e a composição da biblioteca).
//
// Cada caso monta uma cena pequena com câmera ortográfica de frente (a galeria, em perspectiva) e lê a radiância linear
// do alvo HDR. Casos:
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
//   - gallery (US5): os 23 materiais prontos (`Materials.*`), um quadro por família (madeira e couro, tecidos, plásticos e
//     metais, translúcidos), câmera em perspectiva, cada um numa esfera sobre uma placa do mesmo material, sob o sol, uma
//     luz de recorte rasante, o céu físico e a luz rebatida da cena (o que os lisos refletem) — a estrutura de cada um
//     à vista (o veio da madeira crua e sob o verniz, o grão do couro, a trama do jeans e do algodão, os flocos da
//     pintura, a ferrugem em manchas, os veios do mármore) e as medidas de reconhecimento: madeira crua sem realce
//     nítido e envernizada com, veludo com o centro escuro, a borda clara e sem realce nem manchas duras, metal polido
//     com o céu refletido por cima e o chão por baixo, metal escovado com o realce alongado, vidro transparente com o xadrez
//     refratado e sem grão no meio das casas, tecido fino com a luz ambiente do lado contra o sol; o custo de GPU por
//     quadro de cada família (`--query case=gallery&shot=1` grava os quadros em `fixtures/zzGallery-<família>.png`;
//     `&family=<família>` desenha só uma);
//   - library-compose (US5): madeira crua e metal escovado (nós da biblioteca) misturados por ruído, e um material
//     pronto com a entrada da cor ligada a outro nó (xadrez).
// Para rodar: `npm run smoke -- materials [--query case=closure-mix]`. Resultado: `MATERIALS SMOKE PASSED` ou `FAIL: …`.
import {
    BoxGeometry,
    Camera,
    DirectionalLight,
    GlobalIllumination,
    MaterialFunction,
    Materials,
    NodeGraph,
    nodes,
    PlaneGeometry,
    PointLight,
    Sky,
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

/** Uma família da galeria: o nome do quadro e os materiais, a fileira de trás e a da frente (3 colunas). */
interface GalleryFamily {
    readonly name: string;
    readonly rows: readonly [readonly (MaterialName | null)[], readonly (MaterialName | null)[]];
}

/** A galeria: um quadro por família, 3 colunas × 2 fileiras; o vidro ao lado do lugar vazio (a parede à vista). */
const GALLERY: readonly GalleryFamily[] = [
    {
        name: 'madeira-couro',
        rows: [
            ['leather', 'rubber', 'ceramic'],
            ['woodRaw', 'woodVarnishedGloss', 'woodVarnishedMatte'],
        ],
    },
    {
        name: 'tecidos',
        rows: [
            ['cotton', 'wool', 'sheerFabric'],
            ['denim', 'velvet', 'silk'],
        ],
    },
    {
        name: 'plasticos-metais',
        rows: [
            ['plasticMatte', 'plasticGloss', 'metalPolished'],
            ['metalBrushed', 'carPaint', 'metalOxidized'],
        ],
    },
    {
        name: 'translucidos',
        rows: [
            ['marble', 'glass', null],
            ['porcelain', 'skin', 'wax'],
        ],
    },
];

/** Geometria da galeria: esferas de raio `R` sobre placas de lado `TILE`, colunas a `DX` e fileiras em z = ∓`DZ`. */
const GALLERY_R = 0.55;
const GALLERY_TILE = 1.4;
const GALLERY_DX = 1.6;
const GALLERY_DZ = 1.2;
/** A parede atrás do vidro (z) e a casa do xadrez dela: o passo das colunas é um número par de casas. */
const GALLERY_WALL_Z = -2.2;
const GALLERY_CELL = 0.4;
/** Câmera em perspectiva: posição, alvo e abertura vertical. */
const GALLERY_EYE = [0, 5.2, 8.23] as const;
const GALLERY_TARGET = [0, 0.45, 0] as const;
const GALLERY_FOV = (21 * Math.PI) / 180;
/** Direções para as luzes: o sol (de cima, à direita e de frente) e a luz de recorte (rasante, de trás à esquerda). */
const GALLERY_SUN = [0.45, 0.8, 0.55] as const;
const GALLERY_RIM = [-0.65, 0.22, -0.72] as const;
/** Quadros até a leitura: o acúmulo das sondas da luz rebatida. */
const GALLERY_FRAMES = 240;
/** Inclinação do eixo do uv das esferas (para trás, em torno de x). */
const POLE_TILT = (35 * Math.PI) / 180;

type Vec3 = readonly [number, number, number];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const unit3 = (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
};

/** Pixel (fracionário) do ponto de mundo `p` na câmera da galeria, num alvo de `w` × `h`. */
function galleryPixel(p: Vec3, w: number, h: number): [number, number] {
    const f = unit3(sub3(GALLERY_TARGET, GALLERY_EYE));
    const r = unit3(cross3(f, [0, 1, 0]));
    const u = cross3(r, f);
    const d = sub3(p, GALLERY_EYE);
    const focal = h / 2 / Math.tan(GALLERY_FOV / 2);
    const z = dot3(d, f);
    return [w / 2 + (focal * dot3(d, r)) / z, h / 2 - (focal * dot3(d, u)) / z];
}

/** Um quadro da galeria medido: a imagem HDR, o centro de cada esfera no mundo e o custo de GPU por quadro. */
interface GalleryShot {
    readonly img: HdrImage;
    readonly center: ReadonlyMap<MaterialName | 'empty', Vec3>;
    readonly gpuMs: number;
    readonly ready: number;
}

/**
 * Parede vertical em z = `z` voltada para a câmera, com o material do grafo dado: neutra (o fundo) ou xadrez (atrás do
 * vidro) — o padrão é material.
 */
function galleryWall(
    app: Application,
    center: Vec3,
    size: readonly [number, number],
    fn: MaterialFunction,
): void {
    app.world.insert(
        new PlaneGeometry({ size: [...size] })
            .add(new StandardMaterial())
            .add(
                new Transform({
                    position: [...center, 1],
                    rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
                }),
            )
            .add(fn),
    );
}

/** Difuso de cor uniforme (o chão e o fundo neutros). */
function neutral(value: number): MaterialFunction {
    return materialGraph(
        { d: nodes.bsdf.diffuse.with({ color: [value, value, value * 0.98] }) },
        [],
        'd.value',
    );
}

/** Desenha um quadro da galeria (uma família) e mede o custo de GPU por quadro; `shot` grava o PNG. */
async function galleryShot(
    family: GalleryFamily,
    width: number,
    height: number,
): Promise<GalleryShot> {
    const { app, canvas } = await materialApp(width, height, engineErrors, { profiling: true });
    const samples: number[] = [];
    app.events.on('gpuFrameTimed', (e) => samples.push(e.totalMs));
    app.world.insert(
        new Camera({ projection: 'perspective', fov: GALLERY_FOV, near: 0.5, far: 60 }).add(
            new Transform({
                position: [...GALLERY_EYE, 1],
                rotation: Transform.lookRotation([...GALLERY_EYE], [...GALLERY_TARGET]),
            }),
        ),
    );
    // A mesma luz para todos: o sol, uma luz de recorte rasante por trás (o pelo do veludo, o relevo das tramas) e o
    // ambiente — o céu físico desse sol e a luz rebatida da cena (o chão, as placas e os vizinhos), que é o que os
    // lisos refletem (a radiância das sondas na direção do reflexo).
    const sun = new DirectionalLight({
        direction: [...GALLERY_SUN.map((c) => -c), 0],
        intensity: 3,
    });
    app.world.insert(sun);
    app.world.insert(new Sky({ sun, sunDisk: false }));
    app.world.insert(
        new GlobalIllumination({
            quality: 'medium',
            probeSpacing: 0.5,
            center: [0, 0.6, 0],
            screenGather: false,
        }),
    );
    app.world.insert(
        new DirectionalLight({ direction: [...GALLERY_RIM.map((c) => -c), 0], intensity: 1.2 }),
    );
    // Chão e fundo neutros.
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, -0.1, 0, 1] }))
            .add(neutral(0.3)),
    );
    galleryWall(app, [0, 5, -6], [40, 20], neutral(0.3));
    const center = new Map<MaterialName | 'empty', Vec3>();
    // O padrão do mesmo tamanho na esfera (o uv dá a volta em 2πR e vai de polo a polo em πR) e na placa.
    const tileScale = GALLERY_TILE / (Math.PI * GALLERY_R);
    family.rows.forEach((row, j) => {
        row.forEach((name, i) => {
            const at: Vec3 = [(i - 1) * GALLERY_DX, GALLERY_R, j === 0 ? -GALLERY_DZ : GALLERY_DZ];
            center.set(name ?? 'empty', at);
            if (name === null) return;
            const patterned = 'pattern_scale' in nodes.material[name].params;
            app.world.insert(
                new SphereGeometry({ radius: GALLERY_R, latSegments: 96, lonSegments: 192 })
                    .add(new StandardMaterial())
                    // O eixo do uv inclinado 35° para trás: o polo de cima (onde o uv converge) fica atrás do limbo.
                    .add(
                        new Transform({
                            position: [...at, 1],
                            rotation: [Math.sin(-POLE_TILT / 2), 0, 0, Math.cos(-POLE_TILT / 2)],
                        }),
                    )
                    .add(Materials[name](patterned ? { pattern_scale: [2, 1] } : {})),
            );
            // A parte plana: a placa do mesmo material sob a esfera (o vidro fica sem, com a parede à vista atrás).
            if (name === 'glass') return;
            app.world.insert(
                new BoxGeometry({ size: [GALLERY_TILE, 0.1, GALLERY_TILE] })
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [at[0], -0.05, at[2], 1] }))
                    .add(
                        Materials[name](patterned ? { pattern_scale: [tileScale, tileScale] } : {}),
                    ),
            );
        });
    });
    if (center.has('glass')) {
        // Atrás do vidro e do lugar vazio, a parede xadrez: o centro do vidro não cai num vértice do xadrez (a imagem
        // invertida pela esfera seria igual à direta).
        const glass = center.get('glass')!;
        const empty = center.get('empty')!;
        galleryWall(
            app,
            [(glass[0] + empty[0]) / 2, 1.1, GALLERY_WALL_Z],
            [8 * GALLERY_CELL, 6 * GALLERY_CELL],
            materialGraph(
                {
                    s: nodes.input.surfaceSample(),
                    c: nodes.pattern.checker3.with({
                        scale: 1 / GALLERY_CELL,
                        offset: [1 / 3, 1 / 4, 0],
                    }),
                    ramp: nodes.color.ramp.with({
                        color_a: [0.06, 0.06, 0.07],
                        color_b: [0.6, 0.6, 0.58],
                    }),
                    d: nodes.bsdf.diffuse,
                },
                [
                    ['s.world_position', 'c.p'],
                    ['s.footprint', 'c.width'],
                    ['c.value', 'ramp.t'],
                    ['ramp.color', 'd.color'],
                ],
                'd.value',
            ),
        );
    }
    const started = performance.now();
    // 240 quadros: as sondas da luz rebatida acumulam (histerese 0,97) e o sinal traçado do vidro (uma amostra por
    // quadro) passa pelo filtro temporal da refração.
    const img = await renderHdr(app, GALLERY_FRAMES, 1500);
    const ready = performance.now() - started;
    samples.length = 0;
    for (let i = 0; i < 60; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
    }
    samples.sort((a, b) => a - b);
    if (new URLSearchParams(location.search).get('shot') !== null) {
        // O canvas só vale na tarefa do quadro: um quadro e a captura, sem ceder entre os dois.
        app.step(0);
        await writeFixture(`zzGallery-${family.name}.png`, await toPng(capture(canvas)));
    }
    disposeApp(app, canvas);
    return { img, center, gpuMs: samples[samples.length >> 1] ?? NaN, ready };
}

async function caseGallery(): Promise<void> {
    const W = 1440;
    const H = 960;
    const R = GALLERY_R;
    const only = new URLSearchParams(location.search).get('family');
    const shots = new Map<string, GalleryShot>();
    for (const family of GALLERY) {
        if (only !== null && only !== family.name) continue;
        shots.set(family.name, await galleryShot(family, W, H));
    }
    /** O quadro em que o material está (ou `undefined`, com `family=` de outra família). */
    const shotOf = (name: MaterialName | 'empty'): GalleryShot | undefined =>
        [...shots.values()].find((shot) => shot.center.has(name));
    const sun = unit3(GALLERY_SUN);
    /** Raio em pixels da esfera de centro `c` e a direção para o observador a partir dele. */
    const view = (c: Vec3): { r: number; v: Vec3 } => {
        const d = sub3(GALLERY_EYE, c);
        const f = unit3(sub3(GALLERY_TARGET, GALLERY_EYE));
        return { r: ((H / 2 / Math.tan(GALLERY_FOV / 2)) * R) / -dot3(d, f), v: unit3(d) };
    };
    /** Pixel do ponto da esfera `name` de normal `n`. */
    const onSphere = (shot: GalleryShot, name: MaterialName, n: Vec3): [number, number] => {
        const c = shot.center.get(name)!;
        const [x, y] = galleryPixel([c[0] + R * n[0], c[1] + R * n[1], c[2] + R * n[2]], W, H);
        return [Math.round(x), Math.round(y)];
    };
    /** Luminâncias da janela quadrada de lado 2·`half` + 1 em volta de (x, y). */
    const patch = (img: HdrImage, x: number, y: number, half: number): number[][] => {
        const rows: number[][] = [];
        for (let dy = -half; dy <= half; dy++) {
            const row: number[] = [];
            for (let dx = -half; dx <= half; dx++) row.push(lum(hdrAt(img, x + dx, y + dy)));
            rows.push(row);
        }
        return rows;
    };

    // Todos desenhados, sem valores não finitos; o custo de GPU de cada quadro.
    for (const [family, shot] of shots) {
        let bad = 0;
        for (let k = 0; k < shot.img.data.length; k++)
            if (!Number.isFinite(shot.img.data[k]!)) bad++;
        const dark = [...shot.center.keys()].filter((name) => {
            if (name === 'empty') return false;
            const [x, y] = onSphere(shot, name, view(shot.center.get(name)!).v);
            let sum = 0;
            for (let dy = -8; dy <= 8; dy += 4)
                for (let dx = -8; dx <= 8; dx += 4) sum += lum(hdrAt(shot.img, x + dx, y + dy));
            return !(sum > 0);
        });
        log(
            `gallery ${family}: ${shot.center.size - (shot.center.has('empty') ? 1 : 0)} materiais prontos, ${W}×${H}; pronto em ${(shot.ready / 1000).toFixed(1)} s; GPU ${shot.gpuMs.toFixed(2)} ms por quadro (mediana); ${bad} valores não finitos; sem imagem: ${dark.length === 0 ? 'nenhum' : dark.join(', ')}`,
        );
        check(bad === 0, `gallery ${family}: ${bad} valores não finitos no alvo HDR`);
        check(dark.length === 0, `gallery ${family}: materiais sem imagem (${dark.join(', ')})`);
    }

    /**
     * Contraste da estrutura do material na janela: o desvio da luminância em torno da média local (7 × 7 pixels: sem o
     * degradê da luz nem o realce largo) sobre a média da janela.
     */
    const contrast = (name: MaterialName, n: Vec3, half: number): number => {
        const shot = shotOf(name)!;
        const [x, y] = onSphere(shot, name, n);
        const values = patch(shot.img, x, y, half + 3);
        let sum = 0;
        let dev = 0;
        let count = 0;
        for (let j = 3; j < values.length - 3; j++)
            for (let i = 3; i < values.length - 3; i++) {
                let local = 0;
                for (let dy = -3; dy <= 3; dy++)
                    for (let dx = -3; dx <= 3; dx++) local += values[j + dy]![i + dx]! / 49;
                sum += values[j]![i]!;
                dev += (values[j]![i]! - local) ** 2;
                count++;
            }
        return Math.sqrt(dev / count) / Math.max(sum / count, 1e-6);
    };
    /**
     * Periodicidade na janela: a autocorrelação normalizada das linhas (sem a média de cada uma) cai até um primeiro
     * mínimo e volta a subir no período do padrão — o quanto ela sobe depois desse mínimo (até `to` pixels). Perto de
     * 1 num padrão que se repete; perto de 0 num ruído ou num degradê (que só caem).
     */
    const periodicity = (name: MaterialName, n: Vec3, half: number, to: number) => {
        const shot = shotOf(name)!;
        const [x, y] = onSphere(shot, name, n);
        const rows = patch(shot.img, x, y, half).map((row) => {
            const mean = row.reduce((a, b) => a + b, 0) / row.length;
            return row.map((v) => v - mean);
        });
        const at = (lag: number): number => {
            let num = 0;
            let den = 0;
            for (const row of rows) {
                for (let k = 0; k + lag < row.length; k++) num += row[k]! * row[k + lag]!;
                for (let k = 0; k < row.length; k++)
                    den += (row[k]! * row[k]! * (row.length - lag)) / row.length;
            }
            return num / Math.max(den, 1e-12);
        };
        const curve = Array.from({ length: to }, (_, k) => at(k + 1));
        let low = 0;
        while (low + 1 < curve.length && curve[low + 1]! < curve[low]!) low++;
        let best = { lag: low + 1, value: 0 };
        for (let k = low + 1; k < curve.length; k++)
            if (curve[k]! - curve[low]! > best.value)
                best = { lag: k + 1, value: curve[k]! - curve[low]! };
        return best;
    };
    /** Um ponto da esfera voltado para a câmera, girado `side` para o lado da sombra (fora do realce do sol). */
    const facing = (name: MaterialName, side = -0.35): Vec3 => {
        const { v } = view(shotOf(name)!.center.get(name)!);
        return unit3([v[0] + side, v[1] - 0.15, v[2]]);
    };

    /** Nitidez do realce: o pico perto da meia direção sobre a mediana do anel de 12 a 16 px em volta dele. */
    const sharpness = (name: MaterialName): { ratio: number; peak: number } => {
        const shot = shotOf(name)!;
        const { v } = view(shot.center.get(name)!);
        const h = unit3([sun[0] + v[0], sun[1] + v[1], sun[2] + v[2]]);
        const [x0, y0] = onSphere(shot, name, h);
        let peak = 0;
        let at: [number, number] = [x0, y0];
        for (let dy = -8; dy <= 8; dy++)
            for (let dx = -8; dx <= 8; dx++) {
                const v = lum(hdrAt(shot.img, x0 + dx, y0 + dy));
                if (v > peak) {
                    peak = v;
                    at = [x0 + dx, y0 + dy];
                }
            }
        const ring: number[] = [];
        for (let dy = -16; dy <= 16; dy++)
            for (let dx = -16; dx <= 16; dx++) {
                const d = Math.hypot(dx, dy);
                if (d >= 12 && d <= 16) ring.push(lum(hdrAt(shot.img, at[0] + dx, at[1] + dy)));
            }
        ring.sort((a, b) => a - b);
        return { ratio: peak / ring[ring.length >> 1]!, peak };
    };

    if (shots.has('madeira-couro')) {
        const raw = sharpness('woodRaw');
        const gloss = sharpness('woodVarnishedGloss');
        const matte = sharpness('woodVarnishedMatte');
        log(
            `gallery: realce do sol (pico / mediana do anel a 12–16 px) — madeira crua ${raw.ratio.toFixed(2)}×, verniz brilhante ${gloss.ratio.toFixed(1)}× (pico ${gloss.peak.toFixed(1)}), verniz fosco ${matte.ratio.toFixed(2)}×`,
        );
        // A madeira crua tem o contraste do veio no anel (o lenho tardio contra o inicial), não um realce: o pico fica
        // dentro da faixa de tons do veio.
        check(raw.ratio < 3, `gallery: a madeira crua tem realce nítido (${raw.ratio})`);
        check(
            gloss.ratio > 4 * raw.ratio,
            `gallery: a madeira envernizada não tem realce nítido (${gloss.ratio} × ${raw.ratio})`,
        );
        check(
            gloss.ratio > matte.ratio,
            `gallery: o verniz fosco tem o realce mais nítido que o brilhante (${matte.ratio})`,
        );
        // O veio: o contraste entre o lenho inicial e o tardio, na madeira crua e sob o verniz; e o grão do couro.
        const grainRaw = contrast('woodRaw', facing('woodRaw'), 24);
        const grainGloss = contrast('woodVarnishedGloss', facing('woodVarnishedGloss'), 24);
        const hide = contrast('leather', facing('leather'), 24);
        const plain = contrast('rubber', facing('rubber'), 24);
        log(
            `gallery: contraste da estrutura (desvio / média em 49 × 49 px) — veio da madeira crua ${grainRaw.toFixed(3)}, sob o verniz ${grainGloss.toFixed(3)}; grão do couro ${hide.toFixed(3)}; borracha ${plain.toFixed(3)}`,
        );
        check(grainRaw > 0.08, `gallery: a madeira crua não mostra o veio (${grainRaw})`);
        check(grainGloss > 0.08, `gallery: o veio não aparece sob o verniz (${grainGloss})`);
        check(hide > 0.06, `gallery: o couro não mostra o grão (${hide})`);
        check(
            grainRaw > 2 * plain && hide > 2 * plain,
            `gallery: a borracha tem tanto contraste quanto a madeira e o couro (${plain})`,
        );
    }

    if (shots.has('tecidos')) {
        const shot = shots.get('tecidos')!;
        // Borda do veludo: o maior valor do anel a 0,93 R sobre o centro, contra um tecido sem pelo ereto.
        const rim = (name: MaterialName): number => {
            const c = shot.center.get(name)!;
            const { r, v } = view(c);
            const [cx, cy] = onSphere(shot, name, v);
            let top = 0;
            for (let k = 0; k < 64; k++) {
                const a = (2 * Math.PI * k) / 64;
                top = Math.max(
                    top,
                    lum(
                        hdrAt(
                            shot.img,
                            Math.round(cx + 0.93 * r * Math.cos(a)),
                            Math.round(cy + 0.93 * r * Math.sin(a)),
                        ),
                    ),
                );
            }
            // O centro: a mediana da janela (a trama e as manchas do pelo variam de pixel a pixel).
            const middle = patch(shot.img, cx, cy, 6)
                .flat()
                .sort((a, b) => a - b);
            return top / middle[middle.length >> 1]!;
        };
        const velvet = rim('velvet');
        const cotton = rim('cotton');
        log(`gallery: borda/centro — veludo ${velvet.toFixed(2)}, algodão ${cotton.toFixed(2)}`);
        // O veludo: o centro escuro e a borda clara (o pelo em pé visto de lado) — bem mais que num tecido sem pelo.
        check(
            velvet > 2.5,
            `gallery: o veludo não tem o centro escuro e a borda clara (${velvet})`,
        );
        check(
            velvet > 2 * cotton,
            `gallery: o veludo não tem mais borda que o algodão (${cotton})`,
        );
        // E fosco: sem realce do sol (o pico perto da meia direção fica no tom da vizinhança) e sem manchas duras (o
        // pelo penteado muda o tom em regiões largas: quase nada dentro de 7 × 7 pixels).
        const shine = sharpness('velvet');
        const blotches = contrast('velvet', facing('velvet'), 24);
        log(
            `gallery: veludo — realce do sol (pico / mediana do anel a 12–16 px) ${shine.ratio.toFixed(2)}×; contraste local (desvio / média em 49 × 49 px) ${blotches.toFixed(3)}`,
        );
        check(shine.ratio < 1.5, `gallery: o veludo tem realce nítido (${shine.ratio})`);
        check(blotches < 0.05, `gallery: o veludo tem manchas duras (${blotches})`);
        // A trama: o padrão se repete ao longo das linhas (os fios), no jeans e no algodão; o veludo, sem trama à
        // vista, não se repete.
        const denim = periodicity('denim', facing('denim'), 24, 24);
        const plain = periodicity('cotton', facing('cotton'), 24, 24);
        const pile = periodicity('velvet', facing('velvet'), 24, 24);
        log(
            `gallery: periodicidade da trama (subida da autocorrelação das linhas depois do primeiro mínimo, em 49 × 49 px) — jeans ${denim.value.toFixed(2)} a ${denim.lag} px, algodão ${plain.value.toFixed(2)} a ${plain.lag} px, veludo ${pile.value.toFixed(2)}`,
        );
        check(denim.value > 0.3, `gallery: o jeans não mostra a trama (${denim.value})`);
        check(plain.value > 0.3, `gallery: o algodão não mostra a trama (${plain.value})`);
        check(
            pile.value < 0.5 * Math.min(denim.value, plain.value),
            `gallery: o veludo se repete como uma trama (${pile.value})`,
        );
        // Tecido fino (desenhado pelo traçado da refração: lobo translúcido) do lado contra o sol: a luz ambiente da
        // cena, como no algodão (desenhado pelo forward) — sem ela nos acertos dos raios, o tecido fino dava 0 ali.
        const away = (name: MaterialName): number => {
            const { v } = view(shot.center.get(name)!);
            // No plano da tela, a direção oposta à do sol, a 10° do limbo.
            const along = dot3(sun, v);
            const side = unit3(sub3(sun, [v[0] * along, v[1] * along, v[2] * along]));
            const a = Math.PI / 18;
            const n: Vec3 = [
                v[0] * Math.sin(a) - side[0] * Math.cos(a),
                v[1] * Math.sin(a) - side[1] * Math.cos(a),
                v[2] * Math.sin(a) - side[2] * Math.cos(a),
            ];
            const [x, y] = onSphere(shot, name, n);
            const values = patch(shot.img, x, y, 4)
                .flat()
                .sort((p, q) => p - q);
            return values[values.length >> 1]!;
        };
        const sheer = away('sheerFabric');
        const cottonAway = away('cotton');
        log(
            `gallery: lado contra o sol (a 10° do limbo) — tecido fino ${sheer.toFixed(4)}, algodão ${cottonAway.toFixed(4)}`,
        );
        check(sheer > 0, `gallery: o tecido fino fica preto do lado contra o sol (${sheer})`);
        check(
            sheer > 0.5 * cottonAway,
            `gallery: o tecido fino recebe menos da metade da luz ambiente do algodão (${sheer} × ${cottonAway})`,
        );
    }

    if (shots.has('plasticos-metais')) {
        const shot = shots.get('plasticos-metais')!;
        // Realce alongado do metal escovado: razão dos eixos principais dos pixels acima de meio pico, na esfera.
        const elongation = (name: MaterialName): number => {
            // Em volta do realce do sol (a normal na meia direção), fora o da luz de recorte.
            const c = shot.center.get(name)!;
            const { r, v } = view(c);
            const h = unit3([sun[0] + v[0], sun[1] + v[1], sun[2] + v[2]]);
            const [cx, cy] = onSphere(shot, name, h);
            const inside: [number, number, number][] = [];
            let peak = 0;
            const rr = Math.floor(0.4 * r);
            for (let dy = -rr; dy <= rr; dy++)
                for (let dx = -rr; dx <= rr; dx++) {
                    if (dx * dx + dy * dy > rr * rr) continue;
                    const value = lum(hdrAt(shot.img, cx + dx, cy + dy));
                    inside.push([dx, dy, value]);
                    peak = Math.max(peak, value);
                }
            let w = 0;
            let mx = 0;
            let my = 0;
            for (const [x, y, value] of inside)
                if (value >= peak / 2) {
                    w += value;
                    mx += value * x;
                    my += value * y;
                }
            mx /= w;
            my /= w;
            let xx = 0;
            let yy = 0;
            let xy = 0;
            for (const [x, y, value] of inside)
                if (value >= peak / 2) {
                    xx += (value * (x - mx) ** 2) / w;
                    yy += (value * (y - my) ** 2) / w;
                    xy += (value * (x - mx) * (y - my)) / w;
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
        // O metal polido reflete o ambiente: onde o reflexo aponta para cima, o céu (azulado); onde aponta para
        // baixo, o chão neutro — a razão azul / vermelho dos dois pontos (médias de 9 × 9 pixels).
        const mirrored = (toward: Vec3): number => {
            const { v } = view(shot.center.get('metalPolished')!);
            const [x, y] = onSphere(
                shot,
                'metalPolished',
                unit3([v[0] + toward[0], v[1] + toward[1], v[2] + toward[2]]),
            );
            let red = 0;
            let blue = 0;
            for (let dy = -4; dy <= 4; dy++)
                for (let dx = -4; dx <= 4; dx++) {
                    const c = hdrAt(shot.img, x + dx, y + dy);
                    red += c[0]!;
                    blue += c[2]!;
                }
            return blue / Math.max(red, 1e-6);
        };
        const skyTint = mirrored([0, 1, 0]);
        const floorTint = mirrored([0, -1, 0]);
        log(
            `gallery: metal polido — azul / vermelho do reflexo para cima (o céu) ${skyTint.toFixed(2)}, para baixo (o chão) ${floorTint.toFixed(2)}`,
        );
        check(
            skyTint > 1.15 * floorTint,
            `gallery: o metal polido não reflete o céu por cima e o chão por baixo (${skyTint} × ${floorTint})`,
        );
        // Os flocos da pintura e as manchas da ferrugem contra o plástico brilhante liso.
        const flakes = contrast('carPaint', facing('carPaint'), 24);
        const rust = contrast('metalOxidized', facing('metalOxidized'), 24);
        const smooth = contrast('plasticGloss', facing('plasticGloss'), 24);
        log(
            `gallery: contraste da estrutura (desvio / média em 49 × 49 px) — flocos da pintura ${flakes.toFixed(3)}, ferrugem ${rust.toFixed(3)}, plástico brilhante ${smooth.toFixed(3)}`,
        );
        check(flakes > 2 * smooth, `gallery: a pintura não mostra os flocos (${flakes})`);
        check(rust > 2 * smooth, `gallery: o metal oxidado não mostra as manchas (${rust})`);
    }

    if (shots.has('translucidos')) {
        const shot = shots.get('translucidos')!;
        const img = shot.img;
        // Vidro: a parede aparece através dele (transparente) com o xadrez deslocado (refração) — contra o mesmo trecho
        // da parede à vista no lugar vazio ao lado: o ponto da parede atrás do centro do vidro e o de mesma fase do
        // xadrez (um passo de coluna = 4 casas) atrás do lugar vazio, duas linhas de casas.
        const glass = shot.center.get('glass')!;
        const { r, v } = view(glass);
        const [gx, gy] = onSphere(shot, 'glass', v);
        const t = (GALLERY_WALL_Z - GALLERY_EYE[2]) / (glass[2] - GALLERY_EYE[2]);
        const behind: Vec3 = [
            GALLERY_EYE[0] + t * (glass[0] - GALLERY_EYE[0]),
            GALLERY_EYE[1] + t * (glass[1] - GALLERY_EYE[1]),
            GALLERY_WALL_Z,
        ];
        const [ex, ey] = galleryPixel([behind[0] + GALLERY_DX, behind[1], behind[2]], W, H).map(
            Math.round,
        ) as [number, number];
        const cellPx =
            galleryPixel([behind[0] + GALLERY_CELL, behind[1], behind[2]], W, H)[0]
            - galleryPixel(behind, W, H)[0];
        const span = Math.round(0.6 * r);
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

        // Vidro sem grão: a dispersão (`abbe` 58) aparece como franja nas bordas do xadrez, não como pontos soltos
        // dentro das casas. No disco de 0,7 do raio (fora dele a esfera comprime a parede inteira em poucos pixels), o
        // pixel no meio de uma casa — ao menos 20 dos 25 pixels da janela 5 × 5 com a luminância a menos de 10 % da
        // casa clara da mediana da janela — é um ponto de grão quando um canal dele foge mais que isso da mediana do
        // canal na janela. As franjas ficam nas bordas (janela dividida), fora da conta. Na câmera ortográfica da
        // galeria anterior: 7,50 % com a roleta de Fresnel na interface lisa que dispersa; 0,11 % com os lobos sem
        // sorteio. O limite de 0,5 % fica 15× abaixo do defeito.
        const disc = Math.round(0.7 * r);
        const tolerance = 0.1 * wall;
        const median = (values: number[]): number =>
            values.sort((a, b) => a - b)[values.length >> 1]!;
        let dots = 0;
        let flat = 0;
        for (let dy = -disc; dy <= disc; dy++) {
            for (let dx = -disc; dx <= disc; dx++) {
                if (dx * dx + dy * dy > disc * disc) continue;
                const window: [number, number, number][] = [];
                for (let oy = -2; oy <= 2; oy++)
                    for (let ox = -2; ox <= 2; ox++)
                        window.push(hdrAt(img, gx + dx + ox, gy + dy + oy));
                const lums = window.map(lum);
                const mid = median([...lums]);
                if (lums.filter((value) => Math.abs(value - mid) <= tolerance).length < 20)
                    continue;
                flat++;
                const own = window[12]!;
                const off = [0, 1, 2].some(
                    (k) => Math.abs(own[k]! - median(window.map((c) => c[k]!))) > tolerance,
                );
                if (off) dots++;
            }
        }
        log(
            `gallery: vidro — ${dots} pontos de grão em ${flat} pixels no meio das casas, no disco de 0,7 do raio (${((100 * dots) / flat).toFixed(2)} %)`,
        );
        check(
            flat > 2000,
            `gallery: o vidro quase não tem casas lisas para medir o grão (${flat})`,
        );
        check(dots / flat < 0.005, `gallery: o vidro tem grão (${dots} pontos em ${flat})`);

        // A borda do vidro: no anel do limbo (0,97 a 1,0 do raio), a variação de um pixel ao vizinho ao longo do
        // contorno — o serrilhado que a câmera ortográfica dava ali (a largura do cone do raio era 0).
        let jumps = 0;
        let steps = 0;
        let previous = -1;
        const turns = Math.round(2 * Math.PI * r);
        for (let k = 0; k <= turns; k++) {
            const a = (2 * Math.PI * k) / turns;
            const value = lum(
                hdrAt(
                    img,
                    Math.round(gx + 0.985 * r * Math.cos(a)),
                    Math.round(gy + 0.985 * r * Math.sin(a)),
                ),
            );
            if (previous >= 0) {
                steps++;
                if (Math.abs(value - previous) > 0.25 * wall) jumps++;
            }
            previous = value;
        }
        log(
            `gallery: vidro — borda (anel a 0,985 do raio): ${jumps} saltos de mais de um quarto da casa clara em ${steps} passos do contorno (${((100 * jumps) / steps).toFixed(1)} %)`,
        );
        // Os veios do mármore contra a porcelana lisa.
        const veins = contrast('marble', facing('marble'), 24);
        const china = contrast('porcelain', facing('porcelain'), 24);
        log(
            `gallery: contraste da estrutura (desvio / média em 49 × 49 px) — veios do mármore ${veins.toFixed(3)}, porcelana ${china.toFixed(3)}`,
        );
        check(veins > 2 * china, `gallery: o mármore não mostra os veios (${veins} × ${china})`);
    }
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

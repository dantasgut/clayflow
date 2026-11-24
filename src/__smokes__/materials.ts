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
//   - subsurface-terminator: a subsuperfície passa da linha de sombra, mais no vermelho (a difusão entre pixels numa
//     esfera de 16 mm);
//   - sss: a subsuperfície contra a referência f64 (`material/reference/subsurface.ts`) — o perfil radial de um feixe
//     estreito sobre uma placa (por canal, contra a convolução da fonte medida com o perfil de Burley, e a largura); a
//     conservação da energia (a difusão não cria nem perde luz; luz uniforme não muda); a transmissão pela espessura de
//     placas em contraluz; nada preparado sem material com subsuperfície; com MSAA e com o temporal;
//   - emission-hdr: emissão acima de 1 chega ao HDR sem corte;
//   - closure-mix: mistura por máscara contínua; dois especulares fundidos pela regra (α² médio);
//   - graph-specialization: grafo difuso + especular custa o mesmo que o material pronto; 60 s mudando valores sem
//     recompilar; religar recompila sem quadro sem o objeto;
//   - material-fn-compat: a função da 009 (`SurfaceParams`) desenha igual ao material pronto;
//   - transmission-layers: vidro atrás de vidro aparece; IOR 1 é invisível;
//   - sanitize: fechamento com NaN não chega ao HDR;
//   - gallery (US5): os materiais prontos (`Materials.*`), um quadro por família (madeira e couro, tecidos, plásticos e
//     metais, translúcidos — este em contraluz, com a subsuperfície a 55 unidades por metro) e o quadro da subsuperfície
//     (`subsuperficie`: o par de cera sem e com o espalhamento, a pele, a vela e as placas finas de mármore e de jade em
//     contraluz, com as medidas do que a difusão muda e o custo dos passes dela), câmera em perspectiva, cada um numa
//     esfera sobre uma placa do mesmo material, sob o sol, uma
//     luz de recorte rasante, o céu físico e a luz rebatida da cena (o que os lisos refletem) — a estrutura de cada um
//     à vista (o veio da madeira crua e sob o verniz, o grão do couro, a trama do jeans e do algodão, os flocos da
//     pintura, a ferrugem em manchas, os veios do mármore) e as medidas de reconhecimento: madeira crua sem realce
//     nítido e envernizada com, veludo com o centro escuro, a borda clara e sem realce nem manchas duras, metal polido
//     com o céu refletido por cima e o chão por baixo, metal escovado com o realce alongado, vidro transparente com o xadrez
//     refratado e sem grão no meio das casas, tecido fino com a luz ambiente do lado contra o sol; o custo de GPU por
//     quadro de cada família (`--query case=gallery&shot=1` grava os quadros em `fixtures/zzGallery-<família>.png`;
//     `&family=<família>` desenha só uma); o quadro do relevo (`relevo`, T115: o par da madeira bruta numa
//     `ParametricSurface` sem e com a `DisplacementFunction`, sob a luz rasante, de longe e de perto — o contorno da
//     esfera deslocada deixa de ser um círculo e o relevo faz sombra em si mesmo — e o custo de GPU; `&displace=0` o
//     mesmo quadro sem deslocamento) e o quadro dos panos (`panos`, T116: cada tecido num pano caído sobre uma bola,
//     com pregas, e a amostra plana ampliada — o brilho da seda desce pelas dobras);
//     os quadros da rodada 9 (T118): `cascas` e `telhados` (esferas grandes deslocadas), `folhas`, `rolhas`, o metal
//     escovado sobre o fundo escuro em `metais-2` (sem ruído ao longo da escova), o gelo com a parede xadrez atrás (o
//     fundo aparece através dele) e os brilhos pontuais da pintura e da neve;
//     os quadros da rodada 10 (T119): `cascas` e `folhas` na esfera de parametrização frontal (o uv não aperta nos
//     polos), com o deslocamento em várias escalas — o contorno das cascas irregular, o realce da folha cerosa em
//     pedaços e a fosca sem pico —, `pintura` com o floco físico (a fina sem grão longe do realce, a de floco grosso
//     com ele) e `madeira-clara` (o freixo cru sem e com a subsuperfície, sem e com o deslocamento: o terminador mais
//     macio com a difusão); na rodada 11, `telhados-casa`: além das esferas de `telhados`, a telha de barro e a
//     ardósia num telhado de duas águas (planos inclinados deslocados, a fileira da cumeeira, o beiral), de três
//     quartos, sob a luz rasante de lado;
//   - library-compose (US5): madeira crua e metal escovado (nós da biblioteca) misturados por ruído, e um material
//     pronto com a entrada da cor ligada a outro nó (xadrez).
// Para rodar: `npm run smoke -- materials [--query case=closure-mix]`. Resultado: `MATERIALS SMOKE PASSED` ou `FAIL: …`.
import {
    BoxGeometry,
    Camera,
    DirectionalLight,
    Displacements,
    FontLoader,
    GlobalIllumination,
    MaterialFunction,
    Materials,
    NodeGraph,
    nodes,
    ParametricSurface,
    PlaneGeometry,
    PointLight,
    RectLight,
    Sky,
    SphereGeometry,
    SpotLight,
    StandardMaterial,
    SurfaceFunction,
    Transform,
    UiPanel,
    UiText,
} from 'clayflow/web';
import type { Application, LobeName, MaterialName } from 'clayflow/web';
import { capture, nextGpuFrame, settle } from './support/extensionScenes';
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
import {
    burleyRadialPdf,
    burleyShape,
    burleyTransmission,
} from '../elements/material/reference/subsurface';

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
/** A saturação de uma cor linear: (máximo − mínimo) / máximo (0 no cinza). */
const saturation = (c: readonly number[]): number =>
    (Math.max(c[0]!, c[1]!, c[2]!) - Math.min(c[0]!, c[1]!, c[2]!))
    / Math.max(c[0]!, c[1]!, c[2]!, 1e-6);

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
    // A esfera de 0,8 unidade a 100 unidades por metro: 8 mm de raio, com o caminho livre médio de 2, 0,8 e 0,4 mm.
    sphere(
        app,
        -1,
        0,
        0.8,
        closureFn(
            'return closure_subsurface(vec3f(0.9, 0.6, 0.45), vec3f(2.0, 0.8, 0.4), 100.0);',
            ['subsurface'],
        ),
    );
    sphere(
        app,
        1,
        0,
        0.8,
        closureFn('return closure_diffuse(vec3f(0.9, 0.6, 0.45), 0.0);', ['diffuse']),
    );
    const img = await renderHdr(app, 4);
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

/** Material só de subsuperfície (sem especular): albedo, caminho livre médio em mm e a escala do mundo. */
function scatterFn(albedo: Vec3, mfp: Vec3, scale: number): MaterialFunction {
    const v = (a: Vec3): string => `vec3f(${a.map((x) => x.toFixed(6)).join(', ')})`;
    return closureFn(`return closure_subsurface(${v(albedo)}, ${v(mfp)}, ${scale.toFixed(1)});`, [
        'subsurface',
    ]);
}

/** Média de cada canal em anéis de 1 px em volta de (cx, cy), até `rings` px. */
function ringProfile(img: HdrImage, cx: number, cy: number, rings: number): number[][] {
    const sum = Array.from({ length: rings }, () => [0, 0, 0, 0]);
    for (let y = Math.ceil(cy - rings); y < cy + rings; y++)
        for (let x = Math.ceil(cx - rings); x < cx + rings; x++) {
            const k = Math.floor(Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
            if (k >= rings) continue;
            const c = hdrAt(img, x, y);
            const ring = sum[k]!;
            ring[0]! += c[0];
            ring[1]! += c[1];
            ring[2]! += c[2];
            ring[3]! += 1;
        }
    return sum.map((r) => [r[0]! / r[3]!, r[1]! / r[3]!, r[2]! / r[3]!]);
}

/**
 * A subsuperfície contra a referência f64: o perfil radial e a largura por canal de um feixe estreito sobre uma placa,
 * a conservação da energia, a luz uniforme e a transmissão pela espessura — com MSAA e com o temporal.
 */
async function caseSss(): Promise<void> {
    const rel = (a: number, b: number): number => Math.abs(a / b - 1);
    const pct = (x: number): string => `${(100 * x).toFixed(1)} %`;
    // ── O perfil radial, a largura e a energia: um feixe estreito sobre uma placa, a 1000 unidades por metro (a unidade
    // é o milímetro). O perfil decai em d e 3d, d = ℓ/s(A): 0,03, 0,02 e 0,01 unidade (12, 8 e 4 px).
    const ALBEDO: Vec3 = [0.8, 0.6, 0.4];
    const LENGTH: Vec3 = [0.03, 0.02, 0.01];
    const MFP = LENGTH.map((d, k) => d * burleyShape(ALBEDO[k]!)) as unknown as Vec3;
    const W = 480;
    const height = 1.2;
    const px = height / W;
    for (const antialias of ['msaa', 'temporal'] as const) {
        const { app, canvas } = await materialApp(W, W, engineErrors, { antialias });
        noAmbient(app);
        frontCamera(app, height);
        const before = app.world.queryBySchemaName('Subsurface').length;
        const spot = new SpotLight({
            position: [0, 0, 0.5, 1],
            direction: [0, 0, -1, 0],
            intensity: 2,
            innerCone: 0.05,
            outerCone: 0.07,
        });
        app.world.insert(spot);
        app.world.insert(
            new PlaneGeometry({ size: [3, 3] })
                .add(new StandardMaterial())
                .add(
                    new Transform({
                        position: [0, 0, 0, 1],
                        rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
                    }),
                )
                .add(scatterFn(ALBEDO, MFP, 1000)),
        );
        // O temporal desloca a amostra dentro do pixel a cada quadro: a integral do pixel.
        const shot = (): Promise<HdrImage> =>
            antialias === 'temporal' ? renderIntegral(app, 16) : renderHdr(app, 4);
        const on = await shot();
        const renderer = app.defaults.renderer;
        const allocated =
            app.resources.textureOf(renderer.subsurfaceResource, 'irradiance') !== undefined;
        const present = app.world.queryBySchemaName('Subsurface').length;
        renderer.subsurface.enabled = false;
        const off = await shot();
        check(
            before === 0 && present === 1 && allocated,
            `sss ${antialias}: o Subsurface devia entrar só com o material (antes ${before}, depois ${present}, alvos ${allocated})`,
        );
        // A fonte medida (a imagem sem a difusão é A·E/π) e o esperado: a fonte convoluída com o perfil de cada canal,
        // R̂(r) = pdf(r)/(2πr), com 3 × 3 pontos por pixel da fonte.
        const rings = 200;
        const c0 = W / 2;
        const source = ringProfile(off, c0, c0, rings);
        const measured = ringProfile(on, c0, c0, rings);
        const edge = source.findIndex((s, k) => k > 2 && s[0]! < 1e-4 * source[0]![0]!);
        const expected = (r: number, ch: number): number => {
            const d = LENGTH[ch]! / px;
            let sum = 0;
            for (let y = -edge; y < edge; y++)
                for (let x = -edge; x < edge; x++) {
                    const e = hdrAt(off, c0 + x, c0 + y)[ch]!;
                    if (e <= 0) continue;
                    for (let j = 0; j < 3; j++)
                        for (let i = 0; i < 3; i++) {
                            const dist = Math.hypot(x + (i + 0.5) / 3 - r, y + (j + 0.5) / 3, 1e-3);
                            sum += (e * burleyRadialPdf(dist, d)) / (2 * Math.PI * dist) / 9;
                        }
                }
            return sum;
        };
        const width = (profile: (k: number) => number, to: number): number => {
            let m0 = 0;
            let m2 = 0;
            for (let k = 0; k < to; k++) {
                const w = profile(k) * (k + 0.5);
                m0 += w;
                m2 += w * (k + 0.5) ** 2;
            }
            return Math.sqrt(m2 / m0);
        };
        const widths: number[] = [];
        for (let ch = 0; ch < 3; ch++) {
            const want = Array.from({ length: rings }, (_, k) => expected(k + 0.5, ch));
            // O perfil fora da fonte em faixas de 6 px, até onde o esperado cai a 10 % do valor na borda da fonte (além
            // disso cada faixa recebe menos de ~400 amostras da fonte pequena: o ruído delas, 5 %, passa da tolerância);
            // e a fração da energia a menos de cada raio (a medida da referência f64), em todos os raios.
            const band = (profile: (k: number) => number, k0: number): number => {
                let sum = 0;
                for (let k = k0; k < k0 + 6; k++) sum += profile(k) * (k + 0.5);
                return sum;
            };
            let worst = 0;
            let at = 0;
            let count = 0;
            const first = band((k) => want[k]!, edge + 2);
            for (let k = edge + 2; k + 6 < rings; k += 6) {
                const ref = band((j) => want[j]!, k);
                if (ref < 0.1 * first) break;
                const err = rel(
                    band((j) => measured[j]![ch]!, k),
                    ref,
                );
                if (err > worst) [worst, at] = [err, k];
                count++;
            }
            let accGot = 0;
            let accRef = 0;
            let totalGot = 0;
            let totalRef = 0;
            for (let k = 0; k < rings; k++) {
                totalGot += measured[k]![ch]! * (k + 0.5);
                totalRef += want[k]! * (k + 0.5);
            }
            let encircled = 0;
            for (let k = 0; k < rings; k++) {
                accGot += measured[k]![ch]! * (k + 0.5);
                accRef += want[k]! * (k + 0.5);
                encircled = Math.max(encircled, Math.abs(accGot / totalGot - accRef / totalRef));
            }
            const to = Math.min(rings, Math.round((12 * LENGTH[ch]!) / px) + edge);
            const got = width((k) => measured[k]![ch]!, to);
            const ref = width((k) => want[k]!, to);
            widths.push(got * px);
            // A energia: a soma da imagem com a difusão sobre a soma sem ela.
            let eOn = 0;
            let eOff = 0;
            for (let k = 0; k < rings; k++) {
                eOn += measured[k]![ch]! * (k + 0.5);
                eOff += source[k]![ch]! * (k + 0.5);
            }
            log(
                `sss ${antialias} canal ${'RGB'[ch]}: perfil radial em ${count} faixas de 6 px desde ${edge + 2} px — maior desvio ${pct(worst)} (em ${at} px); fração da energia por raio a menos de ${encircled.toFixed(4)}; largura (raio quadrático médio) ${(got * px).toFixed(4)} contra ${(ref * px).toFixed(4)} (${pct(rel(got, ref))}); energia com/sem difusão ${(eOn / eOff).toFixed(4)}`,
            );
            check(count >= 3, `sss ${antialias}: perfil do canal ${ch} sem pontos (${count})`);
            check(worst < 0.1, `sss ${antialias}: perfil radial do canal ${ch} a ${pct(worst)}`);
            check(
                encircled < 0.02,
                `sss ${antialias}: a fração da energia por raio do canal ${ch} a ${encircled} da referência`,
            );
            check(
                rel(got, ref) < 0.1,
                `sss ${antialias}: largura do canal ${ch} a ${pct(rel(got, ref))} da referência`,
            );
            check(
                rel(eOn, eOff) < 0.05,
                `sss ${antialias}: a difusão mudou a energia do canal ${ch} (${eOn / eOff})`,
            );
        }
        check(
            widths[0]! > 1.2 * widths[1]! && widths[1]! > 1.2 * widths[2]!,
            `sss ${antialias}: a largura não cresce do azul para o vermelho (${widths.join(', ')})`,
        );
        // Luz uniforme: a difusão não muda nada (a soma do perfil é 1).
        app.world.remove(spot);
        app.world.insert(new DirectionalLight({ direction: [0.3, 0, -1, 0], intensity: 3 }));
        const flatOff = await shot();
        renderer.subsurface.enabled = true;
        const flatOn = await shot();
        let flat = 0;
        for (let y = 100; y < W - 100; y += 7)
            for (let x = 100; x < W - 100; x += 7)
                for (let ch = 0; ch < 3; ch++)
                    flat = Math.max(flat, rel(hdrAt(flatOn, x, y)[ch]!, hdrAt(flatOff, x, y)[ch]!));
        log(`sss ${antialias}: luz uniforme — maior diferença com/sem difusão ${pct(flat)}`);
        check(flat < 0.02, `sss ${antialias}: a difusão mudou a luz uniforme (${pct(flat)})`);
        disposeApp(app, canvas);
    }

    // ── A transmissão pela espessura: placas de 0,3 a 2,4 mm (a 100 unidades por metro: a unidade é o centímetro) em
    // contraluz, com a espessura pelo mapa de sombra da luz — de ½ a 4 comprimentos do perfil do vermelho. A radiância
    // que sai pela frente é (L/π) · P(t), P a parte do perfil além da espessura. As placas ficam a mais de 20
    // comprimentos umas das outras (faces no mesmo plano trocariam luz pela difusão na tela).
    {
        const WT = 640;
        const HT = 160;
        const view = 1.6;
        const L = 3;
        const D: Vec3 = [0.06, 0.04, 0.02];
        const mfp = D.map((d, k) => 10 * d * burleyShape(ALBEDO[k]!)) as unknown as Vec3;
        const thicknesses = [0.03, 0.06, 0.12, 0.24];
        const { app, canvas } = await materialApp(WT, HT, engineErrors);
        noAmbient(app);
        frontCamera(app, view);
        app.world.insert(
            new DirectionalLight({ direction: [0, 0, 1, 0], intensity: L, castShadow: true }),
        );
        thicknesses.forEach((t, i) => {
            app.world.insert(
                new BoxGeometry({ size: [1, 1, t] })
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [(i - 1.5) * 1.5, 0, -t / 2, 1] }))
                    .add(scatterFn(ALBEDO, mfp, 100)),
            );
        });
        const img = await renderHdr(app, 30, 1200);
        app.defaults.renderer.subsurface.enabled = false;
        const dark = await renderHdr(app, 4);
        disposeApp(app, canvas);
        let worst = 0;
        thicknesses.forEach((t, i) => {
            const [x, y] = frontPixel((i - 1.5) * 1.5, 0, view, WT, HT);
            const got = hdrAt(img, x, y);
            const want = D.map((d) => (L / Math.PI) * burleyTransmission(t, d));
            const errs = got.map((g, k) => rel(g, want[k]!));
            // Abaixo de 1 % da luz que entra, a medida é o piso do formato: fora da conferência.
            errs.forEach((e, k) => {
                if (want[k]! > (0.01 * L) / Math.PI) worst = Math.max(worst, e);
            });
            log(
                `sss transmissão ${(10 * t).toFixed(1)} mm: ${got.map((v) => v.toFixed(4)).join(', ')} contra ${want.map((v) => v.toFixed(4)).join(', ')} (${errs.map(pct).join(', ')}); sem a subsuperfície ${lum(hdrAt(dark, x, y)).toFixed(5)}`,
            );
            check(
                lum(hdrAt(dark, x, y)) < 1e-4,
                `sss: a placa de ${10 * t} mm tem luz sem a subsuperfície (${lum(hdrAt(dark, x, y))})`,
            );
        });
        check(worst < 0.1, `sss: a transmissão pela espessura a ${pct(worst)} da referência`);
    }

    // ── Sem material com subsuperfície, nada entra na cena nem é alocado.
    {
        const { app, canvas } = await materialApp(64, 64, engineErrors);
        frontCamera(app, 2);
        sphere(app, 0, 0, 0.8, closureFn('return closure_diffuse(vec3f(0.8), 0.0);', ['diffuse']));
        await renderHdr(app, 2);
        const none = app.world.queryBySchemaName('Subsurface').length;
        const texture = app.resources.textureOf(
            app.defaults.renderer.subsurfaceResource,
            'irradiance',
        );
        disposeApp(app, canvas);
        log(
            `sss: cena sem subsuperfície — ${none} Subsurface na cena, alvos ${texture === undefined ? 'não alocados' : 'alocados'}`,
        );
        check(none === 0 && texture === undefined, 'sss: custo sem material com subsuperfície');
    }
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

/**
 * Uma família da galeria: o nome do quadro e os materiais, a fileira de trás e a da frente (3 ou 4 colunas: o quadro
 * tem 480 pixels de largura por coluna).
 */
interface GalleryFamily {
    readonly name: string;
    readonly rows: readonly [readonly (MaterialName | null)[], readonly (MaterialName | null)[]];
    /** A luz de recorte projeta sombra (a espessura que a luz atravessa nos materiais com subsuperfície). */
    readonly backlit?: boolean;
    /**
     * Quadro só de esferas grandes (raio `GALLERY_PLAIN_R`), sem a placa embaixo, sobre o chão escuro — as famílias
     * novas (spec 011, T117).
     */
    readonly plain?: boolean;
    /** Outra disposição das esferas (o padrão: a do quadro, pelo `plain`). */
    readonly layout?: GalleryLayout;
    /** A intensidade da luz de recorte, sem sombra (o padrão: 1,2) — a contraluz das folhas. */
    readonly rim?: number;
    /** O material que tem a parede xadrez atrás (o que se vê através dele); o vidro sempre tem. */
    readonly backdrop?: MaterialName;
    /**
     * A luz de estúdio (spec 011, T120): os painéis (`RectLight`, `GALLERY_PANELS`) no lugar do sol, do céu e da luz
     * de recorte, com o ambiente escuro — os realces são as manchas largas dos painéis, não o ponto do sol.
     */
    readonly studio?: boolean;
    /** O tom do chão e do fundo (o padrão: 0,3 com as placas, 0,12 nos quadros só de esferas). */
    readonly ground?: number;
    /** A radiância do ambiente do estúdio (o padrão: `GALLERY_STUDIO_AMBIENT`). */
    readonly ambient?: number;
    /** Os painéis do estúdio deste quadro (o padrão: `GALLERY_PANELS`). */
    readonly panels?: readonly StudioPanel[];
}

/** A disposição das esferas de um quadro: o raio, o passo das colunas e o z das duas fileiras. */
interface GalleryLayout {
    readonly radius: number;
    readonly dx: number;
    readonly z: readonly [number, number];
}

/** O quadro grande: uma fileira só (a da frente) de esferas de raio 0,95. */
const GALLERY_BIG: GalleryLayout = { radius: 0.95, dx: 2.25, z: [-1.55, 0.3] };
/** O quadro de uma esfera só, grande (raio 1,2: 340 pixels de raio no quadro). */
const GALLERY_ONE: GalleryLayout = { radius: 1.2, dx: 0, z: [-1.55, 0.7] };
/** O quadro grande de três esferas. */
const GALLERY_BIG3: GalleryLayout = { radius: 0.74, dx: 1.62, z: [-1.55, 0.3] };

/**
 * Os painéis do estúdio (`RectLight`): o principal, grande, do alto, à esquerda e à frente; o de preenchimento, menor,
 * à direita e mais baixo; e a faixa de recorte, do alto e de trás. Cada um virado para o meio da cena: a posição, o
 * tamanho (largura × altura) e a luminância.
 */
/** Um painel do estúdio: a posição, o tamanho (largura × altura) e a luminância. */
interface StudioPanel {
    readonly at: Vec3;
    readonly size: readonly [number, number];
    readonly luminance: number;
}
const GALLERY_PANELS: readonly StudioPanel[] = [
    { at: [-3.2, 4.6, 3.4], size: [4, 1.8], luminance: 7 },
    { at: [3.8, 2.6, 2.2], size: [2.2, 1.4], luminance: 5 },
    { at: [0.6, 5.2, -3.6], size: [4.4, 1], luminance: 6 },
];
/**
 * Os painéis do quadro do metal escovado: cinco, mais largos que altos (a escova corre na horizontal da esfera: as
 * manchas saem largas ao longo dela) — o principal do alto à esquerda, um do alto à direita, um baixo à direita, um
 * baixo à esquerda e a faixa de trás.
 */
const METAL_PANELS: readonly StudioPanel[] = [
    { at: [-3.4, 5.2, 4.2], size: [3.6, 1.3], luminance: 7 },
    { at: [3.6, 5.6, 3.2], size: [3, 1.1], luminance: 6 },
    { at: [4.6, 2.2, 4.6], size: [2.6, 0.9], luminance: 4 },
    { at: [-4.8, 1.8, 4.2], size: [2.4, 0.9], luminance: 3.5 },
    { at: [0.4, 5.4, -3.8], size: [4.6, 1], luminance: 6 },
];
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
        backlit: true,
    },
    // A pintura de carro metálica de floco fino em duas cores (no prata o metal sob o verniz é inconfundível) e a de
    // floco grosso.
    {
        name: 'pintura',
        rows: [[], ['carPaint', 'carPaintSilver', 'carPaintFlake']],
        plain: true,
        // O raio e as fileiras dos quadros só de esferas, com as colunas mais juntas (três esferas cabem no quadro).
        layout: { radius: 0.68, dx: 1.5, z: [-1.55, 1.3] },
    },
    // Os metais puros e os de acabamento (spec 011, T117), sob os painéis do estúdio.
    {
        name: 'metais',
        rows: [
            ['gold', 'copper', 'brass'],
            ['chrome', 'aluminiumAnodized', 'metalHammered'],
        ],
        plain: true,
        studio: true,
    },
    // O metal escovado também aqui, sobre o fundo escuro (no quadro `plasticos-metais` ele reflete a placa clara).
    {
        name: 'metais-2',
        rows: [['metalBrushed'], ['castIron', 'bronzePatina', 'carbonFiber']],
        plain: true,
        studio: true,
    },
    // O metal escovado sozinho, grande, no estúdio escuro: as manchas dos painéis cortadas pelos riscos.
    {
        name: 'metal-escovado',
        rows: [[], ['metalBrushed']],
        plain: true,
        studio: true,
        layout: GALLERY_ONE,
        ground: 0.02,
        ambient: 0.2,
        panels: METAL_PANELS,
    },
    {
        name: 'pedra',
        rows: [
            ['concrete', 'granite', 'sandstone'],
            ['brick', 'tile', 'plaster'],
        ],
        plain: true,
    },
    {
        name: 'terra',
        rows: [
            ['asphalt', 'terracotta'],
            ['driedMud', 'sand'],
        ],
        plain: true,
    },
    // As espécies de madeira (enceradas e envernizadas).
    {
        name: 'madeiras',
        rows: [
            ['woodPine', 'woodOak', 'woodWalnut'],
            ['woodOakVarnished', 'woodMahogany'],
        ],
        plain: true,
        studio: true,
    },
    // Os assoalhos (réguas e espinha de peixe), o papel e o freixo cru (o escovado está no quadro `madeira-clara`).
    {
        name: 'assoalhos',
        rows: [
            ['paper', 'woodAsh'],
            ['woodFloorPlanks', 'woodFloorHerringbone'],
        ],
        plain: true,
    },
    // Os de subsuperfície novos e a madrepérola, em contraluz (contas de 2,6 cm); o gelo, transparente, com a parede
    // xadrez atrás.
    {
        name: 'organicos',
        rows: [
            ['ice', 'soap', 'ivory'],
            ['motherOfPearl', 'snow'],
        ],
        backlit: true,
        plain: true,
        backdrop: 'ice',
    },
    // A cortiça: a rolha natural e a aglomerada, em esferas grandes.
    { name: 'rolhas', rows: [[], ['corkStopper', 'cork']], plain: true, layout: GALLERY_BIG },
];

/**
 * Escala do mundo da galeria para os materiais com subsuperfície (unidades por metro): as esferas de raio 0,55 são
 * contas de 2 cm de diâmetro — o raio de espalhamento, em milímetros, aparece nesse tamanho.
 */
const GALLERY_SCALE = 55;

/**
 * Escala do mundo da galeria para os materiais de relevo em milímetros (unidades por metro): as esferas de raio 0,55
 * são bolas de 20 cm de diâmetro — 2,5 mm de relevo são 2,5 % do raio.
 */
const GALLERY_RELIEF_SCALE = 5.5;

/** Os valores de um material pronto na galeria: as repetições do padrão e a escala do mundo, nos que os expõem. */
function galleryValues(
    name: MaterialName,
    pattern: readonly [number, number],
): Record<string, number | number[]> {
    const params = nodes.material[name].params;
    // A escala do mundo: a das contas de 2 cm nos de subsuperfície (o raio em mm); nos de relevo em milímetros, a das
    // bolas de 20 cm do quadro do relevo.
    const scale = 'radius' in params ? GALLERY_SCALE : GALLERY_RELIEF_SCALE;
    return {
        ...('pattern_scale' in params ? { pattern_scale: [...pattern] } : {}),
        ...('scale' in params ? { scale } : {}),
        // O tamanho de uma unidade do padrão em metros (os flocos da pintura, em micrômetros): meia volta da esfera
        // de raio 0,68 — uma bola de 25 cm — a 5,5 unidades por metro.
        ...('pattern_size' in params
            ? { pattern_size: (Math.PI * GALLERY_PLAIN_R) / GALLERY_RELIEF_SCALE }
            : {}),
    };
}

/** Geometria da galeria: esferas de raio `R` sobre placas de lado `TILE`, colunas a `DX` e fileiras em z = ∓`DZ`. */
const GALLERY_R = 0.55;
/** O raio das esferas dos quadros só de esferas (`plain`). */
const GALLERY_PLAIN_R = 0.68;
/** As fileiras dos quadros só de esferas (z): a de trás mais longe, para não ficar encoberta. */
const GALLERY_PLAIN_Z = [-1.55, 1.3] as const;
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
/** O ponto para onde os painéis estão virados. */
const GALLERY_PANEL_TARGET = [0, 0.6, 0] as const;
/** A luz ambiente do estúdio escuro (a radiância uniforme das paredes distantes). */
const GALLERY_STUDIO_AMBIENT = 0.08;
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

/**
 * Pixel (fracionário) do ponto de mundo `p` na câmera da galeria (ou na de posição `eye` e alvo `target`, com a mesma
 * abertura), num alvo de `w` × `h`.
 */
function galleryPixel(
    p: Vec3,
    w: number,
    h: number,
    eye: Vec3 = GALLERY_EYE,
    target: Vec3 = GALLERY_TARGET,
): [number, number] {
    const f = unit3(sub3(target, eye));
    const r = unit3(cross3(f, [0, 1, 0]));
    const u = cross3(r, f);
    const d = sub3(p, eye);
    const focal = h / 2 / Math.tan(GALLERY_FOV / 2);
    const z = dot3(d, f);
    return [w / 2 + (focal * dot3(d, r)) / z, h / 2 - (focal * dot3(d, u)) / z];
}

/** Um quadro da galeria medido: a imagem HDR, o centro de cada esfera no mundo e o custo de GPU por quadro. */
interface GalleryShot {
    readonly img: HdrImage;
    readonly center: ReadonlyMap<MaterialName | 'empty', Vec3>;
    /** O raio das esferas do quadro. */
    readonly radius: number;
    readonly gpuMs: number;
    readonly ready: number;
    /** O custo de GPU por quadro com a subsuperfície desligada (só nas famílias com contraluz). */
    readonly gpuPlain?: number;
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

/**
 * Os rótulos do quadro de prova: o nome de cada material escrito junto do objeto, pelo texto da interface do motor
 * (`UiText` sobre um `UiPanel` escuro, com o atlas de glifos do `FontLoader` ligado ao estágio da interface) — na
 * fileira da frente, no chão diante da placa; na de trás, acima da esfera. A posição é a do ponto projetado pela câmera
 * da galeria. Só no quadro gravado: as medidas leem o alvo HDR da cena, antes da interface. Devolve os painéis.
 */
async function galleryLabels(
    app: Application,
    center: ReadonlyMap<string, Vec3>,
    width: number,
    height: number,
    eye: Vec3 = GALLERY_EYE,
    target: Vec3 = GALLERY_TARGET,
    radius = GALLERY_R,
): Promise<UiPanel[]> {
    const size = 22;
    const font = await new FontLoader().load('Helvetica Neue, Arial, sans-serif', '', {
        fontSize: 2 * size,
    });
    app.defaults.ui.setFont(font);
    const panels: UiPanel[] = [];
    for (const [name, at] of center) {
        if (name === 'empty') continue;
        const front = at[2] > 0;
        const anchor: Vec3 = front
            ? [at[0], -0.1, at[2] + GALLERY_TILE / 2 + 0.16]
            : [at[0], 2 * radius + 0.12, at[2]];
        const [x, y] = galleryPixel(anchor, width, height, eye, target);
        let textWidth = 0;
        for (const ch of name) textWidth += (font.glyphs.get(ch)?.advance ?? size) / 2;
        const pad = 7;
        const panel = new UiPanel();
        panel.bounds = {
            x: Math.round(x - textWidth / 2 - pad),
            // Dentro do quadro (a fileira da frente chega à borda de baixo).
            y: Math.min(Math.round(y - size / 2 - pad), height - size - 2 * pad - 6),
            width: Math.round(textWidth + 2 * pad),
            height: size + 2 * pad,
        };
        panel.background = [0.04, 0.04, 0.05, 0.78];
        const text = new UiText();
        text.text = name;
        text.fontSize = size;
        text.color = [1, 1, 1, 1];
        text.bounds = {
            x: panel.bounds.x + pad,
            y: panel.bounds.y + pad - 2,
            width: 0,
            height: size,
        };
        panel.add(text);
        app.defaults.ui.ui.add(panel);
        panels.push(panel);
    }
    return panels;
}

/**
 * Diagnóstico (`stages=1`): o custo de GPU por passe do quadro `name` (mediana de 60 quadros; os carimbos por passe
 * alongam os passes de desenho no Apple — vale a proporção, não o total).
 */
async function galleryStages(app: Application, name: string): Promise<void> {
    const passes = new Map<string, number[]>();
    const off = app.events.on('gpuFrameTimed', (e) => {
        for (const [k, v] of Object.entries(e.passesMs)) {
            const list = passes.get(k) ?? [];
            list.push(v);
            passes.set(k, list);
        }
    });
    app.setProfiling('passes');
    for (let i = 0; i < 60; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
    }
    off();
    app.setProfiling('frame');
    const median = [...passes].map(([k, v]): [string, number] => {
        v.sort((x, y) => x - y);
        return [k, v[v.length >> 1] ?? 0];
    });
    median.sort((x, y) => y[1] - x[1]);
    log(
        `gallery ${name}: GPU por passe (ms) — ${median
            .filter(
                ([, v]) =>
                    v >= (new URLSearchParams(location.search).get('stages') === 'all' ? 0 : 0.05),
            )
            .map(([k, v]) => `${k} ${v.toFixed(2)}`)
            .join('; ')}`,
    );
}

/** Põe na cena um painel do estúdio (`RectLight`) virado para o meio dela, com a luminância `luminance`. */
function studioPanel(app: Application, panel: StudioPanel, luminance: number): void {
    const aim = unit3(sub3(GALLERY_PANEL_TARGET, panel.at));
    app.world.insert(
        new RectLight({
            position: [...panel.at, 1],
            direction: [...aim, 0],
            right: cross3(aim, [0, 1, 0]),
            size: panel.size,
            intensity: luminance,
        }),
    );
}

/** Desenha um quadro da galeria (uma família) e mede o custo de GPU por quadro; `shot` grava o PNG. */
async function galleryShot(
    family: GalleryFamily,
    width: number,
    height: number,
): Promise<GalleryShot> {
    const query = new URLSearchParams(location.search);
    // Diagnóstico (`aa=temporal`): o quadro no antisserrilhado temporal, o padrão do motor (as medidas são do MSAA).
    const { app, canvas } = await materialApp(width, height, engineErrors, {
        profiling: true,
        ...(query.get('aa') === 'temporal' ? { antialias: 'temporal' as const } : {}),
    });
    // Diagnóstico (`reflection=0`): o mesmo quadro sem o reflexo traçado dos opacos (o custo de antes).
    if (query.get('reflection') === '0') app.defaults.renderer.lightPaths.reflection = false;
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
    // Na família em contraluz, a luz de recorte é a principal (projeta sombra: a espessura que ela atravessa nos
    // materiais com subsuperfície vem do mapa dela) e o sol fica de preenchimento.
    const backlit = family.backlit === true;
    if (family.studio === true) {
        // O estúdio: os painéis, o ambiente escuro e a luz rebatida da cena.
        app.defaults.ambient.data.skyColor = [1, 1, 1, 1];
        app.defaults.ambient.data.groundColor = [1, 1, 1, 1];
        app.defaults.ambient.data.intensity = family.ambient ?? GALLERY_STUDIO_AMBIENT;
        for (const panel of family.panels ?? GALLERY_PANELS)
            studioPanel(app, panel, panel.luminance);
        app.world.insert(
            new GlobalIllumination({
                quality: 'medium',
                probeSpacing: 0.5,
                center: [0, 0.6, 0],
                screenGather: false,
            }),
        );
    } else {
        const sun = new DirectionalLight({
            direction: [...GALLERY_SUN.map((c) => -c), 0],
            intensity: backlit ? 1.2 : 3,
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
            new DirectionalLight({
                direction: [...GALLERY_RIM.map((c) => -c), 0],
                intensity: backlit ? 5 : (family.rim ?? 1.2),
                ...(backlit ? { castShadow: true } : {}),
            }),
        );
    }
    // Chão e fundo neutros (escuros nos quadros só de esferas).
    const plain = family.plain === true;
    const radius = family.layout?.radius ?? (plain ? GALLERY_PLAIN_R : GALLERY_R);
    const rowZ =
        family.layout?.z ?? (plain ? GALLERY_PLAIN_Z : ([-GALLERY_DZ, GALLERY_DZ] as const));
    const dx = family.layout?.dx ?? GALLERY_DX;
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, -0.1, 0, 1] }))
            .add(neutral(family.ground ?? (plain ? 0.12 : 0.3))),
    );
    galleryWall(app, [0, 5, -6], [40, 20], neutral(family.ground ?? (plain ? 0.12 : 0.3)));
    const center = new Map<MaterialName | 'empty', Vec3>();
    // O padrão do mesmo tamanho na esfera (o uv dá a volta em 2πR e vai de polo a polo em πR) e na placa.
    const tileScale = GALLERY_TILE / (Math.PI * GALLERY_R);
    family.rows.forEach((row, j) => {
        row.forEach((name, i) => {
            const at: Vec3 = [
                (i - (row.length - 1) / 2) * dx,
                plain ? radius - 0.1 : radius,
                rowZ[j]!,
            ];
            center.set(name ?? 'empty', at);
            if (name === null) return;
            app.world.insert(
                new SphereGeometry({ radius, latSegments: 96, lonSegments: 192 })
                    .add(new StandardMaterial())
                    // O eixo do uv inclinado 35° para trás: o polo de cima (onde o uv converge) fica atrás do limbo.
                    .add(
                        new Transform({
                            position: [...at, 1],
                            rotation: [Math.sin(-POLE_TILT / 2), 0, 0, Math.cos(-POLE_TILT / 2)],
                        }),
                    )
                    .add(Materials[name](galleryValues(name, [2, 1]))),
            );
            // A parte plana: a placa do mesmo material sob a esfera (o vidro fica sem, com a parede à vista atrás).
            if (name === 'glass' || plain) return;
            app.world.insert(
                new BoxGeometry({ size: [GALLERY_TILE, 0.1, GALLERY_TILE] })
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [at[0], -0.05, at[2], 1] }))
                    .add(Materials[name](galleryValues(name, [tileScale, tileScale]))),
            );
        });
    });
    const seenThrough = family.backdrop ?? (center.has('glass') ? 'glass' : undefined);
    if (seenThrough !== undefined) {
        // Atrás do vidro e do lugar vazio, a parede xadrez: o centro do vidro não cai num vértice do xadrez (a imagem
        // invertida pela esfera seria igual à direta). Atrás de outro transparente (`backdrop`), só atrás dele.
        const glass = center.get(seenThrough)!;
        const empty = center.get('empty') ?? glass;
        galleryWall(
            app,
            [
                (glass[0] + empty[0]) / 2,
                1.1,
                seenThrough === 'glass' ? GALLERY_WALL_Z : glass[2] - 0.95,
            ],
            [
                (center.has('empty') ? 8 : 6) * GALLERY_CELL,
                (center.has('empty') ? 6 : 8) * GALLERY_CELL,
            ],
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
    const gpuMs = samples[samples.length >> 1] ?? NaN;
    if (query.get('stages') !== null) await galleryStages(app, family.name);
    if (query.get('shot') !== null) {
        // O quadro de prova, depois das medidas (que leram o alvo HDR sem os rótulos): o nome de cada material junto
        // do objeto (`galleryLabels`).
        const labels = await galleryLabels(
            app,
            center,
            width,
            height,
            GALLERY_EYE,
            GALLERY_TARGET,
            radius,
        );
        for (let i = 0; i < 3; i++) {
            app.step(0);
            await nextGpuFrame(app);
        }
        // O canvas só vale na tarefa do quadro: um quadro e a captura, sem ceder entre os dois.
        app.step(0);
        await writeFixture(`zzGallery-${family.name}.png`, await toPng(capture(canvas)));
        for (const label of labels) label.visible = false;
    }
    // O custo dos passes da subsuperfície: o mesmo quadro com ela desligada no renderizador.
    let gpuPlain: number | undefined;
    if (family.backlit === true) {
        app.defaults.renderer.subsurface.enabled = false;
        await settle(app, 300);
        samples.length = 0;
        for (let i = 0; i < 60; i++) {
            app.step(1 / 60);
            await nextGpuFrame(app);
        }
        samples.sort((a, b) => a - b);
        gpuPlain = samples[samples.length >> 1] ?? NaN;
    }
    disposeApp(app, canvas);
    return { img, center, radius, gpuMs, ready, ...(gpuPlain !== undefined ? { gpuPlain } : {}) };
}

/** O quadro da subsuperfície: as imagens HDR com e sem a difusão, os pontos medidos e o custo de GPU de cada uma. */
interface SubsurfaceShot {
    readonly on: HdrImage;
    readonly off: HdrImage;
    readonly gpuOn: number;
    readonly gpuOff: number;
    /** Centros (mundo) das peças: as esferas e as placas. */
    readonly at: Readonly<Record<'waxPlain' | 'wax' | 'skin' | 'candle' | 'marble' | 'jade', Vec3>>;
}

/** Luzes do quadro da subsuperfície: a contraluz (rasante, por trás, com sombra) e a luz de lado (o terminador). */
const SSS_BACK = [-0.22, 0.42, -0.88] as const;
const SSS_SIDE = [-0.85, 0.35, 0.4] as const;
/** Espessuras (unidades; a 55 por metro): a vela de 8 mm, a placa de mármore de 1,5 mm e a de jade de 2 mm. */
const SSS_CANDLE = 0.44;
const SSS_MARBLE = 0.0825;
const SSS_JADE = 0.11;

/**
 * O quadro que mostra a subsuperfície (spec 011, T113), a 55 unidades por metro (as esferas são contas de 2 cm): na
 * frente, o par de cera sem e com o espalhamento (a mesma cera com o raio zero) e a pele; atrás, uma vela de cera de
 * 8 mm e duas placas finas em pé, de mármore (1,5 mm) e de jade (2 mm) — sob uma contraluz rasante que projeta sombra
 * (a espessura que ela atravessa vem do mapa dela), uma luz de lado mais fraca (o terminador nas esferas) e o
 * hemisfério baixo. Desenhado com a difusão e, depois, sem ela (`renderer.subsurface.enabled`), com o custo de GPU de
 * cada um; `shot` grava os dois quadros.
 */
async function subsurfaceShot(width: number, height: number): Promise<SubsurfaceShot> {
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
    app.defaults.ambient.data.intensity = 0.12;
    app.world.insert(
        new DirectionalLight({
            direction: [...SSS_BACK.map((c) => -c), 0],
            intensity: 6,
            castShadow: true,
        }),
    );
    app.world.insert(
        new DirectionalLight({ direction: [...SSS_SIDE.map((c) => -c), 0], intensity: 1.6 }),
    );
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, 0, 0, 1] }))
            .add(neutral(0.18)),
    );
    galleryWall(app, [0, 5, -6], [40, 20], neutral(0.12));
    const R = GALLERY_R;
    const front = (i: number): Vec3 => [(i - 1) * GALLERY_DX, R, GALLERY_DZ];
    const back = (i: number, h: number): Vec3 => [(i - 1) * GALLERY_DX, h / 2, -GALLERY_DZ];
    const ball = (at: Vec3, fn: MaterialFunction): void => {
        app.world.insert(
            new SphereGeometry({ radius: R, latSegments: 96, lonSegments: 192 })
                .add(new StandardMaterial())
                .add(new Transform({ position: [...at, 1] }))
                .add(fn),
        );
    };
    const block = (at: Vec3, size: Vec3, fn: MaterialFunction): void => {
        app.world.insert(
            new BoxGeometry({ size: [...size] })
                .add(new StandardMaterial())
                .add(new Transform({ position: [...at, 1] }))
                .add(fn),
        );
    };
    const at = {
        waxPlain: front(0),
        wax: front(1),
        skin: front(2),
        candle: back(0, 1.7),
        marble: back(1, 1.3),
        jade: back(2, 1.3),
    };
    // O par: a mesma cera, com o raio de espalhamento zero (a luz não sai do ponto em que entra) e com o da biblioteca.
    ball(at.waxPlain, Materials.wax({ scale: GALLERY_SCALE, radius: [0, 0, 0] }));
    ball(at.wax, Materials.wax({ scale: GALLERY_SCALE }));
    ball(at.skin, Materials.skin({ scale: GALLERY_SCALE }));
    block(at.candle, [SSS_CANDLE, 1.7, SSS_CANDLE], Materials.wax({ scale: GALLERY_SCALE }));
    block(
        at.marble,
        [1.2, 1.3, SSS_MARBLE],
        Materials.marble({ scale: GALLERY_SCALE, pattern_scale: [1, 1] }),
    );
    block(at.jade, [1.2, 1.3, SSS_JADE], Materials.jade({ scale: GALLERY_SCALE }));
    const gpu = async (): Promise<number> => {
        samples.length = 0;
        for (let i = 0; i < 60; i++) {
            app.step(1 / 60);
            await nextGpuFrame(app);
        }
        samples.sort((a, b) => a - b);
        return samples[samples.length >> 1] ?? NaN;
    };
    const shot = new URLSearchParams(location.search).get('shot') !== null;
    const save = async (name: string): Promise<void> => {
        if (!shot) return;
        // O canvas só vale na tarefa do quadro: um quadro e a captura, sem ceder entre os dois.
        app.step(0);
        await writeFixture(name, await toPng(capture(canvas)));
    };
    const on = await renderHdr(app, 40, 1500);
    const gpuOn = await gpu();
    await save('zzGallery-subsuperficie.png');
    app.defaults.renderer.subsurface.enabled = false;
    const off = await renderHdr(app, 8);
    const gpuOff = await gpu();
    await save('zzGallery-subsuperficie-sem.png');
    disposeApp(app, canvas);
    return { on, off, gpuOn, gpuOff, at };
}

/** Escala do mundo do quadro do relevo (unidades por metro): a dos materiais de relevo em milímetros da galeria. */
const RELIEF_SCALE = GALLERY_RELIEF_SCALE;
/**
 * A luz rasante do quadro do relevo (de onde vem): baixa, de frente e da esquerda (a sombra de uma esfera passa por
 * trás da vizinha); projeta sombra.
 */
const RELIEF_KEY = [-0.5, 0.2, 0.84] as const;
/** A câmera de perto do quadro do relevo: o par da madeira bruta, a metade da distância. */
const RELIEF_NEAR_TARGET = [-0.8, 0.3, 1.25] as const;
const RELIEF_NEAR_EYE = [-0.8, 0.3 + 0.5 * 4.75, 1.25 + 0.5 * 8.23] as const;
/** A malha adaptativa das peças deslocadas: os segmentos acompanham o tamanho na tela (cerca de 2 pixels). */
const RELIEF_MESH = { patches: [32, 16], maxLevel: 5, screen: 0.0022 } as const;

/** O quadro do relevo: a imagem HDR, os centros das peças e o custo de GPU por quadro. */
interface ReliefShot {
    readonly img: HdrImage;
    /** O par visto de perto (`RELIEF_NEAR_EYE`), com a sombra da luz rasante e sem ela. */
    readonly near: HdrImage;
    readonly nearUnshadowed: HdrImage;
    readonly at: ReadonlyMap<string, Vec3>;
    readonly gpuMs: number;
    readonly ready: number;
}

/** Os nomes das peças do quadro do relevo (os rótulos). */
const RELIEF_BUMP = 'woodRough: relevo na normal';
const RELIEF_DISPLACED = 'woodRough: deslocamento';

/**
 * O quadro que mostra o deslocamento (spec 011, T115), a 5,5 unidades por metro (as esferas são bolas de 20 cm), sob uma
 * luz rasante que projeta sombra: na frente, o par da madeira bruta — a mesma `ParametricSurface` com o mesmo material,
 * sem e com a `DisplacementFunction` (o relevo só na normal; o relevo na geometria), cada uma sobre a tábua do mesmo
 * jeito — e o couro deslocado; atrás, a madeira lixada (`woodRaw`, relevo raso na normal) e o couro só com a normal.
 * As peças deslocadas são superfícies paramétricas de malha adaptativa (`RELIEF_MESH`). Depois, o par visto de perto
 * (`zzGallery-relevo-perto.png`), com a sombra da luz rasante e sem ela.
 */
async function reliefShot(width: number, height: number): Promise<ReliefShot> {
    const query = new URLSearchParams(location.search);
    const { app, canvas } = await materialApp(width, height, engineErrors, { profiling: true });
    const samples: number[] = [];
    app.events.on('gpuFrameTimed', (e) => samples.push(e.totalMs));
    const view = new Transform({
        position: [...GALLERY_EYE, 1],
        rotation: Transform.lookRotation([...GALLERY_EYE], [...GALLERY_TARGET]),
    });
    app.world.insert(
        new Camera({ projection: 'perspective', fov: GALLERY_FOV, near: 0.5, far: 60 }).add(view),
    );
    // O sol alto e fraco (o céu e o preenchimento) e a luz rasante, a principal, com sombra.
    const sun = new DirectionalLight({
        direction: [...GALLERY_SUN.map((c) => -c), 0],
        intensity: 0.7,
    });
    app.world.insert(sun);
    app.world.insert(new Sky({ sun, sunDisk: false }));
    // Diagnóstico (`gi=0`): sem a luz rebatida (e sem os raios dela).
    if (query.get('gi') !== '0')
        app.world.insert(
            new GlobalIllumination({
                quality: 'medium',
                probeSpacing: 0.5,
                center: [0, 0.6, 0],
                screenGather: false,
            }),
        );
    const key = new DirectionalLight({
        direction: [...RELIEF_KEY.map((c) => -c), 0],
        intensity: 4,
        castShadow: true,
    });
    app.world.insert(key);
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, -0.1, 0, 1] }))
            .add(neutral(0.3)),
    );
    galleryWall(app, [0, 5, -6], [40, 20], neutral(0.3));
    const R = GALLERY_R;
    const tilt = [Math.sin(-POLE_TILT / 2), 0, 0, Math.cos(-POLE_TILT / 2)];
    const tileScale = GALLERY_TILE / (Math.PI * R);
    const half = GALLERY_TILE / 2;
    // Diagnóstico (`screen=<fração>`): o tamanho dos segmentos da malha na tela.
    const mesh = {
        ...RELIEF_MESH,
        screen: Number(query.get('screen') ?? RELIEF_MESH.screen),
        maxLevel: Number(query.get('level') ?? RELIEF_MESH.maxLevel),
    };
    /** Uma peça: a esfera e a tábua paramétricas com o material `name`, com ou sem o deslocamento dele. */
    const piece = (
        at: Vec3,
        name: 'woodRough' | 'leather' | 'woodRaw',
        displaced: boolean,
        tile: boolean,
    ): void => {
        const values = (pattern: readonly [number, number]): Record<string, number | number[]> => ({
            pattern_scale: [...pattern],
            ...('scale' in nodes.material[name].params ? { scale: RELIEF_SCALE } : {}),
        });
        // Só as peças deslocadas pedem a malha fina; as outras, a grade uniforme da mesma superfície (o mesmo uv).
        // Diagnóstico (`displace=0`): nenhuma deslocada — o custo do mesmo quadro sem o deslocamento.
        const moved = displaced && name !== 'woodRaw' && query.get('displace') !== '0';
        const ball = new ParametricSurface({
            preset: 'sphere',
            params: [R],
            ...(moved ? { adaptive: mesh } : { resolution: [193, 97] as const }),
        })
            .add(new StandardMaterial())
            .add(new Transform({ position: [...at, 1], rotation: tilt }))
            .add(Materials[name](values([2, 1])));
        if (moved) ball.add(Displacements[name](values([2, 1])));
        app.world.insert(ball);
        if (!tile) return;
        const board = new ParametricSurface({
            preset: 'plane',
            domain: [-half, half, -half, half],
            ...(moved
                ? { adaptive: { patches: [16, 16], maxLevel: mesh.maxLevel, screen: mesh.screen } }
                : { resolution: [2, 2] as const }),
        })
            .add(new StandardMaterial())
            .add(new Transform({ position: [at[0], 0, at[2], 1] }))
            .add(Materials[name](values([tileScale, tileScale])));
        if (moved) board.add(Displacements[name](values([tileScale, tileScale])));
        app.world.insert(board);
    };
    const front = (i: number): Vec3 => [(i - 1) * GALLERY_DX, R, GALLERY_DZ];
    // A fileira de trás mais longe (a sombra comprida das esferas da frente passa por baixo dela).
    const back = (i: number): Vec3 => [(i - 1) * GALLERY_DX, R - 0.1, -2.3];
    const at = new Map<string, Vec3>([
        [RELIEF_BUMP, front(0)],
        [RELIEF_DISPLACED, front(1)],
        ['leather: deslocamento', front(2)],
        ['woodRaw (lixada)', back(0)],
        ['leather: relevo na normal', back(2)],
    ]);
    piece(at.get(RELIEF_BUMP)!, 'woodRough', false, true);
    piece(at.get(RELIEF_DISPLACED)!, 'woodRough', true, true);
    piece(at.get('leather: deslocamento')!, 'leather', true, true);
    // Atrás, sem tábua (o fundo do contorno das esferas da frente fica neutro).
    piece(at.get('woodRaw (lixada)')!, 'woodRaw', false, false);
    piece(at.get('leather: relevo na normal')!, 'leather', false, false);
    const started = performance.now();
    const img = await renderHdr(app, GALLERY_FRAMES, 1500);
    const ready = performance.now() - started;
    samples.length = 0;
    for (let i = 0; i < 60; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
    }
    samples.sort((a, b) => a - b);
    const gpuMs = samples[samples.length >> 1] ?? NaN;
    if (query.get('stages') !== null) await galleryStages(app, 'relevo');
    if (query.get('shot') !== null) {
        const labels = await galleryLabels(app, at, width, height);
        for (let i = 0; i < 3; i++) {
            app.step(0);
            await nextGpuFrame(app);
        }
        app.step(0);
        await writeFixture('zzGallery-relevo.png', await toPng(capture(canvas)));
        for (const label of labels) label.visible = false;
    }
    // De perto: a câmera a meia distância do par (a malha adaptativa acompanha: os segmentos seguem o tamanho na tela).
    view.data.position = [...RELIEF_NEAR_EYE, 1];
    view.data.rotation = Transform.lookRotation([...RELIEF_NEAR_EYE], [...RELIEF_NEAR_TARGET]);
    const near = await renderHdr(app, 90, 1500);
    if (query.get('shot') !== null) {
        const pair = new Map<string, Vec3>([
            [RELIEF_BUMP, at.get(RELIEF_BUMP)!],
            [RELIEF_DISPLACED, at.get(RELIEF_DISPLACED)!],
        ]);
        const labels = await galleryLabels(
            app,
            pair,
            width,
            height,
            RELIEF_NEAR_EYE,
            RELIEF_NEAR_TARGET,
        );
        for (let i = 0; i < 3; i++) {
            app.step(0);
            await nextGpuFrame(app);
        }
        app.step(0);
        await writeFixture('zzGallery-relevo-perto.png', await toPng(capture(canvas)));
        for (const label of labels) label.visible = false;
    }
    // A mesma vista com a luz rasante sem sombra (trocada por outra igual que não projeta): o que muda é a sombra.
    app.world.remove(key);
    app.world.insert(
        new DirectionalLight({ direction: [...RELIEF_KEY.map((c) => -c), 0], intensity: 4 }),
    );
    const nearUnshadowed = await renderHdr(app, 60, 1500);
    disposeApp(app, canvas);
    return { img, near, nearUnshadowed, at, gpuMs, ready };
}

/**
 * As medidas do quadro do relevo: o contorno da esfera deslocada deixa de ser um círculo (o da esfera só com a normal
 * continua) e o relevo projeta sombra própria sob a luz rasante.
 */
async function galleryRelief(width: number, height: number): Promise<void> {
    const shot = await reliefShot(width, height);
    const R = GALLERY_R;
    const focal = height / 2 / Math.tan(GALLERY_FOV / 2);
    const forward = unit3(sub3(GALLERY_TARGET, GALLERY_EYE));
    let bad = 0;
    for (let k = 0; k < shot.img.data.length; k++) if (!Number.isFinite(shot.img.data[k]!)) bad++;
    check(bad === 0, `gallery relevo: ${bad} valores não finitos no alvo HDR`);
    /** Cor da madeira contra o fundo neutro: (r − b) / (r + b). */
    const chroma = (x: number, y: number): number => {
        const [r, , b] = hdrAt(shot.img, Math.round(x), Math.round(y));
        return (r - b) / Math.max(r + b, 1e-6);
    };
    /**
     * O contorno da esfera `name`: o raio (pixels, a partir do centro projetado) em que a cor passa da madeira ao
     * fundo, em 160 direções dos dois arcos laterais de cima (5° a 50° acima da horizontal: o fundo ali é o chão
     * neutro); devolve o desvio padrão do raio em torno da média móvel dele (± 6 direções: sem a perspectiva).
     */
    const limb = (name: string): { rough: number; found: number } => {
        const c = shot.at.get(name)!;
        const [cx, cy] = galleryPixel(c, width, height);
        const rp = (focal * R) / dot3(sub3(c, GALLERY_EYE), forward);
        const radii: number[][] = [[], []];
        for (let side = 0; side < 2; side++) {
            for (let k = 0; k < 80; k++) {
                const a = ((5 + (45 * k) / 79) * Math.PI) / 180;
                const dx = (side === 0 ? -1 : 1) * Math.cos(a);
                const dy = -Math.sin(a);
                const inside = chroma(cx + 0.88 * rp * dx, cy + 0.88 * rp * dy);
                const outside = chroma(cx + 1.14 * rp * dx, cy + 1.14 * rp * dy);
                if (!(inside - outside > 0.05)) continue;
                const mid = (inside + outside) / 2;
                // De fora para dentro, em passos de um quarto de pixel: o primeiro ponto com a cor da madeira.
                let prev = outside;
                for (let r = 1.14 * rp; r > 0.88 * rp; r -= 0.25) {
                    const v = chroma(cx + r * dx, cy + r * dy);
                    if (v >= mid) {
                        radii[side]!.push(r + (0.25 * (v - mid)) / Math.max(v - prev, 1e-6));
                        break;
                    }
                    prev = v;
                }
            }
        }
        let sum = 0;
        let count = 0;
        for (const arc of radii)
            for (let k = 6; k + 6 < arc.length; k++) {
                let mean = 0;
                for (let d = -6; d <= 6; d++) mean += arc[k + d]! / 13;
                sum += (arc[k]! - mean) ** 2;
                count++;
            }
        return { rough: Math.sqrt(sum / Math.max(count, 1)), found: count };
    };
    /**
     * A sombra própria do relevo na tábua da peça `name`, vista de perto, num trecho fora da sombra da esfera (o canto
     * da frente, do lado da luz): a fração dos pontos que escurecem mais de um quarto com a sombra da luz rasante — a
     * razão com a sombra / sem, abaixo de 0,75 da mediana do trecho (a mediana tira o que muda no trecho inteiro: a luz
     * rebatida). Uma face plana não faz sombra em si mesma (o que escurece nela é o viés da sombra, deslocado pela
     * normal do relevo); as cristas e as frestas da geometria deslocada fazem.
     */
    const boardShadow = (name: string): number => {
        const c = shot.at.get(name)!;
        const ratios: number[] = [];
        for (let k = 0; k < 96; k++)
            for (let i = 0; i < 96; i++) {
                const [x, y] = galleryPixel(
                    [c[0] - 0.62 + (0.4 * i) / 95, 0, c[2] + 0.38 + (0.28 * k) / 95],
                    width,
                    height,
                    RELIEF_NEAR_EYE,
                    RELIEF_NEAR_TARGET,
                );
                const lit = lum(hdrAt(shot.nearUnshadowed, Math.round(x), Math.round(y)));
                if (lit > 0) ratios.push(lum(hdrAt(shot.near, Math.round(x), Math.round(y))) / lit);
            }
        const sorted = [...ratios].sort((p, q) => p - q);
        const median = sorted[sorted.length >> 1] ?? 1;
        return ratios.filter((r) => r < 0.75 * median).length / Math.max(ratios.length, 1);
    };
    const bump = limb(RELIEF_BUMP);
    const moved = limb(RELIEF_DISPLACED);
    const shadeBump = boardShadow(RELIEF_BUMP);
    const shadeMoved = boardShadow(RELIEF_DISPLACED);
    log(
        `gallery relevo: ${shot.at.size} peças, ${width}×${height}; pronto em ${(shot.ready / 1000).toFixed(1)} s; GPU ${shot.gpuMs.toFixed(2)} ms por quadro (mediana); ${bad} valores não finitos`,
    );
    log(
        `gallery relevo: contorno da madeira bruta (desvio do raio, px, em ${bump.found} e ${moved.found} direções) — só normal ${bump.rough.toFixed(2)}, deslocada ${moved.rough.toFixed(2)}; sombra própria na tábua sob a luz rasante (fração dos pontos que escurecem mais de um quarto com a sombra) — só normal ${(100 * shadeBump).toFixed(2)} %, deslocada ${(100 * shadeMoved).toFixed(2)} %`,
    );
    if (new URLSearchParams(location.search).get('displace') === '0') return;
    check(
        bump.found >= 60 && moved.found >= 60,
        `gallery relevo: contorno não encontrado (${bump.found} e ${moved.found} direções)`,
    );
    // Sem meta apertada: o contorno deslocado passa de 0,4 px e de uma vez e meia o liso (que é o erro da medida).
    check(
        moved.rough > 0.4 && moved.rough > 1.5 * bump.rough,
        `gallery relevo: o contorno da madeira deslocada segue um círculo (${moved.rough.toFixed(2)} px; só normal ${bump.rough.toFixed(2)} px)`,
    );
    // Sem meta apertada: a tábua deslocada tem mais pontos na sombra do relevo que a plana (onde só o viés da sombra,
    // deslocado pela normal do relevo, escurece alguns pontos — mais com os sulcos fundos da fibra gasta, T117): pelo
    // menos uma vez e um quarto, e mais de 2 % dos pontos.
    check(
        shadeMoved > 0.02 && shadeMoved > 1.25 * shadeBump,
        `gallery relevo: sem sombra própria do relevo na tábua deslocada (${(100 * shadeMoved).toFixed(2)} % dos pontos; só normal ${(100 * shadeBump).toFixed(2)} %)`,
    );
}

/** O que um quadro de esferas deslocadas mede a mais: a imagem HDR, os centros das peças e o raio delas. */
type DisplacedMeasure = (
    img: HdrImage,
    at: ReadonlyMap<string, Vec3>,
    radius: number,
    /** O mesmo quadro com a subsuperfície desligada no renderizador (nos quadros `subsurface`). */
    plain?: HdrImage,
) => void;

/** Uma peça de um quadro de esferas deslocadas: o rótulo, o material, os valores a mais e se tem o deslocamento. */
interface DisplacedPiece {
    readonly label: string;
    readonly name: DisplacedName;
    readonly values?: Readonly<Record<string, number | number[]>>;
    /** Falso: a mesma esfera sem a `DisplacementFunction` (o relevo só na normal). */
    readonly displaced?: boolean;
}

/** Um quadro de esferas deslocadas: o nome, as duas fileiras e a disposição. */
interface DisplacedFrame {
    readonly name: string;
    readonly rows: readonly [readonly DisplacedName[], readonly DisplacedName[]];
    readonly layout: GalleryLayout;
    /** No lugar das fileiras: as peças da fileira da frente, cada uma com o seu rótulo e os seus valores. */
    readonly pieces?: readonly DisplacedPiece[];
    /** A escala do mundo (unidades por metro); o padrão: `RELIEF_SCALE`. */
    readonly scale?: number;
    /** As repetições do padrão por unidade de uv; o padrão: (2, 1) na esfera pronta e (1, 1) na frontal. */
    readonly pattern?: readonly [number, number];
    /** Valores a mais de um material do quadro (por cima dos do quadro). */
    readonly values?: Readonly<
        Partial<Record<DisplacedName, Readonly<Record<string, number | number[]>>>>
    >;
    /**
     * A esfera de parametrização frontal (`FRONT_SPHERE_CODE`): o uv não aperta nos polos — o padrão tem o mesmo
     * tamanho na face toda voltada para a câmera. O padrão: a esfera pronta (longitude e latitude).
     */
    readonly front?: boolean;
    /** O menor desvio do contorno (px) de cada peça; o padrão: 0,2. */
    readonly rough?: number;
    /** O quadro tem materiais com subsuperfície: lido de novo com a difusão desligada (a medida do que ela muda). */
    readonly subsurface?: boolean;
    readonly measure?: DisplacedMeasure;
    /** O painel principal do estúdio (`GALLERY_PANELS`) além das luzes do quadro, com essa luminância. */
    readonly panel?: number;
    /** De onde vem a luz rasante com sombra (o padrão: `RELIEF_KEY`). */
    readonly key?: Vec3;
    /** O albedo do chão e da parede do fundo (o padrão: 0,12). */
    readonly backdrop?: number;
}
type DisplacedName =
    | 'sandstone'
    | 'brick'
    | 'bark'
    | 'barkPine'
    | 'barkBirch'
    | 'woodRough'
    | 'driedMud'
    | 'roofTile'
    | 'roofSlate'
    | 'leaf'
    | 'leafMatte'
    | 'leafDry'
    | 'woodAsh'
    | 'woodAshBrushed'
    | 'woodPineFine';

/**
 * A esfera de parametrização frontal (spec 011, T119): o quadrado do uv vai ao disco (a grade elíptica: x = a √(1 −
 * b²/2), y = b √(1 − a²/2), suave) e o disco à esfera pela projeção azimutal de área igual de Lambert, com o centro do
 * uv no ponto da esfera voltado para +z e a borda do quadrado inteira no ponto oposto. Na esfera de longitude e
 * latitude o uv converge nos polos (as placas de uma casca apertam ali, como numa pinha); nesta, uma unidade de uv mede
 * 4 raios no centro e a área se conserva do disco à esfera — o padrão tem o mesmo tamanho em toda a face à vista, e o
 * ponto em que o uv degenera fica atrás.
 */
const FRONT_SPHERE_CODE = `fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    let a = clamp(2.0 * u - 1.0, -1.0, 1.0);
    let b = clamp(2.0 * v - 1.0, -1.0, 1.0);
    let d = vec2f(a * sqrt(1.0 - 0.5 * b * b), b * sqrt(1.0 - 0.5 * a * a));
    let r2 = min(dot(d, d), 1.0);
    let k = 2.0 * sqrt(1.0 - r2);
    return data.radius * vec3f(d.x * k, d.y * k, 1.0 - 2.0 * r2);
}`;

/**
 * Escala do mundo do quadro das folhas (unidades por metro): as esferas de raio 0,74 são bolas de 7 cm — a lâmina
 * (uma unidade de uv: 4 raios) tem 14 cm de largura, a de uma magnólia ou de um fícus grande, com a nervura central no
 * meio da face à vista.
 */
const LEAF_SCALE = 21;

/**
 * Escala do mundo do quadro das cascas (unidades por metro): as esferas de raio 0,74 são troncos de 42 cm — com 1,5
 * repetição do padrão por unidade de uv, as placas do carvalho têm 5,6 cm de largura e as fissuras, 16 mm de fundura
 * (7,5 % do raio). A bétula, um tronco mais fino, de 27 cm (as tiras enroladas, de 4 mm, a 3 % do raio).
 */
const BARK_SCALE = 3.5;

/**
 * Escala do mundo do quadro da madeira clara (unidades por metro): as esferas de raio 0,48 são bolas de 4,8 cm — o
 * relevo do freixo escovado (até 1,5 mm do fundo dos sulcos às cristas) é 6 % do raio e o caminho livre médio do
 * espalhamento (1,1 mm no vermelho), 4,6 %; com 1,5 repetição do padrão por unidade de uv (4 raios: 9,6 cm), uma
 * unidade do padrão são 6,4 cm de madeira — anéis de uns 2 mm.
 */
const WOOD_BEAD_SCALE = 20;

/** As peças do quadro da madeira clara: sem e com a subsuperfície, sem e com o deslocamento. */
const WOOD_PLAIN = 'sem SSS, relevo na normal';
const WOOD_SSS = 'com SSS, relevo na normal';
const WOOD_MOVED = 'sem SSS, deslocada';
const WOOD_BOTH = 'com SSS, deslocada';

/**
 * O realce de uma luz numa esfera: o pico sobre a mediana da janela e o número de pedaços dele — os componentes de pelo
 * menos 6 pixels com mais de 4 vezes a mediana (o que é claramente especular).
 */
function highlightPieces(
    img: HdrImage,
    c: Vec3,
    radius: number,
    light: Vec3,
): { ratio: number; pieces: number } {
    // O ponto da esfera em que a normal é a bissetriz da luz e de quem vê; a janela: 0,4 do raio em pixels.
    const v = unit3(sub3(GALLERY_EYE, c));
    const l = unit3(light);
    const h = unit3([l[0] + v[0], l[1] + v[1], l[2] + v[2]]);
    const [px, py] = galleryPixel(
        [c[0] + radius * h[0], c[1] + radius * h[1], c[2] + radius * h[2]],
        img.width,
        img.height,
    ).map(Math.round) as [number, number];
    const focal = img.height / 2 / Math.tan(GALLERY_FOV / 2);
    const half = Math.round(
        (0.4 * focal * radius)
            / dot3(sub3(c, GALLERY_EYE), unit3(sub3(GALLERY_TARGET, GALLERY_EYE))),
    );
    const side = 2 * half + 1;
    const values = new Float32Array(side * side);
    for (let j = 0; j < side; j++)
        for (let i = 0; i < side; i++)
            values[j * side + i] = lum(hdrAt(img, px + i - half, py + j - half));
    const sorted = [...values].sort((a, b) => a - b);
    const peak = sorted[sorted.length - 1]!;
    const median = Math.max(sorted[sorted.length >> 1]!, 1e-6);
    // Os pedaços: componentes (vizinhança de 8) de pelo menos 6 pixels acima do limiar.
    const level = 4 * median;
    const seen = new Uint8Array(side * side);
    let pieces = 0;
    for (let start = 0; start < values.length; start++) {
        if (seen[start] === 1 || values[start]! < level) continue;
        const stack = [start];
        seen[start] = 1;
        let size = 0;
        while (stack.length > 0) {
            const k = stack.pop()!;
            size++;
            const x = k % side;
            const y = (k - x) / side;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue;
                    const n = ny * side + nx;
                    if (seen[n] === 1 || values[n]! < level) continue;
                    seen[n] = 1;
                    stack.push(n);
                }
        }
        if (size >= 6) pieces++;
    }
    return { ratio: peak / median, pieces };
}

/** As medidas do quadro das folhas: o realce da cerosa em pedaços, a fosca sem pico, as cores. */
const measureLeaves: DisplacedMeasure = (img, at, radius) => {
    const glossy = highlightPieces(img, at.get('leaf')!, radius, RELIEF_KEY);
    const matte = highlightPieces(img, at.get('leafMatte')!, radius, RELIEF_KEY);
    const dry = highlightPieces(img, at.get('leafDry')!, radius, RELIEF_KEY);
    log(
        `gallery folhas: realce da luz principal (pico / mediana da janela de 0,4 do raio; pedaços de 6 px ou mais acima de 4 × a mediana) — leaf ${glossy.ratio.toFixed(1)}× em ${glossy.pieces} pedaços, leafMatte ${matte.ratio.toFixed(2)}× (${matte.pieces}), leafDry ${dry.ratio.toFixed(2)}× (${dry.pieces})`,
    );
    check(
        glossy.pieces > 1,
        `gallery folhas: o realce da folha cerosa é um só (${glossy.pieces} pedaço)`,
    );
    check(
        glossy.ratio > 2 * matte.ratio,
        `gallery folhas: a folha cerosa não brilha mais que a fosca (${glossy.ratio} × ${matte.ratio})`,
    );
    check(matte.ratio < 3, `gallery folhas: a folha fosca tem pico especular (${matte.ratio})`);
    // A cor média no disco de 0,6 do raio.
    const mean = (name: DisplacedName): Vec3 => {
        const c = at.get(name)!;
        const [cx, cy] = galleryPixel(c, img.width, img.height).map(Math.round) as [number, number];
        const focal = img.height / 2 / Math.tan(GALLERY_FOV / 2);
        const rp =
            (0.6 * focal * radius)
            / dot3(sub3(c, GALLERY_EYE), unit3(sub3(GALLERY_TARGET, GALLERY_EYE)));
        const sum = [0, 0, 0];
        let count = 0;
        for (let dy = -Math.floor(rp); dy <= rp; dy += 2)
            for (let dx = -Math.floor(rp); dx <= rp; dx += 2) {
                if (dx * dx + dy * dy > rp * rp) continue;
                hdrAt(img, cx + dx, cy + dy).forEach((value, k) => (sum[k]! += value));
                count++;
            }
        return sum.map((value) => value / Math.max(count, 1)) as unknown as Vec3;
    };
    const fmt = (c: Vec3): string => c.map((x) => x.toFixed(3)).join(', ');
    const green = mean('leaf');
    const grey = mean('leafMatte');
    const brown = mean('leafDry');
    log(
        `gallery folhas: cor média na esfera — cerosa (${fmt(green)}), fosca (${fmt(grey)}), seca (${fmt(brown)})`,
    );
    check(green[1] > 1.2 * green[0], 'gallery folhas: a folha não é verde');
    check(grey[1] > grey[0], 'gallery folhas: a folha fosca não é verde');
    check(brown[0] > 1.2 * brown[1], 'gallery folhas: a folha seca não é castanha');
};

/**
 * As medidas do quadro da madeira clara, na esfera lisa com a subsuperfície, do mesmo quadro com a difusão ligada e
 * desligada no renderizador (os mesmos pixels): a luz passa do terminador da luz principal, a queda através dele fica
 * mais suave e o lado iluminado não muda. A esfera de raio zero, ao lado, não muda com a difusão.
 */
const measureWood: DisplacedMeasure = (img, at, radius, plain) => {
    if (plain === undefined) return;
    const key = unit3(RELIEF_KEY);
    /** A luminância média numa janela de 9 × 9 no ponto do terminador de n·l = `x` mais voltado para quem vê. */
    const band = (from: HdrImage, label: string, x: number): number => {
        const c = at.get(label)!;
        const v = unit3(sub3(GALLERY_EYE, c));
        const along = dot3(v, key);
        const t = unit3([v[0] - along * key[0], v[1] - along * key[1], v[2] - along * key[2]]);
        const w = Math.sqrt(1 - x * x);
        const n: Vec3 = [x * key[0] + w * t[0], x * key[1] + w * t[1], x * key[2] + w * t[2]];
        const [px, py] = galleryPixel(
            [c[0] + radius * n[0], c[1] + radius * n[1], c[2] + radius * n[2]],
            from.width,
            from.height,
        ).map(Math.round) as [number, number];
        let sum = 0;
        for (let dy = -4; dy <= 4; dy++)
            for (let dx = -4; dx <= 4; dx++) sum += lum(hdrAt(from, px + dx, py + dy)) / 81;
        return sum;
    };
    const past = { on: band(img, WOOD_SSS, -0.08), off: band(plain, WOOD_SSS, -0.08) };
    const lit = { on: band(img, WOOD_SSS, 0.5), off: band(plain, WOOD_SSS, 0.5) };
    // A queda da luz através do terminador (de n·l = 0,15 a −0,15): mais suave com a subsuperfície.
    const drop = {
        on: band(img, WOOD_SSS, 0.15) - band(img, WOOD_SSS, -0.15),
        off: band(plain, WOOD_SSS, 0.15) - band(plain, WOOD_SSS, -0.15),
    };
    const zero = { on: band(img, WOOD_PLAIN, -0.08), off: band(plain, WOOD_PLAIN, -0.08) };
    log(
        `gallery madeira-clara: esfera com a subsuperfície, difusão ligada / desligada — depois do terminador (n·l = −0,08) ${past.on.toFixed(4)} / ${past.off.toFixed(4)} (${(past.on / Math.max(past.off, 1e-6)).toFixed(3)}×); queda de n·l = 0,15 a −0,15 ${drop.on.toFixed(4)} / ${drop.off.toFixed(4)}; lado iluminado (n·l = 0,5) ${lit.on.toFixed(4)} / ${lit.off.toFixed(4)}; esfera de raio zero, depois do terminador ${zero.on.toFixed(4)} / ${zero.off.toFixed(4)}`,
    );
    check(
        drop.on < drop.off,
        `gallery madeira-clara: o terminador não fica mais macio com a subsuperfície (${drop.on} × ${drop.off})`,
    );
    check(
        Math.abs(lit.on - lit.off) < 0.1 * lit.off,
        `gallery madeira-clara: a subsuperfície mudou o lado iluminado (${lit.on} × ${lit.off})`,
    );
    check(
        Math.abs(zero.on - zero.off) < 0.05 * zero.off,
        `gallery madeira-clara: a esfera de raio zero mudou com a difusão (${zero.on} × ${zero.off})`,
    );
    // A sombra dos sulcos na esfera deslocada, do lado iluminado (uma janela de 61 × 61 em n·l = 0,6): o décimo
    // percentil da luminância sobre a mediana — com a subsuperfície a luz atravessa as cristas e o fundo do sulco
    // clareia.
    const grooves = (from: HdrImage): number => {
        const c = at.get(WOOD_BOTH)!;
        const v = unit3(sub3(GALLERY_EYE, c));
        const along = dot3(v, key);
        const t = unit3([v[0] - along * key[0], v[1] - along * key[1], v[2] - along * key[2]]);
        const n: Vec3 = [
            0.6 * key[0] + 0.8 * t[0],
            0.6 * key[1] + 0.8 * t[1],
            0.6 * key[2] + 0.8 * t[2],
        ];
        const [px, py] = galleryPixel(
            [c[0] + radius * n[0], c[1] + radius * n[1], c[2] + radius * n[2]],
            from.width,
            from.height,
        ).map(Math.round) as [number, number];
        const values: number[] = [];
        for (let dy = -30; dy <= 30; dy++)
            for (let dx = -30; dx <= 30; dx++) values.push(lum(hdrAt(from, px + dx, py + dy)));
        values.sort((p, q) => p - q);
        return values[Math.floor(0.1 * values.length)]! / values[values.length >> 1]!;
    };
    const shade = { on: grooves(img), off: grooves(plain) };
    // A silhueta: o raio da borda da esfera do lado da luz (90 direções num arco de 120°), sem a média móvel de 9
    // direções — o desvio que sobra são as cristas e os sulcos do relevo no contorno.
    const rim = (label: string): number => {
        const c = at.get(label)!;
        const [cx, cy] = galleryPixel(c, img.width, img.height);
        const [kx, ky] = galleryPixel(
            [c[0] + radius * key[0], c[1] + radius * key[1], c[2] + radius * key[2]],
            img.width,
            img.height,
        );
        const [ex] = galleryPixel(
            [
                c[0] + radius * unit3(cross3(sub3(GALLERY_EYE, c), [0, 1, 0]))[0],
                c[1],
                c[2] + radius * unit3(cross3(sub3(GALLERY_EYE, c), [0, 1, 0]))[2],
            ],
            img.width,
            img.height,
        );
        const r0 = Math.abs(ex - cx);
        const toward = Math.atan2(ky - cy, kx - cx);
        const far = lum(
            hdrAt(
                img,
                Math.round(cx + 1.4 * r0 * Math.cos(toward)),
                Math.round(cy + 1.4 * r0 * Math.sin(toward)),
            ),
        );
        const radii: number[] = [];
        for (let k = 0; k < 90; k++) {
            const a = toward + ((k / 89 - 0.5) * 2 * Math.PI) / 3;
            let edge = 0.8 * r0;
            for (let r = 1.25 * r0; r > 0.8 * r0; r -= 0.25) {
                const value = lum(
                    hdrAt(img, Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))),
                );
                if (value > 2 * far + 0.02) {
                    edge = r;
                    break;
                }
            }
            radii.push(edge);
        }
        let sum = 0;
        let count = 0;
        for (let k = 4; k < radii.length - 4; k++) {
            let mean = 0;
            for (let j = -4; j <= 4; j++) mean += radii[k + j]! / 9;
            sum += (radii[k]! - mean) ** 2;
            count++;
        }
        return Math.sqrt(sum / count);
    };
    const edge = { flat: rim(WOOD_SSS), moved: rim(WOOD_BOTH) };
    log(
        `gallery madeira-clara: sombra dos sulcos na esfera deslocada (décimo percentil / mediana da luminância, lado iluminado) — com a difusão ${shade.on.toFixed(3)}, sem ${shade.off.toFixed(3)}; silhueta do lado da luz (desvio do raio da borda, px) — relevo na normal ${edge.flat.toFixed(2)}, deslocada ${edge.moved.toFixed(2)}`,
    );
    check(
        shade.on > shade.off,
        `gallery madeira-clara: a subsuperfície não clareia a sombra dos sulcos (${shade.on} × ${shade.off})`,
    );
    check(
        edge.moved > 2 * edge.flat && edge.moved > 0.5,
        `gallery madeira-clara: a silhueta da madeira escovada não mostra o relevo (${edge.moved} × ${edge.flat})`,
    );
};

/** As peças do quadro do pinho: com a subsuperfície e o deslocamento, e sem os dois. */
const PINE_BOTH = 'woodPineFine';
const PINE_PLAIN = 'sem SSS, sem deslocamento';
/**
 * A luz rasante do quadro do pinho (de onde vem): do alto e um pouco da esquerda, a uns 25° da face voltada para a
 * câmera e atravessada ao veio (que corre na horizontal da esfera) — as cristas do lenho tardio fazem sombra fina nos
 * sulcos; ao longo do veio a luz não faria sombra neles.
 */
const PINE_KEY: Vec3 = [-0.4, 0.9, -0.05];

/**
 * As medidas do quadro do pinho, sem meta apertada: o par difere na silhueta (o contorno dos dois lados, onde o veio
 * chega à borda: serrilhado na esfera deslocada, liso na outra) e no fundo dos sulcos (a sombra deles na esfera
 * deslocada, com a difusão da subsuperfície ligada e desligada no renderizador: ligada, o fundo clareia).
 */
const measurePine: DisplacedMeasure = (img, at, radius, plain) => {
    if (plain === undefined) return;
    const focal = img.height / 2 / Math.tan(GALLERY_FOV / 2);
    const forward = unit3(sub3(GALLERY_TARGET, GALLERY_EYE));
    const disc = (label: string): [number, number, number] => {
        const c = at.get(label)!;
        const [cx, cy] = galleryPixel(c, img.width, img.height);
        return [cx, cy, (focal * radius) / dot3(sub3(c, GALLERY_EYE), forward)];
    };
    // O contorno dos dois lados (± 40° da horizontal, 60 direções de cada lado): o raio em que a saturação passa da
    // do fundo neutro à da madeira, menos a média móvel de 9 direções.
    const rim = (label: string): number => {
        const [cx, cy, rp] = disc(label);
        let sum = 0;
        let count = 0;
        for (const side of [0, Math.PI]) {
            const radii: number[] = [];
            for (let k = 0; k < 60; k++) {
                const a = side + ((k / 59 - 0.5) * 80 * Math.PI) / 180;
                for (let r = 1.15 * rp; r > 0.85 * rp; r -= 0.25)
                    if (
                        saturation(
                            hdrAt(
                                img,
                                Math.round(cx + r * Math.cos(a)),
                                Math.round(cy - r * Math.sin(a)),
                            ),
                        ) > 0.2
                    ) {
                        radii.push(r);
                        break;
                    }
            }
            for (let k = 4; k + 4 < radii.length; k++) {
                let mean = 0;
                for (let j = -4; j <= 4; j++) mean += radii[k + j]! / 9;
                sum += (radii[k]! - mean) ** 2;
                count++;
            }
        }
        return Math.sqrt(sum / Math.max(count, 1));
    };
    // A sombra dos sulcos: o décimo percentil da luminância sobre a mediana, numa janela de 81 × 81 acima do meio da
    // esfera (a face que a luz rasante varre).
    const grooves = (from: HdrImage, label: string): number => {
        const [cx, cy, rp] = disc(label);
        const values: number[] = [];
        for (let dy = -40; dy <= 40; dy++)
            for (let dx = -40; dx <= 40; dx++)
                values.push(lum(hdrAt(from, Math.round(cx) + dx, Math.round(cy - 0.2 * rp) + dy)));
        values.sort((p, q) => p - q);
        return values[Math.floor(0.1 * values.length)]! / values[values.length >> 1]!;
    };
    const edge = { moved: rim(PINE_BOTH), flat: rim(PINE_PLAIN) };
    const shade = {
        on: grooves(img, PINE_BOTH),
        off: grooves(plain, PINE_BOTH),
        flat: grooves(img, PINE_PLAIN),
    };
    log(
        `gallery madeira-pinho: silhueta dos dois lados (desvio do raio da borda, px) — deslocada ${edge.moved.toFixed(2)}, sem deslocamento ${edge.flat.toFixed(2)}; sombra dos sulcos (décimo percentil / mediana da luminância) — deslocada com a difusão ${shade.on.toFixed(3)}, sem a difusão ${shade.off.toFixed(3)}; esfera sem SSS nem deslocamento ${shade.flat.toFixed(3)}`,
    );
    check(
        edge.moved > edge.flat + 0.3,
        `gallery madeira-pinho: a silhueta não mostra o relevo (${edge.moved} × ${edge.flat})`,
    );
    check(
        shade.on > shade.off,
        `gallery madeira-pinho: a subsuperfície não clareia o fundo dos sulcos (${shade.on} × ${shade.off})`,
    );
};

/**
 * Os quadros do deslocamento: os materiais de relevo em milímetros e a madeira bruta (`deslocamento`), as cascas
 * (`cascas`), os telhados (`telhados`) e as folhas (`folhas`), estes em esferas grandes (spec 011, T118 e T119); as
 * cascas e as folhas na esfera de parametrização frontal. Os telhados têm também o quadro do telhado de duas águas
 * (`telhados-casa`, `galleryRoofs`).
 */
const DISPLACED: readonly DisplacedFrame[] = [
    {
        name: 'deslocamento',
        rows: [['sandstone', 'brick', 'driedMud'], ['woodRough']],
        layout: { radius: GALLERY_PLAIN_R, dx: GALLERY_DX, z: GALLERY_PLAIN_Z },
    },
    {
        name: 'cascas',
        rows: [[], ['bark', 'barkPine', 'barkBirch']],
        layout: GALLERY_BIG3,
        scale: BARK_SCALE,
        pattern: [1.5, 1.5],
        values: { barkBirch: { scale: RELIEF_SCALE, pattern_scale: [1, 1] } },
        front: true,
        rough: 1,
    },
    { name: 'telhados', rows: [[], ['roofTile', 'roofSlate']], layout: GALLERY_BIG },
    {
        name: 'folhas',
        rows: [[], ['leaf', 'leafMatte', 'leafDry']],
        layout: GALLERY_BIG3,
        scale: LEAF_SCALE,
        front: true,
        rough: 0.1,
        measure: measureLeaves,
        panel: 3,
    },
    // A madeira clara e fosca escovada a fundo (o freixo escovado) em bolas de 4,8 cm: sem e com a subsuperfície (o raio zero e o do
    // material), sem e com o deslocamento — o que cada um acrescenta.
    {
        name: 'madeira-clara',
        rows: [[], []],
        pieces: [
            {
                label: WOOD_PLAIN,
                name: 'woodAshBrushed',
                values: { radius: [0, 0, 0] },
                displaced: false,
            },
            { label: WOOD_SSS, name: 'woodAshBrushed', displaced: false },
            { label: WOOD_MOVED, name: 'woodAshBrushed', values: { radius: [0, 0, 0] } },
            { label: WOOD_BOTH, name: 'woodAshBrushed' },
        ],
        // As colunas a 2,4 raios: a sombra de uma esfera não cai na vizinha.
        layout: { radius: 0.48, dx: 1.16, z: [-1.55, 0.3] },
        scale: WOOD_BEAD_SCALE,
        pattern: [1.5, 1.5],
        front: true,
        rough: 0.1,
        subsurface: true,
        measure: measureWood,
    },
    // O pinho claro de veio fino numa bola de 9,5 cm (uma unidade do padrão: 15,8 cm — anéis de 1,4 mm; o relevo de
    // 0,5 mm é 1 % do raio), com a subsuperfície e o deslocamento, e a mesma bola sem os dois, sob o painel largo do
    // alto à esquerda e a luz rasante atravessada ao veio, contra o fundo neutro médio.
    {
        name: 'madeira-pinho',
        rows: [[], []],
        pieces: [
            { label: PINE_BOTH, name: 'woodPineFine' },
            {
                label: PINE_PLAIN,
                name: 'woodPineFine',
                values: { radius: [0, 0, 0] },
                displaced: false,
            },
        ],
        layout: GALLERY_BIG,
        scale: 20,
        pattern: [1.2, 1.2],
        front: true,
        rough: 0.05,
        subsurface: true,
        panel: 5,
        key: PINE_KEY,
        backdrop: 0.3,
        measure: measurePine,
    },
];

/**
 * Um quadro do deslocamento (spec 011, T117 e T118), a 5,5 unidades por metro: cada material numa esfera paramétrica
 * de malha adaptativa (`RELIEF_MESH`) com a `DisplacementFunction` de mesmo nome — o relevo em milímetros na geometria
 * (a silhueta, a sombra das juntas, das rachaduras, dos sulcos e das fiadas) —, sob a luz rasante com sombra. As
 * medidas: desenhado, sem valores não finitos, e o contorno de cada esfera deixa de ser um círculo.
 */
async function galleryDisplaced(
    frame: DisplacedFrame,
    width: number,
    height: number,
): Promise<void> {
    const query = new URLSearchParams(location.search);
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
    const sun = new DirectionalLight({
        direction: [...GALLERY_SUN.map((c) => -c), 0],
        intensity: 1.2,
    });
    app.world.insert(sun);
    app.world.insert(new Sky({ sun, sunDisk: false }));
    if (frame.panel !== undefined) studioPanel(app, GALLERY_PANELS[0]!, frame.panel);
    app.world.insert(
        new GlobalIllumination({
            quality: 'medium',
            probeSpacing: 0.5,
            center: [0, 0.6, 0],
            screenGather: false,
        }),
    );
    app.world.insert(
        new DirectionalLight({
            direction: [...(frame.key ?? RELIEF_KEY).map((c) => -c), 0],
            intensity: 3.5,
            castShadow: true,
        }),
    );
    const backdrop = frame.backdrop ?? 0.12;
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, -0.1, 0, 1] }))
            .add(neutral(backdrop)),
    );
    galleryWall(app, [0, 5, -6], [40, 20], neutral(backdrop));
    const R = frame.layout.radius;
    const front = frame.front === true;
    const tilt = [Math.sin(-POLE_TILT / 2), 0, 0, Math.cos(-POLE_TILT / 2)];
    const at = new Map<string, Vec3>();
    const moved = new Set<string>();
    // As peças: as do quadro, na fileira da frente, ou uma por material das duas fileiras.
    const pieces: { piece: DisplacedPiece; c: Vec3 }[] =
        frame.pieces !== undefined
            ? frame.pieces.map((piece, i) => ({
                  piece,
                  c: [(i - (frame.pieces!.length - 1) / 2) * frame.layout.dx, R, frame.layout.z[1]],
              }))
            : frame.rows.flatMap((row, j) =>
                  row.map((name, i) => ({
                      piece: { label: name, name },
                      c: [
                          (i - (row.length - 1) / 2) * frame.layout.dx,
                          R,
                          frame.layout.z[j]!,
                      ] as Vec3,
                  })),
              );
    for (const { piece, c } of pieces) {
        const { name } = piece;
        at.set(piece.label, c);
        // Na esfera pronta o uv dá a volta em 2πR e vai de polo a polo em πR: (2, 1) repetições; na frontal, uma
        // unidade de uv mede o mesmo nos dois eixos.
        const values = {
            pattern_scale: [...(frame.pattern ?? (front ? [1, 1] : [2, 1]))],
            scale: frame.scale ?? RELIEF_SCALE,
            ...frame.values?.[name],
        };
        const ball = front
            ? new ParametricSurface({
                  domain: [0, 1, 0, 1],
                  adaptive: { ...RELIEF_MESH, patches: [24, 24], periodic: [false, false] },
              }).add(
                  new SurfaceFunction({
                      code: FRONT_SPHERE_CODE,
                      params: { radius: 'f32' },
                      values: { radius: R },
                  }),
              )
            : new ParametricSurface({ preset: 'sphere', params: [R], adaptive: RELIEF_MESH });
        ball.add(new StandardMaterial())
            // O eixo +z da esfera frontal (o centro do uv) inclinado 35° para cima: voltado para a câmera.
            .add(new Transform({ position: [...c, 1], rotation: tilt }))
            .add(Materials[name]({ ...values, ...piece.values }));
        if (piece.displaced !== false) {
            ball.add(Displacements[name](values));
            moved.add(piece.label);
        }
        app.world.insert(ball);
    }
    const started = performance.now();
    const img = await renderHdr(app, GALLERY_FRAMES, 1500);
    const ready = performance.now() - started;
    samples.length = 0;
    for (let i = 0; i < 60; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
    }
    samples.sort((a, b) => a - b);
    const gpuMs = samples[samples.length >> 1] ?? NaN;
    if (query.get('shot') !== null) {
        const labels = await galleryLabels(app, at, width, height, GALLERY_EYE, GALLERY_TARGET, R);
        for (let i = 0; i < 3; i++) {
            app.step(0);
            await nextGpuFrame(app);
        }
        app.step(0);
        await writeFixture(`zzGallery-${frame.name}.png`, await toPng(capture(canvas)));
        for (const label of labels) label.visible = false;
    }
    // O mesmo quadro com a subsuperfície desligada no renderizador: o que a difusão muda, e o custo dos passes dela.
    let plain: HdrImage | undefined;
    if (frame.subsurface === true) {
        app.defaults.renderer.subsurface.enabled = false;
        plain = await renderHdr(app, 30, 600);
        samples.length = 0;
        for (let i = 0; i < 60; i++) {
            app.step(1 / 60);
            await nextGpuFrame(app);
        }
        samples.sort((a, b) => a - b);
        log(
            `gallery ${frame.name}: GPU ${(samples[samples.length >> 1] ?? NaN).toFixed(2)} ms por quadro sem a subsuperfície`,
        );
    }
    disposeApp(app, canvas);
    let bad = 0;
    for (let k = 0; k < img.data.length; k++) if (!Number.isFinite(img.data[k]!)) bad++;
    log(
        `gallery ${frame.name}: ${at.size} peças deslocadas, ${width}×${height}; pronto em ${(ready / 1000).toFixed(1)} s; GPU ${gpuMs.toFixed(2)} ms por quadro (mediana); ${bad} valores não finitos`,
    );
    check(bad === 0, `gallery ${frame.name}: ${bad} valores não finitos no alvo HDR`);
    // O contorno de cada esfera: o raio em que a luminância passa do fundo escuro à peça, em 120 direções do arco de
    // cima; o desvio padrão dele em torno da média móvel (± 5 direções) — zero num círculo.
    const focal = height / 2 / Math.tan(GALLERY_FOV / 2);
    const forward = unit3(sub3(GALLERY_TARGET, GALLERY_EYE));
    const rough: string[] = [];
    for (const [name, c] of at) {
        const [cx, cy] = galleryPixel(c, width, height);
        const rp = (focal * R) / dot3(sub3(c, GALLERY_EYE), forward);
        const radii: number[] = [];
        for (let k = 0; k < 120; k++) {
            const a = ((20 + (140 * k) / 119) * Math.PI) / 180;
            const dx = Math.cos(a);
            const dy = -Math.sin(a);
            // Contra o fundo claro a luminância não separa a peça: a saturação (o fundo é neutro).
            const value = (r: number): number =>
                (frame.backdrop === undefined ? lum : saturation)(
                    hdrAt(img, Math.round(cx + r * dx), Math.round(cy + r * dy)),
                );
            const inside = value(0.85 * rp);
            const outside = value(1.2 * rp);
            if (!(inside > 1.3 * outside)) continue;
            const mid = (inside + outside) / 2;
            for (let r = 1.2 * rp; r > 0.85 * rp; r -= 0.25)
                if (value(r) >= mid) {
                    radii.push(r);
                    break;
                }
        }
        let sum = 0;
        let count = 0;
        for (let k = 5; k + 5 < radii.length; k++) {
            let mean = 0;
            for (let d = -5; d <= 5; d++) mean += radii[k + d]! / 11;
            sum += (radii[k]! - mean) ** 2;
            count++;
        }
        const deviation = Math.sqrt(sum / Math.max(count, 1));
        rough.push(`${name} ${deviation.toFixed(2)} (${count})`);
        // Sem meta apertada: o contorno encontrado em pelo menos 15 direções (a casca escura some contra o fundo do
        // lado da sombra) e fora de um círculo.
        if (!moved.has(name)) continue;
        check(count >= 15, `gallery ${frame.name}: contorno de ${name} não encontrado (${count})`);
        check(
            deviation > (frame.rough ?? 0.2),
            `gallery ${frame.name}: o contorno de ${name} segue um círculo (${deviation.toFixed(2)} px)`,
        );
    }
    log(
        `gallery ${frame.name}: contorno (desvio do raio, px, e direções medidas) — ${rough.join(', ')}`,
    );
    frame.measure?.(img, at, R, plain);
}

/**
 * Escala do mundo do quadro dos telhados (unidades por metro): cada água tem 3,6 m de largura por 4 m de queda — 18
 * colunas e 10 fiadas de telha de barro (20 cm × 40 cm à vista), 12 colunas e 20 fiadas de ardósia (30 cm × 20 cm).
 */
const ROOF_SCALE = 0.4;
/** A inclinação das águas e o giro da casa em torno da vertical (a empena esquerda e a água da frente à vista). */
const ROOF_PITCH = (28 * Math.PI) / 180;
const ROOF_YAW = (20 * Math.PI) / 180;
/** A largura (ao longo da cumeeira) e a queda (da cumeeira ao beiral) de uma água, em metros. */
const ROOF_WIDTH = 3.6;
const ROOF_FALL = 4;
/** O beiral além da parede, na queda e na empena, e a altura da parede (m): baixa — o telhado é o assunto. */
const ROOF_EAVE = 0.45;
const ROOF_VERGE = 0.25;
const ROOF_WALL = 1.2;
/** A distância do centro de cada casa ao meio do quadro e o recuo dela. */
/** As repetições do padrão por água (em u e em v). */
const ROOF_PATTERN = 2;
const ROOF_DX = 1.25;
const ROOF_Z = -0.7;
/**
 * A luz rasante do quadro dos telhados (de onde vem, no referencial da casa: x ao longo da cumeeira, z a queda da água
 * da frente): do lado da empena direita, um pouco de trás da cumeeira e a 16° do plano da água da frente — as capas
 * fazem sombra nos canais e o pé de cada fiada, na fiada de baixo; a sombra de uma casa cai no chão, não na vizinha.
 */
const ROOF_KEY: Vec3 = [0.86, 0.46, -0.22];

/**
 * Uma água do telhado: o plano inclinado de `pitch` que desce da cumeeira (v = 0, na origem) ao beiral (v = 1), com u
 * ao longo da cumeeira no sentido em que a normal (du × dv) aponta para fora — as fiadas correm em u e o pé das telhas
 * fica para o lado de v maior, o da queda.
 */
const ROOF_SLOPE_CODE = `fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f((0.5 - u) * data.width, -v * data.fall * sin(data.pitch), v * data.fall * cos(data.pitch));
}`;

/**
 * A fileira da cumeeira: meio cilindro ao longo dela (v), u em volta — de uma água à outra por cima —, com as bordas
 * `drop` abaixo da origem (apoiadas nas capas das duas águas). A normal aponta para fora.
 */
const ROOF_RIDGE_CODE = `fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    let a = 3.14159265 * u;
    return vec3f((0.5 - v) * data.width, data.radius * sin(a) - data.drop, data.radius * cos(a));
}`;

/**
 * A empena: o trapézio da parede sob as duas águas, do topo da parede (v = 0, meia largura `half`) até logo abaixo da
 * cumeeira (v = 1), no plano x = 0.
 */
const ROOF_GABLE_CODE = `fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f(0.0, v * data.rise, (2.0 * u - 1.0) * data.half * (1.0 - 0.97 * v));
}`;

/** Um telhado do quadro: o material, as colunas e as fiadas de cada água e os valores a mais (mm, cobertura). */
interface RoofPiece {
    readonly name: 'roofTile' | 'roofSlate';
    readonly tiles: readonly [number, number];
    /** Os valores do relevo (no material e no deslocamento). */
    readonly relief: Readonly<Record<string, number>>;
    /** Os valores só do material. */
    readonly look: Readonly<Record<string, number | number[]>>;
    /** A cumeeira de telhas (as capas ao longo do topo): quantas, o raio (m) e a altura do relevo delas (mm). */
    readonly ridge?: { readonly count: number; readonly radius: number; readonly lift: number };
}

const ROOFS: readonly RoofPiece[] = [
    {
        name: 'roofTile',
        tiles: [18, 10],
        relief: { lift: 100 },
        look: { lichen: 0.46 },
        ridge: { count: 9, radius: 0.15, lift: 30 },
    },
    // A ardósia mais grossa da faixa real (14 mm entre o fundo e o topo de duas placas) e a cumeeira de placas dela.
    {
        name: 'roofSlate',
        tiles: [12, 20],
        relief: { lift: 14 },
        // O escorrido da ardósia em tom de ferrugem (a pirita da pedra): o escuro do material some no cinza dela.
        look: { lichen: 0.42, stain_color: [0.17, 0.12, 0.075] },
        ridge: { count: 8, radius: 0.09, lift: 8 },
    },
];

/** O ponto do mundo de (x, y, z) no referencial da casa de origem `o` (a cumeeira), girada de `ROOF_YAW`. */
function roofPoint(o: Vec3, p: Vec3): Vec3 {
    const c = Math.cos(ROOF_YAW);
    const s = Math.sin(ROOF_YAW);
    return [o[0] + p[0] * c + p[2] * s, o[1] + p[1], o[2] - p[0] * s + p[2] * c];
}

/**
 * O quadro dos telhados de duas águas (`telhados-casa`; spec 011, T119, rodada 11) — a amostra a mais dos telhados, além das esferas de `telhados`: a telha de barro de capa e canal e a ardósia num telhado de duas
 * águas — cada água uma `ParametricSurface` plana de malha adaptativa (`ROOF_SLOPE_CODE`) com a `DisplacementFunction`
 * do material, o pé das telhas para o beiral, e a fileira da cumeeira (`ROOF_RIDGE_CODE`, o mesmo material com uma
 * coluna e as fiadas ao longo dela; o relevo da telha de barro a 100 mm, o da telha de capa e canal de verdade) —, sobre paredes baixas com as empenas, a casa girada de
 * três quartos, sob a luz rasante de lado com sombra (`ROOF_KEY`). As medidas, na água da frente: desenhado, sem
 * valores não finitos, a luminância dobrada pela fase da fiada muda ao longo da queda (a sombra da sobreposição) e, na
 * telha de barro, a dobrada pela fase da coluna também (a capa e o canal).
 */
async function galleryRoofs(width: number, height: number): Promise<void> {
    const query = new URLSearchParams(location.search);
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
    // A luz de preenchimento: a do sol da galeria vinda da frente e da esquerda (a empena à vista, as paredes, o
    // fundo), fraca — não projeta sombra: forte, apagaria a das capas e a do pé das fiadas.
    const sun = new DirectionalLight({
        direction: [GALLERY_SUN[0], -GALLERY_SUN[1], -GALLERY_SUN[2], 0],
        intensity: 0.7,
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
    const key = unit3(sub3(roofPoint([0, 0, 0], ROOF_KEY), [0, 0, 0]));
    app.world.insert(
        new DirectionalLight({
            direction: [...key.map((c) => -c), 0],
            intensity: 6,
            castShadow: true,
        }),
    );
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, -0.1, 0, 1] }))
            .add(neutral(0.12)),
    );
    galleryWall(app, [0, 5, -6], [40, 20], neutral(0.12));
    const S = ROOF_SCALE;
    const W = ROOF_WIDTH * S;
    const L = ROOF_FALL * S;
    // A parede: recuada do beiral e da borda da empena; o topo dela logo abaixo do plano das águas.
    const halfSpan = L * Math.cos(ROOF_PITCH) - ROOF_EAVE * S;
    const halfLength = W / 2 - ROOF_VERGE * S;
    const rise = halfSpan * Math.tan(ROOF_PITCH);
    const under = 0.05 * S;
    const wall = ROOF_WALL * S;
    const turn = (angle: number): number[] => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
    const origin = new Map<string, Vec3>();
    ROOFS.forEach((roof, i) => {
        const o: Vec3 = [
            (i - (ROOFS.length - 1) / 2) * 2 * ROOF_DX,
            -0.1 + wall + under + rise,
            ROOF_Z,
        ];
        origin.set(roof.name, o);
        // Duas unidades do padrão por água em cada eixo (as manchas e o líquen na escala de algumas telhas), com as
        // colunas e as fiadas inteiras: o pé da última fiada no beiral.
        const values = {
            pattern_scale: [ROOF_PATTERN, ROOF_PATTERN],
            scale: S,
            tiles: [roof.tiles[0] / ROOF_PATTERN, -roof.tiles[1] / ROOF_PATTERN],
            ...roof.relief,
        };
        // As duas águas: a da frente e a de trás (a mesma, meia volta em torno da vertical).
        for (const back of [false, true])
            app.world.insert(
                new ParametricSurface({
                    domain: [0, 1, 0, 1],
                    adaptive: { ...RELIEF_MESH, patches: [24, 24], periodic: [false, false] },
                })
                    .add(
                        new SurfaceFunction({
                            code: ROOF_SLOPE_CODE,
                            params: { width: 'f32', fall: 'f32', pitch: 'f32' },
                            values: { width: W, fall: L, pitch: ROOF_PITCH },
                        }),
                    )
                    .add(new StandardMaterial())
                    .add(
                        new Transform({
                            position: [...o, 1],
                            rotation: turn(ROOF_YAW + (back ? Math.PI : 0)),
                        }),
                    )
                    .add(Materials[roof.name]({ ...values, ...roof.look }))
                    .add(Displacements[roof.name](values)),
            );
        if (roof.ridge !== undefined) {
            const r = roof.ridge.radius * S;
            const capped = {
                pattern_scale: [1, 1],
                scale: S,
                tiles: [1, -roof.ridge.count],
                lift: roof.ridge.lift,
            };
            app.world.insert(
                new ParametricSurface({
                    domain: [0, 1, 0, 1],
                    adaptive: { ...RELIEF_MESH, patches: [4, 32], periodic: [false, false] },
                })
                    .add(
                        new SurfaceFunction({
                            code: ROOF_RIDGE_CODE,
                            params: { width: 'f32', radius: 'f32', drop: 'f32' },
                            values: {
                                width: W,
                                radius: r,
                                // As bordas na altura do topo das capas das águas.
                                drop:
                                    r * Math.tan(ROOF_PITCH) - 0.0005 * (roof.relief.lift ?? 0) * S,
                            },
                        }),
                    )
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [...o, 1], rotation: turn(ROOF_YAW) }))
                    .add(Materials[roof.name]({ ...capped, ...roof.look }))
                    .add(Displacements[roof.name](capped)),
            );
        }
        // As paredes e as duas empenas.
        app.world.insert(
            new BoxGeometry({ size: [2 * halfLength, wall, 2 * halfSpan] })
                .add(new StandardMaterial())
                .add(
                    new Transform({
                        position: [o[0], -0.1 + wall / 2, o[2], 1],
                        rotation: turn(ROOF_YAW),
                    }),
                )
                .add(neutral(0.5)),
        );
        for (const side of [-1, 1])
            app.world.insert(
                new ParametricSurface({ domain: [0, 1, 0, 1], resolution: [2, 2] })
                    .add(
                        new SurfaceFunction({
                            code: ROOF_GABLE_CODE,
                            params: { rise: 'f32', half: 'f32' },
                            values: { rise, half: halfSpan },
                        }),
                    )
                    .add(new StandardMaterial({ doubleSided: true }))
                    .add(
                        new Transform({
                            position: [...roofPoint(o, [side * halfLength, -under - rise, 0]), 1],
                            rotation: turn(ROOF_YAW),
                        }),
                    )
                    .add(neutral(0.5)),
            );
    });
    const started = performance.now();
    const img = await renderHdr(app, GALLERY_FRAMES, 1500);
    const ready = performance.now() - started;
    samples.length = 0;
    for (let i = 0; i < 60; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
    }
    samples.sort((a, b) => a - b);
    const gpuMs = samples[samples.length >> 1] ?? NaN;
    if (query.get('shot') !== null) {
        // Os rótulos: no chão, diante do canto da frente de cada casa.
        const at = new Map<string, Vec3>(
            [...origin].map(([name, o]) => [name, [o[0] - 0.1, 0, 0.6] as Vec3]),
        );
        const labels = await galleryLabels(app, at, width, height);
        for (let i = 0; i < 3; i++) {
            app.step(0);
            await nextGpuFrame(app);
        }
        app.step(0);
        await writeFixture('zzGallery-telhados-casa.png', await toPng(capture(canvas)));
        for (const label of labels) label.visible = false;
    }
    disposeApp(app, canvas);
    let bad = 0;
    for (let k = 0; k < img.data.length; k++) if (!Number.isFinite(img.data[k]!)) bad++;
    log(
        `gallery telhados-casa: ${ROOFS.length} telhados de duas águas (${ROOF_WIDTH} m × ${ROOF_FALL} m cada água, a ${ROOF_SCALE} unidades por metro), ${width}×${height}; pronto em ${(ready / 1000).toFixed(1)} s; GPU ${gpuMs.toFixed(2)} ms por quadro (mediana); ${bad} valores não finitos`,
    );
    check(bad === 0, `gallery telhados-casa: ${bad} valores não finitos no alvo HDR`);
    /** A luminância do ponto (u, v) da água da frente do telhado de origem `o`. */
    const slope = (o: Vec3, u: number, v: number): number => {
        const [x, y] = galleryPixel(
            roofPoint(o, [
                (0.5 - u) * W,
                -v * L * Math.sin(ROOF_PITCH),
                v * L * Math.cos(ROOF_PITCH),
            ]),
            width,
            height,
        );
        return lum(hdrAt(img, Math.round(x), Math.round(y)));
    };
    /**
     * A luminância da água dobrada pela fase da telha em `axis` (0: a coluna, em u; 1: a fiada, em v), em 8 faixas, no
     * miolo da água (longe das bordas, da cumeeira e do beiral): (máximo − mínimo) / média, e a média.
     */
    const folded = (
        o: Vec3,
        count: readonly [number, number],
        axis: 0 | 1,
    ): { contrast: number; mean: number } => {
        const bins = new Float64Array(8);
        const lines = 96;
        for (let j = 0; j < lines; j++) {
            const across = 0.15 + (0.7 * (j + 0.5)) / lines;
            for (let k = 2 * 8; k < (count[axis] - 2) * 8; k++) {
                const t = (k + 0.5) / (count[axis] * 8);
                bins[k % 8]! += axis === 0 ? slope(o, t, across) : slope(o, across, t);
            }
        }
        const mean = bins.reduce((a, b) => a + b, 0) / bins.length;
        return {
            contrast: (Math.max(...bins) - Math.min(...bins)) / Math.max(mean, 1e-9),
            mean: mean / (lines * (count[axis] - 4)),
        };
    };
    const floor = lum(hdrAt(img, width >> 1, height - 40));
    for (const roof of ROOFS) {
        const o = origin.get(roof.name)!;
        const courses = folded(o, roof.tiles, 1);
        const columns = folded(o, roof.tiles, 0);
        log(
            `gallery telhados-casa: ${roof.name} — a água da frente ${courses.mean.toFixed(3)} (o chão ${floor.toFixed(3)}); contraste pela fase da fiada ${courses.contrast.toFixed(3)}, pela fase da coluna ${columns.contrast.toFixed(3)}`,
        );
        check(
            courses.mean > 0.01,
            `gallery telhados-casa: a água de ${roof.name} não foi desenhada (${courses.mean})`,
        );
        // Sem meta apertada: o pé de cada fiada e a sombra dele mudam a luminância ao longo da queda.
        check(
            courses.contrast > 0.08,
            `gallery telhados-casa: as fiadas de ${roof.name} não aparecem ao longo da queda (${courses.contrast.toFixed(3)})`,
        );
        // Na telha de capa e canal, as colunas também (a capa iluminada de lado, o canal na sombra dela).
        if (roof.name === 'roofTile')
            check(
                columns.contrast > 0.08,
                `gallery telhados-casa: as capas e os canais de ${roof.name} não aparecem (${columns.contrast.toFixed(3)})`,
            );
    }
}

/**
 * Escala do mundo do quadro dos panos (unidades por metro): a bola sob o pano tem 9 cm de diâmetro e o pano, 22 cm de
 * lado — o fio do tricô da lã (1,4 mm) aparece nesse tamanho.
 */
const CLOTH_SCALE = 8;
/** O pano caído: o raio da bola, a meia largura do pano e o recuo do conjunto na placa (a amostra plana fica à frente). */
const CLOTH_BALL = 0.36;
const CLOTH_HALF = 0.9;
const CLOTH_BACK = 0.28;
/** A placa quadrada da amostra plana (o lado): com a frente livre do pano. */
const CLOTH_TILE = 1.5;
/**
 * Repetições do padrão por unidade de uv. No pano, o fio perto do tamanho real: as tramas ficam abaixo do pixel (o que
 * se vê do tecido de longe é o caimento, o brilho e a irregularidade dos fios), o tricô da lã e o pelo do veludo
 * continuam à vista. Na amostra plana, o padrão ampliado (o fio com volume, a torção, a penugem).
 */
const CLOTH_PATTERN: Readonly<Partial<Record<MaterialName, number>>> = {
    cotton: 3,
    denim: 3,
    silk: 3,
    sheerFabric: 4.5,
    wool: 1.36,
    velvet: 1.36,
};
const SWATCH_PATTERN: Readonly<Partial<Record<MaterialName, number>>> = {
    cotton: 0.18,
    denim: 0.18,
    silk: 0.18,
    sheerFabric: 0.18,
    wool: 0.36,
    velvet: 0.6,
};

/**
 * Um pano quadrado caído sobre uma bola (a superfície paramétrica dos panos, por função — sem simulação): o domínio
 * (u, v) é o pano estendido (comprimento ao longo do tecido: a trama fica reta no uv), s = |(u, v)| a distância ao
 * centro. Até o ângulo de contato o pano segue a bola; daí solta-se pela tangente e verga até a vertical (o perfil
 * (raio, altura) em função de s, contínuo com a derivada); o que passaria da mesa (`table`) deita-se sobre ela, para
 * fora — as pontas do pano. Como o pano não estica, o comprimento que sobra em cada volta (2π · (s − raio)) vira
 * pregas: o raio ondula com o ângulo — quatro pregas largas com as pontas do pano nas cristas, mais pregas menores de
 * fase irregular —, de amplitude √((s − raio) · raio) · `folds`, crescendo a partir da linha de contato; o pano não
 * entra na bola. A normal (du × dv) aponta para fora.
 */
const DRAPE_CODE = `fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    let q = vec2f(u, v);
    let s = max(length(q), 1e-5);
    let dir = q / s;
    let a = atan2(q.y, q.x);
    let R = data.radius;
    let tc = data.contact;
    let sc = R * tc;
    var r = R * sin(min(s, sc) / R);
    var y = R * (1.0 + cos(min(s, sc) / R));
    var hang = 0.0;
    if (s > sc) {
        let t = s - sc;
        let k = 0.2 * (1.0 - exp(-t / 0.2));
        r = R * sin(tc) + cos(tc) * k;
        y = R * (1.0 + cos(tc)) - t + (1.0 - sin(tc)) * k;
        hang = smoothstep(0.0, 0.3, t);
    }
    // A mesa: o comprimento que passaria dela deita-se sobre ela, para fora (máximo suave, raio de 4 cm do pano).
    let below = data.table - y;
    let lay = 0.5 * (below + sqrt(below * below + 0.0016));
    y = y + lay;
    r = r + lay;
    let flat = smoothstep(0.0, 0.2, lay);
    let w = a + 0.2 * sin(3.0 * a + data.seed);
    let f = -cos(4.0 * w) + 0.5 * cos(9.0 * w + 1.3 + data.seed) + 0.28 * cos(15.0 * w + 4.1 * data.seed);
    let amp = data.folds * sqrt(max(s - r, 0.0) * r) * hang;
    // Penduradas, as pregas ondulam o raio; sobre a mesa, baixam e viram rugas (a crista sobe um pouco).
    let moved = r + amp * f * (1.0 - 0.6 * flat);
    y = y + flat * 0.3 * amp * (0.5 + 0.5 * f);
    let ball = sqrt(max(R * R - (y - R) * (y - R), 0.0)) + 0.008;
    let outside = 0.5 * (moved + ball + sqrt((moved - ball) * (moved - ball) + 1e-4));
    let rr = mix(r, outside, smoothstep(0.1, 0.5, s / sc));
    return vec3f(dir.y * rr, y, dir.x * rr);
}`;

/** O quadro dos panos: a imagem HDR, o centro de cada pano (o topo da bola) e o custo de GPU por quadro. */
interface ClothShot {
    readonly img: HdrImage;
    readonly at: ReadonlyMap<MaterialName, Vec3>;
    readonly gpuMs: number;
    readonly ready: number;
}

/** Os tecidos do quadro dos panos, a fileira de trás e a da frente. */
const CLOTHS: readonly [readonly MaterialName[], readonly MaterialName[]] = [
    ['cotton', 'wool', 'sheerFabric'],
    ['denim', 'velvet', 'silk'],
];

/**
 * O quadro dos panos (spec 011, T116), a 8 unidades por metro: cada tecido num pano quadrado caído sobre uma bola, com
 * pregas (`DRAPE_CODE`: uma `ParametricSurface` com `SurfaceFunction` e a geometria diferencial — a curvatura das
 * dobras é o que o jeans lê para o desgaste —, desenhada dos dois lados), e, à frente dele, a amostra plana do mesmo
 * tecido ampliada (o fio com volume, a torção, a penugem). O pano de lã é de malha adaptativa com o deslocamento do
 * tricô (`Displacements.wool`), e a amostra dela também. A luz: o sol, a luz de recorte rasante por trás com sombra (o
 * halo das fibras, a luz que atravessa o tecido fino), o céu e a luz rebatida.
 */
async function clothShot(width: number, height: number): Promise<ClothShot> {
    const query = new URLSearchParams(location.search);
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
    const sun = new DirectionalLight({
        direction: [...GALLERY_SUN.map((c) => -c), 0],
        intensity: 2.4,
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
    // A luz de recorte projeta sombra: a que atravessa o tecido fino passa por uma camada só — onde há outra dobra
    // (ou a bola) atrás, escurece.
    app.world.insert(
        new DirectionalLight({
            direction: [...GALLERY_RIM.map((c) => -c), 0],
            intensity: 3.5,
            castShadow: true,
        }),
    );
    app.world.insert(
        new PlaneGeometry({ size: [40, 40] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, -0.1, 0, 1] }))
            .add(neutral(0.3)),
    );
    galleryWall(app, [0, 5, -6], [40, 20], neutral(0.3));
    const at = new Map<MaterialName, Vec3>();
    const values = (name: MaterialName, pattern: number): Record<string, number | number[]> => ({
        pattern_scale: [pattern, pattern],
        ...('scale' in nodes.material[name].params ? { scale: CLOTH_SCALE } : {}),
    });
    CLOTHS.forEach((row, j) => {
        row.forEach((name, i) => {
            const x = (i - 1) * GALLERY_DX;
            const z = j === 0 ? -GALLERY_DZ : GALLERY_DZ;
            const zc = z - CLOTH_BACK;
            at.set(name, [x, 2 * CLOTH_BALL, zc]);
            // A bola por baixo (neutra; aparece através do tecido fino).
            app.world.insert(
                new SphereGeometry({ radius: CLOTH_BALL - 0.004, latSegments: 48, lonSegments: 96 })
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [x, CLOTH_BALL, zc, 1] }))
                    .add(neutral(0.3)),
            );
            // Diagnóstico (`displace=0`): a lã sem o deslocamento.
            const knitted = name === 'wool' && query.get('displace') !== '0';
            const cloth = new ParametricSurface({
                domain: [-CLOTH_HALF, CLOTH_HALF, -CLOTH_HALF, CLOTH_HALF],
                ...(knitted
                    ? { adaptive: { patches: [24, 24], maxLevel: 4, screen: 0.003 } }
                    : { resolution: [321, 321] as const, differential: true }),
            })
                .add(new StandardMaterial({ doubleSided: true }))
                .add(new Transform({ position: [x, 0, zc, 1] }))
                .add(
                    new SurfaceFunction({
                        code: DRAPE_CODE,
                        params: {
                            radius: 'f32',
                            contact: 'f32',
                            folds: 'f32',
                            seed: 'f32',
                            table: 'f32',
                        },
                        values: {
                            radius: CLOTH_BALL,
                            contact: 1.3,
                            folds: 0.3,
                            seed: 0.9 + 1.7 * (3 * j + i),
                            table: 0.012,
                        },
                    }),
                )
                .add(Materials[name](values(name, CLOTH_PATTERN[name] ?? 1)));
            if (knitted) cloth.add(Displacements.wool(values('wool', CLOTH_PATTERN.wool ?? 1)));
            app.world.insert(cloth);
            // A amostra plana, ampliada: a placa do mesmo tecido, com a frente livre do pano.
            app.world.insert(
                new BoxGeometry({ size: [CLOTH_TILE, 0.1, CLOTH_TILE] })
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [x, -0.05, z, 1] }))
                    .add(Materials[name](values(name, SWATCH_PATTERN[name] ?? 1))),
            );
            // A da lã, com o fio em relevo: uma face de malha adaptativa deslocada logo acima da placa.
            if (knitted)
                app.world.insert(
                    new ParametricSurface({
                        preset: 'plane',
                        domain: [-CLOTH_TILE / 2, CLOTH_TILE / 2, -CLOTH_TILE / 2, CLOTH_TILE / 2],
                        adaptive: { patches: [20, 20], maxLevel: 4, screen: 0.003 },
                    })
                        .add(new StandardMaterial())
                        .add(new Transform({ position: [x, 0.012, z, 1] }))
                        .add(Materials.wool(values('wool', SWATCH_PATTERN.wool ?? 1)))
                        .add(Displacements.wool(values('wool', SWATCH_PATTERN.wool ?? 1))),
                );
        });
    });
    const started = performance.now();
    const img = await renderHdr(app, GALLERY_FRAMES, 1500);
    const ready = performance.now() - started;
    samples.length = 0;
    for (let i = 0; i < 60; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
    }
    samples.sort((a, b) => a - b);
    const gpuMs = samples[samples.length >> 1] ?? NaN;
    if (query.get('stages') !== null) await galleryStages(app, 'panos');
    if (query.get('shot') !== null) {
        const anchors = new Map<string, Vec3>(
            [...at].map(([name, p]) => [name, [p[0], GALLERY_R - 0.1, p[2] + CLOTH_BACK] as Vec3]),
        );
        const labels = await galleryLabels(app, anchors, width, height);
        for (let i = 0; i < 3; i++) {
            app.step(0);
            await nextGpuFrame(app);
        }
        app.step(0);
        await writeFixture('zzGallery-panos.png', await toPng(capture(canvas)));
        for (const label of labels) label.visible = false;
    }
    disposeApp(app, canvas);
    return { img, at, gpuMs, ready };
}

/** As medidas do quadro dos panos: desenhado, sem valores não finitos, e o brilho da seda ao longo das dobras. */
async function galleryCloth(width: number, height: number): Promise<void> {
    const shot = await clothShot(width, height);
    let bad = 0;
    for (let k = 0; k < shot.img.data.length; k++) if (!Number.isFinite(shot.img.data[k]!)) bad++;
    log(
        `gallery panos: ${shot.at.size} tecidos, ${width}×${height}; pronto em ${(shot.ready / 1000).toFixed(1)} s; GPU ${shot.gpuMs.toFixed(2)} ms por quadro (mediana); ${bad} valores não finitos`,
    );
    check(bad === 0, `gallery panos: ${bad} valores não finitos no alvo HDR`);
    /**
     * As pregas da frente do pano `name` (a parte pendurada voltada para a câmera): as linhas da imagem entre as
     * alturas 0,42 e 0,1, de x − 0,4 a x + 0,4 no raio das pregas. Devolve o realce (o maior valor sobre a mediana de
     * cada linha, em média) e o desvio do realce de uma linha para a seguinte (a mediana de |Δx| do pixel mais claro,
     * em pixels): um realce que desce pela dobra anda pouco de linha para linha.
     */
    const folds = (name: MaterialName): { highlight: number; drift: number } => {
        const c = shot.at.get(name)!;
        const zf = c[2] + 0.45;
        const [x0, y0] = galleryPixel([c[0] - 0.4, 0.42, zf], width, height);
        const [x1, y1] = galleryPixel([c[0] + 0.4, 0.1, zf], width, height);
        let highlight = 0;
        const peaks: number[] = [];
        let rows = 0;
        for (let y = Math.round(y0); y <= Math.round(y1); y++) {
            const row: number[] = [];
            for (let x = Math.round(x0); x <= Math.round(x1); x++)
                row.push(lum(hdrAt(shot.img, x, y)));
            const sorted = [...row].sort((p, q) => p - q);
            const top = sorted[sorted.length - 1]!;
            highlight += top / Math.max(sorted[sorted.length >> 1]!, 1e-6);
            peaks.push(row.indexOf(top));
            rows++;
        }
        const steps = peaks
            .slice(1)
            .map((p, k) => Math.abs(p - peaks[k]!))
            .sort((p, q) => p - q);
        return { highlight: highlight / Math.max(rows, 1), drift: steps[steps.length >> 1] ?? NaN };
    };
    const silk = folds('silk');
    const cotton = folds('cotton');
    log(
        `gallery panos: pregas da frente — seda: realce (o maior valor / mediana da linha) ${silk.highlight.toFixed(2)}×, andando ${silk.drift.toFixed(1)} px por linha (mediana); algodão: ${cotton.highlight.toFixed(2)}×`,
    );
    // Sem meta apertada: a seda tem realce nas pregas (mais que o algodão, fosco) e ele desce por elas.
    check(
        silk.highlight > 1.15 * cotton.highlight,
        `gallery panos: a seda não tem mais realce nas pregas que o algodão (${silk.highlight.toFixed(2)} × ${cotton.highlight.toFixed(2)})`,
    );
    check(
        silk.drift <= 3,
        `gallery panos: o brilho da seda não segue as dobras (${silk.drift} px por linha)`,
    );
}

/** As medidas do quadro da subsuperfície: o que a difusão e a luz que atravessa mudam em cada peça. */
async function gallerySubsurface(width: number, height: number): Promise<void> {
    const W = width;
    const H = height;
    const shot = await subsurfaceShot(W, H);
    const R = GALLERY_R;
    const pixel = (p: Vec3): [number, number] => {
        const [x, y] = galleryPixel(p, W, H);
        return [Math.round(x), Math.round(y)];
    };
    /** Média de 9 × 9 px em volta do ponto de mundo `p`, nas duas imagens. */
    const both = (p: Vec3): { on: Vec3; off: Vec3 } => {
        const [x, y] = pixel(p);
        const mean = (img: HdrImage): Vec3 => {
            const sum = [0, 0, 0];
            for (let dy = -4; dy <= 4; dy++)
                for (let dx = -4; dx <= 4; dx++)
                    hdrAt(img, x + dx, y + dy).forEach((v, k) => (sum[k]! += v / 81));
            return [sum[0]!, sum[1]!, sum[2]!];
        };
        return { on: mean(shot.on), off: mean(shot.off) };
    };
    const onSphere = (c: Vec3, n: Vec3): Vec3 => [
        c[0] + R * n[0],
        c[1] + R * n[1],
        c[2] + R * n[2],
    ];
    const fmt = (v: Vec3): string => v.map((x) => x.toFixed(3)).join(', ');
    let bad = 0;
    for (const img of [shot.on, shot.off])
        for (let k = 0; k < img.data.length; k++) if (!Number.isFinite(img.data[k]!)) bad++;
    log(
        `gallery subsuperficie: ${W}×${H}; GPU ${shot.gpuOn.toFixed(2)} ms por quadro com a subsuperfície e ${shot.gpuOff.toFixed(2)} ms sem (os dois passes: ${(shot.gpuOn - shot.gpuOff).toFixed(2)} ms); ${bad} valores não finitos`,
    );
    check(bad === 0, `gallery subsuperficie: ${bad} valores não finitos no alvo HDR`);
    const view = unit3(sub3(GALLERY_EYE, shot.at.wax));
    const backlight = unit3(SSS_BACK);
    const side = unit3(SSS_SIDE);
    // A cera em contraluz: o ponto voltado para a câmera, do lado contra a luz de lado (só o hemisfério o ilumina) —
    // com o espalhamento, a luz que atravessa a conta acende esse lado, mais no vermelho que no azul.
    const shade = unit3([view[0] + 0.45, view[1] - 0.25, view[2]]);
    const lit = both(onSphere(shot.at.wax, shade));
    const plain = both(onSphere(shot.at.waxPlain, shade));
    log(
        `gallery subsuperficie: cera em contraluz, lado da sombra — com o raio da biblioteca (${fmt(lit.on)}), com o raio zero (${fmt(plain.on)}); sem a difusão (${fmt(lit.off)})`,
    );
    check(
        lum(lit.on) > 1.5 * lum(plain.on),
        `gallery subsuperficie: a cera não acende em contraluz (${lum(lit.on)} × ${lum(plain.on)})`,
    );
    check(
        lit.on[0] - plain.on[0] > 2 * (lit.on[2] - plain.on[2]),
        'gallery subsuperficie: a luz que atravessa a cera não é quente (vermelho > azul)',
    );
    check(
        rel3(plain.on, plain.off) < 0.02,
        `gallery subsuperficie: a cera de raio zero mudou com a difusão (${rel3(plain.on, plain.off)})`,
    );
    // A vela e as placas finas: a face voltada para a câmera (contra a contraluz), com e sem a subsuperfície.
    const face = (name: 'candle' | 'marble' | 'jade', depth: number): { on: Vec3; off: Vec3 } => {
        const c = shot.at[name];
        return both([c[0], c[1] + 0.2, c[2] + depth / 2]);
    };
    const candle = face('candle', SSS_CANDLE);
    const marble = face('marble', SSS_MARBLE);
    const jade = face('jade', SSS_JADE);
    log(
        `gallery subsuperficie: face contra a luz, com / sem — vela de 8 mm (${fmt(candle.on)}) / (${fmt(candle.off)}); mármore de 1,5 mm (${fmt(marble.on)}) / (${fmt(marble.off)}); jade de 2 mm (${fmt(jade.on)}) / (${fmt(jade.off)})`,
    );
    check(lum(candle.on) > 2 * lum(candle.off), 'gallery subsuperficie: a vela não acende');
    check(
        candle.on[0] - candle.off[0] > 2 * (candle.on[2] - candle.off[2]),
        'gallery subsuperficie: a luz pela vela não é quente',
    );
    check(lum(marble.on) > 2 * lum(marble.off), 'gallery subsuperficie: o mármore fino não acende');
    check(lum(jade.on) > 2 * lum(jade.off), 'gallery subsuperficie: o jade fino não acende');
    check(
        jade.on[1] - jade.off[1] > 1.5 * (jade.on[0] - jade.off[0]),
        'gallery subsuperficie: a luz pelo jade não é verde',
    );
    // O terminador da luz de lado na pele: logo depois da linha de sombra dela (n·l = −0,12, num ponto voltado para a
    // câmera e fora da contraluz), a difusão traz luz, mais vermelha que azul; do lado iluminado (n·l = 0,5) quase nada
    // muda (a luz ali é lisa).
    const across = unit3(cross3(side, cross3(view, side)));
    const terminator = (nl: number): Vec3 => {
        const s = Math.sqrt(1 - nl * nl);
        return unit3([
            side[0] * nl + across[0] * s,
            side[1] * nl + across[1] * s,
            side[2] * nl + across[2] * s,
        ]);
    };
    const past = both(onSphere(shot.at.skin, terminator(-0.12)));
    const before = both(onSphere(shot.at.skin, terminator(0.5)));
    const gain: Vec3 = [
        past.on[0] - past.off[0],
        past.on[1] - past.off[1],
        past.on[2] - past.off[2],
    ];
    log(
        `gallery subsuperficie: pele, depois do terminador (n·l = −0,12) com (${fmt(past.on)}) / sem (${fmt(past.off)}) — ganho (${fmt(gain)}); antes dele (n·l = 0,5) com (${fmt(before.on)}) / sem (${fmt(before.off)}); contraluz a ${dot3(terminator(-0.12), backlight).toFixed(2)} da normal`,
    );
    check(
        gain[0] > 0.004,
        `gallery subsuperficie: a luz não passa do terminador na pele (${gain[0]})`,
    );
    check(
        gain[0] > 1.5 * gain[1] && gain[1] > gain[2],
        `gallery subsuperficie: o terminador da pele não é avermelhado (${fmt(gain)})`,
    );
    check(
        rel3(before.on, before.off) < 0.05,
        `gallery subsuperficie: a difusão mudou o lado iluminado da pele (${rel3(before.on, before.off)})`,
    );
}

/** Maior diferença relativa entre os canais de duas cores. */
function rel3(a: Vec3, b: Vec3): number {
    return Math.max(...a.map((v, k) => Math.abs(v - b[k]!) / Math.max(b[k]!, 1e-6)));
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
    // O quadro da subsuperfície (as peças finas em contraluz e o par com e sem o espalhamento) tem as medidas próprias.
    if (only === null || only === 'subsuperficie') await gallerySubsurface(W, H);
    // O quadro do relevo (o par da madeira bruta só com a normal e deslocada, sob a luz rasante) também.
    if (only === null || only === 'relevo') await galleryRelief(W, H);
    // O quadro dos panos (os tecidos caídos sobre uma bola, com pregas, e a amostra plana ampliada) também.
    if (only === null || only === 'panos') await galleryCloth(W, H);
    // O quadro do deslocamento dos materiais novos (as esferas deslocadas sob a luz rasante) também.
    for (const frame of DISPLACED)
        if (only === null || only === frame.name) await galleryDisplaced(frame, W, H);
    // O quadro dos telhados de duas águas (a telha de barro e a ardósia, além das esferas de `telhados`) também.
    if (only === null || only === 'telhados-casa') await galleryRoofs(W, H);
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
        const r = shot.radius;
        const [x, y] = galleryPixel(
            [c[0] + r * n[0], c[1] + r * n[1], c[2] + r * n[2]],
            shot.img.width,
            H,
        );
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
            `gallery ${family}: ${shot.center.size - (shot.center.has('empty') ? 1 : 0)} materiais prontos, ${shot.img.width}×${H}; pronto em ${(shot.ready / 1000).toFixed(1)} s; GPU ${shot.gpuMs.toFixed(2)} ms por quadro (mediana)${shot.gpuPlain === undefined ? '' : `, ${shot.gpuPlain.toFixed(2)} ms sem a subsuperfície`}; ${bad} valores não finitos; sem imagem: ${dark.length === 0 ? 'nenhum' : dark.join(', ')}`,
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
        // O acetinado (T120): o lobo é só moderadamente alongado (anisotropia 0,15; medido: 1,7 com 0,25).
        check(brushed > 1.15, `gallery: o realce do metal escovado não é alongado (${brushed})`);
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
        // O reflexo nítido do metal polido (spec 011, T114): a borda mais marcada do que ele reflete (o horizonte, um
        // vizinho) no disco de 0,7 do raio — o maior contraste entre dois pixels a 2 px um do outro, |a − b| / (a + b),
        // fora do realce do sol (luminância até 4). Com o reflexo pelas sondas (8 × 8 direções), não há borda.
        {
            const c = shot.center.get('metalPolished')!;
            const [cx, cy] = galleryPixel(c, W, H).map(Math.round) as [number, number];
            const rr = Math.round(0.7 * view(c).r);
            let edge = 0;
            let peak = 0;
            const values: number[] = [];
            for (let dy = -rr; dy <= rr; dy++)
                for (let dx = -rr; dx <= rr; dx++) {
                    if (dx * dx + dy * dy > rr * rr) continue;
                    const a = lum(hdrAt(shot.img, cx + dx, cy + dy));
                    values.push(a);
                    peak = Math.max(peak, a);
                    for (const [ox, oy] of [
                        [2, 0],
                        [0, 2],
                    ] as const) {
                        const b = lum(hdrAt(shot.img, cx + dx + ox, cy + dy + oy));
                        if (a > 4 || b > 4 || a + b < 0.02) continue;
                        edge = Math.max(edge, Math.abs(a - b) / (a + b));
                    }
                }
            values.sort((p, q) => p - q);
            const median = values[values.length >> 1] ?? 0;
            log(
                `gallery: metal polido — borda refletida mais marcada (contraste a 2 px) ${edge.toFixed(3)}; pico do sol ${peak.toFixed(1)} (${(peak / Math.max(median, 1e-6)).toFixed(0)}× a mediana do disco, ${median.toFixed(3)})`,
            );
            check(edge > 0.15, `gallery: o metal polido não mostra o reflexo nítido (${edge})`);
            check(peak > 20 * median, `gallery: o sol não estoura no metal polido (${peak})`);
        }
        // Os flocos da pintura e as manchas da ferrugem; o plástico brilhante, liso, mostra agora os vizinhos refletidos
        // (o contraste dele é o do reflexo, não de estrutura): fica só registrado.
        // Os flocos, longe do realce do sol (a face voltada para quem vê, do lado da sombra): o granulado da base
        // metálica cobre a peça toda, não só a volta do realce.
        const flakes = contrast('carPaint', facing('carPaint'), 24);
        const rust = contrast('metalOxidized', facing('metalOxidized'), 24);
        const smooth = contrast('plasticGloss', facing('plasticGloss'), 24);
        log(
            `gallery: contraste da estrutura (desvio / média em 49 × 49 px) — flocos da pintura longe do realce ${flakes.toFixed(3)}, ferrugem ${rust.toFixed(3)}, plástico brilhante ${smooth.toFixed(3)}`,
        );
        check(rust > 0.06, `gallery: o metal oxidado não mostra as manchas (${rust})`);
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

    // Os materiais novos (spec 011, T117): uma verificação simples por material de que a estrutura existe, na face
    // da esfera voltada para quem vê (um pouco para o lado da sombra, fora do realce): a cor média e o contraste do
    // padrão.
    /** A janela de 49 × 49 pixels na esfera de `name`: a cor média e o contraste (desvio / média em torno da média local). */
    const plate = (
        name: MaterialName,
        shot: GalleryShot = shotOf(name)!,
        n: Vec3 = facing(name),
    ): { mean: Vec3; contrast: number; peak: number } => {
        const [x, y] = onSphere(shot, name, n);
        const mean = [0, 0, 0];
        for (let dy = -24; dy <= 24; dy++)
            for (let dx = -24; dx <= 24; dx++)
                hdrAt(shot.img, x + dx, y + dy).forEach((v, k) => (mean[k]! += v / 2401));
        const values = patch(shot.img, x, y, 27);
        let dev = 0;
        let sum = 0;
        let count = 0;
        let peak = 0;
        for (let j = 3; j < values.length - 3; j++)
            for (let i = 3; i < values.length - 3; i++) {
                let local = 0;
                for (let dy = -3; dy <= 3; dy++)
                    for (let dx = -3; dx <= 3; dx++) local += values[j + dy]![i + dx]! / 49;
                dev += (values[j]![i]! - local) ** 2;
                sum += values[j]![i]!;
                peak = Math.max(peak, values[j]![i]!);
                count++;
            }
        const average = Math.max(sum / count, 1e-6);
        return {
            mean: mean as unknown as Vec3,
            contrast: Math.sqrt(dev / count) / average,
            peak: peak / average,
        };
    };
    const fmt3 = (v: Vec3): string => v.map((c) => c.toFixed(3)).join(', ');
    if (shots.has('pintura')) {
        // A pintura metálica nas esferas grandes, longe do realce do sol (a face voltada para quem vê, do lado da
        // sombra): a de floco fino (20 µm: centenas de flocos por pixel) é lisa — sem grão —, a de floco grosso
        // (400 µm) tem o granulado pela peça toda.
        const shot = shots.get('pintura')!;
        const red = plate('carPaint', shot);
        const silver = plate('carPaintSilver', shot);
        const coarse = plate('carPaintFlake', shot);
        log(
            `gallery pintura: granulado longe do realce (desvio / média em 49 × 49 px) — vermelha ${red.contrast.toFixed(3)}, prata ${silver.contrast.toFixed(3)}, floco grosso ${coarse.contrast.toFixed(3)}; cor média — vermelha (${fmt3(red.mean)}), prata (${fmt3(silver.mean)}), floco grosso (${fmt3(coarse.mean)})`,
        );
        // Sem meta apertada: o teto do grão da pintura fina é um quarto do granulado de antes (2,4) e o da grossa.
        check(
            red.contrast < 0.3 && silver.contrast < 0.3,
            `gallery pintura: a pintura de floco fino tem grão longe do realce (${red.contrast} e ${silver.contrast})`,
        );
        check(
            coarse.contrast > 2 * Math.max(red.contrast, silver.contrast),
            `gallery pintura: a de floco grosso não tem mais grão que a fina (${coarse.contrast})`,
        );
        // Os pontos isolados na mesma janela (o maior valor sobre a média): na fina, nenhum muito acima da média; na
        // grossa, os flocos alinhados acendem um a um.
        log(
            `gallery pintura: pontos isolados longe do realce (maior valor / média em 49 × 49 px) — vermelha ${red.peak.toFixed(2)}×, prata ${silver.peak.toFixed(2)}×, floco grosso ${coarse.peak.toFixed(2)}×`,
        );
        check(
            red.peak < 3 && silver.peak < 3,
            `gallery pintura: pontos isolados longe do realce na pintura de floco fino (${red.peak} e ${silver.peak})`,
        );
        check(
            coarse.peak > 2 * Math.max(red.peak, silver.peak),
            `gallery pintura: a de floco grosso sem brilhos pontuais longe do realce (${coarse.peak})`,
        );
        // A prata é neutra e a vermelha, saturada.
        check(
            red.mean[0] > 3 * red.mean[2] && silver.mean[0] < 1.6 * silver.mean[2],
            'gallery pintura: as cores da vermelha e da prata não se distinguem',
        );
    }
    if (shots.has('metais') && shots.has('metais-2')) {
        // A cor do reflexo: o ouro, o cobre e o latão devolvem mais vermelho que azul; o cromo, neutro.
        const tint = (name: MaterialName): number => {
            const { mean } = plate(name);
            return mean[0] / Math.max(mean[2], 1e-6);
        };
        const warm = (['gold', 'copper', 'brass'] as const).map((name) => tint(name));
        const neutral = tint('chrome');
        log(
            `gallery metais: vermelho / azul do reflexo na esfera — ouro ${warm[0]!.toFixed(2)}, cobre ${warm[1]!.toFixed(2)}, latão ${warm[2]!.toFixed(2)}, cromo ${neutral.toFixed(2)}`,
        );
        warm.forEach((value, k) =>
            check(
                // No estúdio (T120) o latão reflete também o vizinho azul: medido 1,18 contra 0,99 do cromo.
                value > 1.1 * neutral,
                `gallery metais: o reflexo de ${['ouro', 'cobre', 'latão'][k]} não é quente (${value} × cromo ${neutral})`,
            ),
        );
        const anodized = plate('aluminiumAnodized').mean;
        check(
            anodized[2] > 1.5 * anodized[0],
            `gallery metais: o anodizado não tem a cor do corante (${fmt3(anodized)})`,
        );
        const structured = (['metalHammered', 'castIron', 'bronzePatina'] as const).map(
            (name) => plate(name).contrast,
        );
        const smooth = plate('chrome').contrast;
        log(
            `gallery metais: contraste da estrutura na esfera (desvio / média) — martelado ${structured[0]!.toFixed(3)}, ferro fundido ${structured[1]!.toFixed(3)}, bronze com pátina ${structured[2]!.toFixed(3)}; cromo ${smooth.toFixed(3)}; anodizado (${fmt3(anodized)})`,
        );
        structured.forEach((value, k) =>
            check(
                value > 0.03,
                `gallery metais: sem estrutura em ${['metalHammered', 'castIron', 'bronzePatina'][k]} (${value})`,
            ),
        );
    }
    /** O contraste na placa de cada material de `names`, com o piso `floor` (sem meta apertada). */
    const structure = (
        family: string,
        names: readonly MaterialName[],
        floor: (name: MaterialName) => number,
    ): void => {
        const values = names.map((name) => plate(name));
        log(
            `gallery ${family}: contraste da estrutura na esfera (desvio / média em 49 × 49 px) — ${names.map((name, k) => `${name} ${values[k]!.contrast.toFixed(3)}`).join(', ')}`,
        );
        names.forEach((name, k) =>
            check(
                values[k]!.contrast > floor(name),
                `gallery ${family}: ${name} não mostra a estrutura (${values[k]!.contrast})`,
            ),
        );
    };
    if (shots.has('pedra'))
        structure(
            'pedra',
            ['concrete', 'granite', 'sandstone', 'brick', 'plaster', 'tile'],
            (name) => (name === 'plaster' ? 0.004 : 0.02),
        );
    if (shots.has('terra'))
        structure('terra', ['asphalt', 'terracotta', 'driedMud', 'sand'], () => 0.02);
    if (shots.has('metais-2')) structure('metais-2', ['carbonFiber'], () => 0.015);
    if (shots.has('assoalhos'))
        structure('assoalhos', ['woodFloorPlanks', 'woodFloorHerringbone', 'paper'], (name) =>
            name === 'paper' ? 0.002 : 0.03,
        );
    if (shots.has('madeiras')) {
        structure(
            'madeiras',
            ['woodOak', 'woodWalnut', 'woodPine', 'woodMahogany', 'woodOakVarnished'],
            () => 0.03,
        );
        // As espécies têm cores distintas: o pinho é o mais claro, a nogueira a mais escura, o mogno o mais vermelho.
        const tone = (['woodOak', 'woodWalnut', 'woodPine', 'woodMahogany'] as const).map(
            (name) => plate(name).mean,
        );
        log(
            `gallery madeiras: cor média na esfera — carvalho (${fmt3(tone[0]!)}), nogueira (${fmt3(tone[1]!)}), pinho (${fmt3(tone[2]!)}), mogno (${fmt3(tone[3]!)})`,
        );
        check(
            lum(tone[2]!) > lum(tone[0]!) && lum(tone[0]!) > lum(tone[1]!),
            'gallery madeiras: pinho, carvalho e nogueira não vão do claro ao escuro',
        );
        check(
            tone[3]![0] / tone[3]![1] > tone[0]![0] / tone[0]![1],
            'gallery madeiras: o mogno não é mais vermelho que o carvalho',
        );
    }
    if (shots.has('organicos')) {
        const body = (['ice', 'soap', 'ivory', 'snow', 'motherOfPearl'] as const).map(
            (name) => plate(name).mean,
        );
        log(
            `gallery organicos: cor média na esfera — gelo (${fmt3(body[0]!)}), sabão (${fmt3(body[1]!)}), marfim (${fmt3(body[2]!)}), neve (${fmt3(body[3]!)}), madrepérola (${fmt3(body[4]!)})`,
        );
        // O gelo é transparente: a parede xadrez atrás dele aparece através da esfera — no disco central (60 % do
        // raio) há casas claras e escuras do xadrez refratado: o décimo percentil da luminância fica abaixo de 60 % do
        // nonagésimo (uma bola opaca pintada, de trincas claras sobre um corpo claro, não tem a parte escura).
        const iceShot = shotOf('ice')!;
        const [ix, iy] = onSphere(iceShot, 'ice', view(iceShot.center.get('ice')!).v);
        const reach = Math.floor(0.6 * view(iceShot.center.get('ice')!).r * (iceShot.radius / R));
        const through: number[] = [];
        for (let dy = -reach; dy <= reach; dy += 2)
            for (let dx = -reach; dx <= reach; dx += 2)
                if (dx * dx + dy * dy <= reach * reach)
                    through.push(lum(hdrAt(iceShot.img, ix + dx, iy + dy)));
        through.sort((p, q) => p - q);
        const seen =
            through[Math.floor(0.1 * through.length)]! / through[Math.floor(0.9 * through.length)]!;
        log(
            `gallery organicos: gelo — luminância no disco central, décimo / nonagésimo percentil ${seen.toFixed(3)} (o xadrez atrás, através dele)`,
        );
        check(seen < 0.6, `gallery organicos: o gelo não deixa ver o fundo (${seen})`);
        check(body[1]![1] > body[1]![0], 'gallery organicos: o sabão não tem a cor do corante');
        check(body[2]![0] > body[2]![2], 'gallery organicos: o marfim não é quente');
        check(
            lum(body[3]!) > lum(body[2]!),
            'gallery organicos: a neve não é mais clara que o marfim',
        );
        // Os brilhos pontuais da neve e as cores da madrepérola (a razão vermelho / verde varia pela peça).
        const sparkle = plate('snow').peak;
        const pearl = shotOf('motherOfPearl')!;
        const [mx, my] = onSphere(pearl, 'motherOfPearl', facing('motherOfPearl'));
        const ratios: number[] = [];
        for (let dy = -40; dy <= 40; dy += 4)
            for (let dx = -40; dx <= 40; dx += 4) {
                const [r, g] = hdrAt(pearl.img, mx + dx, my + dy);
                if (g > 1e-4) ratios.push(r / g);
            }
        ratios.sort((p, q) => p - q);
        const spread =
            ratios[Math.floor(0.9 * ratios.length)]! / ratios[Math.floor(0.1 * ratios.length)]!;
        log(
            `gallery organicos: neve — maior valor / média na esfera ${sparkle.toFixed(2)}×; madrepérola — vermelho / verde, do décimo ao nonagésimo percentil ${spread.toFixed(3)}×`,
        );
        check(spread > 1.04, `gallery organicos: a madrepérola não muda de cor (${spread})`);
        // Os brilhos pontuais da neve: pontos várias vezes acima da média, longe do realce.
        check(sparkle > 1.5, `gallery organicos: a neve não tem brilhos pontuais (${sparkle})`);
    }
    if (shots.has('rolhas')) structure('rolhas', ['corkStopper', 'cork'], () => 0.03);
    if (shots.has('metais-2')) {
        // O metal escovado é liso ao longo da escova (os círculos de latitude: na face voltada para a câmera, a
        // horizontal da tela): a diferença entre pixels vizinhos ao longo dela, sobre a média, fora do realce — o
        // reflexo vem das sondas, sem o ruído de um raio sorteado por pixel (que passava de 0,2).
        const shot = shots.get('metais-2')!;
        const [bx, by] = onSphere(shot, 'metalBrushed', facing('metalBrushed'));
        let step = 0;
        let sum = 0;
        for (let dy = -20; dy <= 20; dy++)
            for (let dx = -20; dx < 20; dx++) {
                const a = lum(hdrAt(shot.img, bx + dx, by + dy));
                step += Math.abs(lum(hdrAt(shot.img, bx + dx + 1, by + dy)) - a);
                sum += a;
            }
        log(
            `gallery metais-2: metal escovado — diferença média entre vizinhos ao longo da escova / média ${(step / sum).toFixed(4)}`,
        );
        check(step / sum < 0.06, `gallery metais-2: o metal escovado tem ruído (${step / sum})`);
    }
    /** As luminâncias do disco de `fraction` do raio da esfera de `name` no quadro `shot`, em ordem crescente. */
    const disc = (shot: GalleryShot, name: MaterialName, fraction: number): number[] => {
        const c = shot.center.get(name)!;
        const [cx, cy] = galleryPixel(c, shot.img.width, H).map(Math.round) as [number, number];
        const rr = Math.floor(fraction * view(c).r * (shot.radius / R));
        const values: number[] = [];
        for (let dy = -rr; dy <= rr; dy++)
            for (let dx = -rr; dx <= rr; dx++)
                if (dx * dx + dy * dy <= rr * rr)
                    values.push(lum(hdrAt(shot.img, cx + dx, cy + dy)));
        return values.sort((p, q) => p - q);
    };
    if (shots.has('metal-escovado')) {
        // O metal escovado no estúdio escuro (T120): contraste alto entre as manchas dos painéis e as zonas que
        // refletem o ambiente escuro (o percentil 95 sobre o 10 da luminância em 85 % do disco), sem ruído de pixel (a
        // diferença entre vizinhos ao longo da escova, sobre a média, numa janela dentro da mancha principal).
        const shot = shots.get('metal-escovado')!;
        const values = disc(shot, 'metalBrushed', 0.85);
        const bright = values[Math.floor(0.95 * values.length)]!;
        const dark = values[Math.floor(0.1 * values.length)]!;
        const c = shot.center.get('metalBrushed')!;
        const [cx, cy] = galleryPixel(c, shot.img.width, H).map(Math.round) as [number, number];
        const rr = Math.floor(0.6 * view(c).r * (shot.radius / R));
        // A janela de 41 × 41 mais clara do disco: dentro da mancha.
        let best = { x: cx, y: cy, sum: 0 };
        for (let y = cy - rr; y <= cy + rr; y += 8)
            for (let x = cx - rr; x <= cx + rr; x += 8) {
                let sum = 0;
                for (let dy = -20; dy <= 20; dy += 4)
                    for (let dx = -20; dx <= 20; dx += 4)
                        sum += lum(hdrAt(shot.img, x + dx, y + dy));
                if (sum > best.sum) best = { x, y, sum };
            }
        let step = 0;
        let across = 0;
        let sum = 0;
        for (let dy = -20; dy <= 20; dy++)
            for (let dx = -20; dx < 20; dx++) {
                const a = lum(hdrAt(shot.img, best.x + dx, best.y + dy));
                step += Math.abs(lum(hdrAt(shot.img, best.x + dx + 1, best.y + dy)) - a);
                across += Math.abs(lum(hdrAt(shot.img, best.x + dx, best.y + dy + 1)) - a);
                sum += a;
            }
        log(
            `gallery metal-escovado: mancha clara / zona escura (percentis 95 e 10 da luminância) ${bright.toFixed(3)} / ${dark.toFixed(3)} = ${(bright / dark).toFixed(1)}×; dentro da mancha, diferença entre vizinhos sobre a média — ao longo da escova ${(step / sum).toFixed(4)}, através dela ${(across / sum).toFixed(4)} (os riscos)`,
        );
        check(bright > 4 * dark, `gallery metal-escovado: pouco contraste (${bright} × ${dark})`);
        check(
            step / sum < 0.06,
            `gallery metal-escovado: ruído ao longo da escova (${step / sum})`,
        );
        check(
            across > 1.5 * step,
            `gallery metal-escovado: os riscos não aparecem dentro da mancha (${across} × ${step})`,
        );
    }
    if (shots.has('madeiras')) {
        // O realce do verniz sob os painéis (T120): uma mancha larga — a fração do disco da esfera acima de 3 × a
        // mediana (o ponto do sol cobria menos de 0,3 %).
        const shot = shots.get('madeiras')!;
        const wide = (['woodOakVarnished', 'woodMahogany'] as const).map((name) => {
            const values = disc(shot, name, 0.9);
            const median = values[values.length >> 1]!;
            return values.filter((v) => v > 3 * median).length / values.length;
        });
        log(
            `gallery madeiras: realce do verniz com a luz de área (fração do disco acima de 3 × a mediana) — carvalho envernizado ${(100 * wide[0]!).toFixed(2)} %, mogno ${(100 * wide[1]!).toFixed(2)} %`,
        );
        wide.forEach((value, i) =>
            check(
                value > 0.01,
                `gallery madeiras: o realce do verniz ${i} não é uma mancha larga (${value})`,
            ),
        );
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
    sss: caseSss,
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

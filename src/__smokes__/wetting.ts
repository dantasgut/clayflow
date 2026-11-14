// Spec 034 — Smoke da água que molha os sólidos: a película com a física da superfície (`SurfacePhysics`) e o ar
// (`Atmosphere`), contra a teoria.
//
// A barragem do tanque dos smokes; a película lida da tabela dela no buffer das consultas do campo. Duas cenas:
//   - glass: chão de concreto (`SurfacePhysics.CONCRETE`) e paredes de vidro (`GLASS`):
//     - washburn: no concreto, a água absorvida da célula molhada há mais tempo segue Lucas–Washburn — (A²(3 s) −
//       A²(2 s)) / 1 s igual ao coeficiente W da superfície a 1 %;
//     - flow: o vidro segura parada só ~0,03 mm (Furmidge, histerese de 5°): a residual de 0,1 mm que a água deixa rompe
//       a borda e escorre — há células da parede com mais que a residual (a água que desceu e se juntou) e células com
//       a espessura presa (o rastro que ela deixa);
//     - impermeable: nada absorvido no vidro nem nas superfícies sem `SurfacePhysics`;
//   - brick: paredes de tijolo (`BRICK`): o tijolo absorve.
// E três cenas da T066d (`support/wettingScenes.ts`):
//   - edge: o rastro de uma gota de 3 × 3 partículas num azulejo inclinado 35°, a descida a 30° dos eixos da grade, visto
//     de cima — a água que o rastro segura se rompe em gotas (a molhagem parcial: `field_film_breaks`), e as gotas
//     são calotas redondas, sem os degraus da grade: a razão mediana dos eixos das resolvidas (≥ 3 × 3 pixels) ≤ 1,6 (o
//     plano inclinado encurta a vista em 0,82; a gota de poucos pixels, a quantização), ≥ 100 gotas e nenhum trecho do
//     rastro sem água mais longo que dois passos das gotas (12,5 mm; ≤ 1 % das fileiras). Antes das gotas, a faixa contínua com as bordas a ≤ 3,5 mm da reta (antes da T066d, 7,4 mm);
//   - anchor: a gota de uma partícula num plano inclinado da superfície { rugosidade 1,3, histerese 40° } — o ângulo de
//     deslize pela força de Furmidge da borda dela (`ParticlePhysics.dropPinning`): a metade dele, parada (< 1 mm/s); o
//     dobro, solta (> 100 mm em 1 s);
//   - drip: a água que escorre por uma esfera lisa pende embaixo, junta-se e pinga — ≥ 1 pingo abaixo da esfera, a
//     menos de 1 cm do eixo, e a película perde o volume das partículas que voltaram menos o das gotas que deslizavam
//     nela e passaram a ela (a 0,1 % de um pingo), menos no máximo a residual que as partículas encostadas deixam;
//   - absorb: a gota de uma partícula (1 mL) lançada rente ao chão a 0,5 m/s desliza (o ancoramento não a para) e passa
//     à película — a partícula sai do corpo e a película ganha exatamente o volume dela (a conta inteira das unidades
//     da pendente: o arredondamento de uma), numa poça redonda em volta de onde tocou o chão: os momentos de segunda
//     ordem da água com a razão dos eixos ≤ 1,1, o centro a menos de 2 mm de onde ela passou à película;
//   - evaporation: a mesma poça no ar de 20 °C e 50 % (`Atmosphere.defaults`), a superfície sem poros — entre 2 e 3 s a
//     película perde a taxa de Carrier vezes a área molhada, a 2 % (o ponto fixo de 0,01 nm dá ~0,7 %). Antes medida
//     nas células paradas do chão da barragem, que agora é coberto pelas poças das gotas que deslizam.
//
// Para rodar: `npm run smoke -- wetting`. Resultado: `WETTING SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Atmosphere,
    createScene,
    fieldDataLayout,
    FluidField,
    ParticlePhysics,
    SurfacePhysics,
} from 'clayflow/web';
import type { StagingBufferSpec, SurfacePhysicsOptions } from 'clayflow/web';
import { FIELD_FILM_CELLS, FIELD_FILM_SUBDIV, FIELD_FILM_WORDS } from '../elements/fields/schemas';
import { filmSurfaceTerms, pinnedThickness } from '../elements/physics/wetting/wetting';
import { nextGpuFrame } from './support/extensionScenes';
import {
    DRIP_SPHERE,
    dropSlide,
    dropSpread,
    sphereDrips,
    trailEdge,
    wallTrail,
} from './support/wettingScenes';
import { waterScene, WATER_SPACING } from './support/waterScene';

/** Unidade da espessura na tabela (`FIELD_FILM_UNIT`, m). */
const UNIT = 1e-11;
/** Película residual que a água deixa ao passar (`FIELD_FILM_RESIDUAL`, m). */
const RESIDUAL = 1e-4;
/** O voxel do campo (meio espaçamento): o comprimento da água que a borda da película segura. */
const VOXEL = 0.5 * WATER_SPACING;
const WORDS = FIELD_FILM_WORDS.value;

function log(msg: string): void {
    console.log(`[wetting] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

function fail(msg: string): never {
    throw new Error(msg);
}

interface Cell {
    readonly key: number;
    readonly free: number;
    readonly absorbed: number;
    readonly submerged: boolean;
    /** Entrada da tabela das superfícies + 1 (0 ainda não resolvida). */
    readonly surface: number;
    /** Água pendente (em unidades de 1024 da livre, sobre a célula). */
    readonly pending: number;
    /** Componentes da normal do sólido. */
    readonly nx: number;
    readonly ny: number;
    readonly nz: number;
}

/** Coordenadas da célula de chave `key` (`field_film_coords`: 11, 10 e 11 bits deslocados). */
const coords = (key: number): [number, number, number] => [
    ((key - 1) >>> 21) - 1024,
    (((key - 1) >>> 11) & 1023) - 512,
    ((key - 1) & 2047) - 1024,
];

async function table(app: Application, field: FluidField): Promise<Map<number, Cell>> {
    const spec = app.resources.bufferOf(field, 'data')!;
    const bytes = FIELD_FILM_CELLS * WORDS * 4;
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: 'wetting_film',
        byteSize: bytes,
    });
    app.core.record('wetting-film', (frame) => {
        // A película começa no fim dos blocos (`fieldFilmOffset`, pela API pública: `fieldDataLayout().end`).
        frame.copy(spec, staging, bytes, fieldDataLayout(field.capacity).end * 4, 0);
    });
    app.core.submit();
    const u = new Uint32Array(await app.core.readback(staging));
    app.core.destroy(staging);
    const cells = new Map<number, Cell>();
    for (let s = 0; s < FIELD_FILM_CELLS; s++) {
        const w = WORDS * s;
        if (u[w] === 0) continue;
        cells.set(u[w]!, {
            key: u[w]!,
            free: u[w + 1]! * UNIT,
            nx: (((u[w + 2]! & 255) << 24) >> 24) / 127,
            ny: ((((u[w + 2]! >> 8) & 255) << 24) >> 24) / 127,
            nz: ((((u[w + 2]! >> 16) & 255) << 24) >> 24) / 127,
            submerged: u[w + 3] !== 0,
            absorbed: u[w + 4]! * UNIT,
            surface: u[w + 5]!,
            pending: u[w + 6]!,
        });
    }
    return cells;
}

/** A cena: a barragem no tanque com as superfícies dadas; devolve a película a cada segundo, de 1 a `seconds` s. */
async function run(
    surfaces: {
        floor?: SurfacePhysicsOptions;
        walls?: SurfacePhysicsOptions;
    },
    seconds = 3,
): Promise<Map<number, Cell>[]> {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });
    const errors: string[] = [];
    app.events.on('engineError', (e) =>
        errors.push(`${e.stage}/${e.filter}: ${e.message.slice(0, 400)}`),
    );
    waterScene(app, { width: 160, height: 90, surfaces });
    await app.whenReady({ timeoutMs: 30_000 });
    const field = app.world.findResource(FluidField.schema, FluidField)!;
    const out: Map<number, Cell>[] = [];
    for (let i = 1; i <= 60 * seconds; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
        if (i % 60 === 0) out.push(await table(app, field));
    }
    app.dispose();
    canvas.remove();
    if (errors.length > 0) fail(`erros do motor: ${errors.join(' | ')}`);
    return out;
}

async function main(): Promise<void> {
    const water = ParticlePhysics.WATER;
    const liquid = {
        surfaceTension: water.surfaceTension,
        contactAngle: water.contactAngle,
        viscosity: water.viscosity,
        density: water.restDensity,
    };
    const air = Atmosphere.defaults;
    const concrete = filmSurfaceTerms(new SurfacePhysics(SurfacePhysics.CONCRETE), liquid, air);
    const glass = filmSurfaceTerms(new SurfacePhysics(SurfacePhysics.GLASS), liquid, air);
    const brick = filmSurfaceTerms(new SurfacePhysics(SurfacePhysics.BRICK), liquid, air);
    const held = (t: { retentionPerDensity: number }): number =>
        pinnedThickness(t.retentionPerDensity * 1000, 9.81, VOXEL);
    log(
        `vidro segura ${(held(glass) * 1e3).toFixed(3)} mm, tijolo ${(held(brick) * 1e3).toFixed(3)} mm (residual ${RESIDUAL * 1e3} mm); concreto W ${concrete.washburn.toExponential(3)} m²/s; evaporação ${glass.evaporation.toExponential(3)} m/s`,
    );

    // A cena do vidro: o chão é a 1ª superfície da cena (entrada 1, palavra 2), as paredes as seguintes (3…6).
    const [, s2, s3] = await run({ floor: SurfacePhysics.CONCRETE, walls: SurfacePhysics.GLASS });
    const floorOf = (m: Map<number, Cell>): Cell[] =>
        [...m.values()].filter((c) => c.surface === 2);
    const wallsOf = (m: Map<number, Cell>): Cell[] =>
        [...m.values()].filter((c) => c.surface >= 3 && Math.abs(c.ny) < 0.3);
    const most = (cells: Cell[]): number => cells.reduce((m, c) => Math.max(m, c.absorbed), 0);
    log(`células: ${s2!.size} aos 2 s, ${s3!.size} aos 3 s (tabela de ${FIELD_FILM_CELLS})`);
    const a2 = most(floorOf(s2!));
    const a3 = most(floorOf(s3!));
    const slope = a3 * a3 - a2 * a2;
    log(
        `washburn: (A²(3 s) − A²(2 s)) / 1 s = ${slope.toExponential(4)} m²/s (W ${concrete.washburn.toExponential(4)})`,
    );
    if (!(Math.abs(slope / concrete.washburn - 1) <= 0.01))
        fail(`washburn: ${slope} contra ${concrete.washburn}`);

    const walls = wallsOf(s3!).filter((c) => !c.submerged);
    const joined = walls.filter((c) => c.free > RESIDUAL * 1.01).length;
    const trail = walls.filter((c) => c.free > 0 && c.free <= held(glass) * 1.001).length;
    log(
        `flow: ${walls.length} células à vista nas paredes de vidro, ${joined} com mais que a residual, ${trail} com a espessura presa`,
    );
    if (joined === 0 || trail === 0) fail(`flow: ${joined} juntas, ${trail} no rastro`);

    const soaked = [...s3!.values()].filter((c) => c.surface !== 2 && c.absorbed > 0).length;
    log(`impermeable: ${soaked} células com água absorvida fora do concreto`);
    if (soaked > 0) fail(`impermeable: ${soaked} células`);

    // A cena do tijolo: as paredes são as superfícies 1…4 (palavras 2…5).
    const [, , b3] = await run({ walls: SurfacePhysics.BRICK }, 3);

    const brickWalls = [...b3!.values()].filter(
        (c) => c.surface >= 2 && Math.abs(c.ny) < 0.3 && !c.submerged,
    );
    const absorbed = brickWalls.filter((c) => c.absorbed > 0).length;
    log(`brick: ${brickWalls.length} células à vista nas paredes, ${absorbed} com água absorvida`);
    if (absorbed === 0) fail(`brick: ${absorbed} absorvendo`);

    // A borda do rastro (T066d).
    const edge = await trailEdge();
    log(
        `edge: ${edge.drops} gotas, a razão mediana dos eixos ${edge.roundness.toFixed(2)}, falhas ${(100 * edge.gaps).toFixed(1)} %, largura ${edge.width.toFixed(1)} mm (${edge.rows} fileiras)`,
    );
    if (!(edge.roundness <= 1.6) || edge.drops < 100 || !(edge.gaps <= 0.01) || edge.rows < 100)
        fail(
            `edge: ${edge.drops} gotas, razão ${edge.roundness}, falhas ${edge.gaps}, ${edge.rows} fileiras`,
        );

    // O ancoramento da gota pela superfície (T066d).
    const rough = { roughness: 1.3, hysteresis: 40 };
    const fine = 0.01;
    const pinning = new ParticlePhysics({
        ...ParticlePhysics.WATER,
        particleSpacing: fine,
    }).dropPinning(new SurfacePhysics(rough));
    const critical = (Math.asin(Math.min(1, pinning / 9.81)) * 180) / Math.PI;
    const still = await dropSlide(critical / 2, rough, fine);
    const loose = await dropSlide(critical * 2, rough, fine);
    log(
        `anchor: a borda segura ${pinning.toFixed(3)} m/s² (deslize a ${critical.toFixed(2)}°); a ${(critical / 2).toFixed(2)}° andou ${(still.moved * 1e3).toFixed(2)} mm/s, a ${(critical * 2).toFixed(2)}° ${(loose.moved * 1e3).toFixed(0)} mm/s`,
    );
    if (!(critical > 0.5) || !(Math.abs(still.moved) < 1e-3) || !(loose.moved > 0.1))
        fail(`anchor: ${critical}°, parada ${still.moved} m, solta ${loose.moved} m`);

    // O pingo (T066d): a água da película na esfera (a única superfície da cena: entrada 1, palavra 2).
    const cell = (0.5 * 0.01) / FIELD_FILM_SUBDIV;
    const sphereFilm = async (app: Application): Promise<{ volume: number }> => {
        const field = app.world.findResource(FluidField.schema, FluidField)!;
        let volume = 0;
        // A da esfera e a nova (a superfície ainda não resolvida: a gota passada à película neste quadro).
        for (const c of (await table(app, field)).values())
            if (c.surface === 2 || c.surface === 0)
                volume += (c.free + c.pending * 1024 * UNIT) * cell * cell;
        return { volume };
    };
    const drip = await sphereDrips(sphereFilm, 2, 10);
    const lost = drip.before - drip.after;
    const expected = (drip.drips - drip.absorbed) * drip.volume;
    // A residual que a partícula encostada deixa no disco do contato (raio de meio espaçamento, mais a meia célula da
    // cobertura) não sai dela (a massa por partícula é da 040): a película ganha no máximo isso por partícula-quadro.
    const touchGain = Math.PI * (0.5 * 0.01 + 0.5 * cell) ** 2 * RESIDUAL;
    const bottom = DRIP_SPHERE.center[1] - DRIP_SPHERE.radius;
    log(
        `drip: ${drip.drips} pingos de ${(drip.volume * 1e6).toFixed(3)} mL entre 2 e 10 s, ${drip.absorbed} gotas passadas a ela, a película perdeu ${(lost * 1e6).toFixed(4)} mL (as partículas: ${(expected * 1e6).toFixed(4)} mL; a residual das ${drip.touching} partículas-quadro encostadas, até ${(drip.touching * touchGain * 1e6).toFixed(4)} mL); os pingos de ${drip.lowest.toFixed(3)} a ${drip.highest.toFixed(3)} m (o fundo da esfera a ${bottom.toFixed(2)} m), a ${(drip.aside * 1e3).toFixed(1)} mm do eixo`,
    );
    if (
        drip.drips < 1
        || !(lost <= expected + 1e-3 * drip.volume)
        || !(lost >= expected - drip.touching * touchGain - 1e-3 * drip.volume)
        || !(drip.highest < bottom)
        || !(drip.lowest > bottom - 0.05)
        || !(drip.aside <= 0.01)
    )
        fail(`drip: ${drip.drips} pingos, perda ${lost} contra ${expected}`);

    // A gota que desliza passada à película (T066d): a única superfície da cena (entrada 1, palavra 2).
    const spreadFilm = async (
        app: Application,
    ): Promise<{ volume: number; center: [number, number]; ratio: number; cells: number }> => {
        const field = app.world.findResource(FluidField.schema, FluidField)!;
        let m = 0;
        let mx = 0;
        let mz = 0;
        let xx = 0;
        let zz = 0;
        let xz = 0;
        let cells = 0;
        for (const c of (await table(app, field)).values()) {
            if (c.surface !== 2 || c.free <= 0) continue;
            const [i, , k] = coords(c.key);
            const x = (i + 0.5) * cell;
            const z = (k + 0.5) * cell;
            const w = c.free * cell * cell;
            m += w;
            mx += w * x;
            mz += w * z;
            xx += w * x * x;
            zz += w * z * z;
            xz += w * x * z;
            cells++;
        }
        const cx = mx / m;
        const cz = mz / m;
        const a = xx / m - cx * cx;
        const b = zz / m - cz * cz;
        const d = xz / m - cx * cz;
        const root = Math.sqrt(((a - b) / 2) ** 2 + d * d);
        const ratio = Math.sqrt(((a + b) / 2 + root) / ((a + b) / 2 - root));
        return { volume: m, center: [cx, cz], ratio, cells };
    };
    const spread = await dropSpread(rough, spreadFilm, [1]);
    const step = 1024 * UNIT * cell * cell;
    const whole = Math.round(spread.volume / step) * step;
    const off = Math.hypot(
        spread.film[0]!.center[0] - spread.landing[0],
        spread.film[0]!.center[1] - spread.landing[1],
    );
    log(
        `absorb: retirada ${spread.retired}, a película ${(spread.film[0]!.volume * 1e6).toFixed(6)} mL em ${spread.film[0]!.cells} células (a partícula ${(spread.volume * 1e6).toFixed(6)} mL; nas unidades ${(whole * 1e6).toFixed(6)}), eixos da poça ${spread.film[0]!.ratio.toFixed(3)}:1, o centro a ${(off * 1e3).toFixed(1)} mm de onde ela passou à película`,
    );
    if (
        !spread.retired
        || !(Math.abs(spread.film[0]!.volume - whole) <= 1e-6 * whole)
        || !(spread.film[0]!.ratio <= 1.1)
        || !(off <= 0.002)
    )
        fail(
            `absorb: retirada ${spread.retired}, ${spread.film[0]!.volume} contra ${whole}, eixos ${spread.film[0]!.ratio}, centro ${off}`,
        );

    // A borda que segura (Furmidge): a gota passada à película escorre pela parede e deixa atrás a espessura presa no
    // caminho já molhado, a do vidro e a do tijolo, sem os poros.
    const wallCell = (0.5 * 0.01) / FIELD_FILM_SUBDIV;
    const trailOf = async (app: Application): Promise<{ trail: number[]; above: number }> => {
        const field = app.world.findResource(FluidField.schema, FluidField)!;
        const cells = [...(await table(app, field)).values()].filter(
            (c) => c.surface === 2 && c.free > 0 && !c.submerged,
        );
        const top = Math.max(...cells.map((c) => c.free));
        return {
            trail: cells.filter((c) => c.free < 0.5 * top).map((c) => c.free),
            above: cells.length,
        };
    };
    for (const [name, options] of [
        ['vidro', SurfacePhysics.GLASS],
        ['tijolo', { ...SurfacePhysics.BRICK, porosity: 0 }],
    ] as const) {
        const terms = filmSurfaceTerms(new SurfacePhysics(options), liquid, air);
        // No caminho por onde a água acabou de passar a frente avança sobre água: a borda segura só a fração
        // `trailRetention` (o rastro de quem desce é mais fino que a água que uma gota parada segura).
        const hold =
            pinnedThickness(terms.retentionPerDensity * 1000, 9.81, 0.5 * 0.01)
            * terms.trailRetention;
        const { trail, above } = await wallTrail(options, trailOf);
        const sorted = [...trail].sort((a, b) => a - b);
        const mid = sorted[sorted.length >> 1] ?? NaN;
        log(
            `hold ${name}: ${trail.length} células no rastro (de ${above}) com ${(mid * 1e3).toFixed(4)} mm na mediana, a borda segura ${(hold * 1e3).toFixed(4)} mm (célula de ${(wallCell * 1e3).toFixed(2)} mm)`,
        );
        if (trail.length < 20 || !(Math.abs(mid / hold - 1) <= 0.02))
            fail(`hold ${name}: ${trail.length} células, ${mid} contra ${hold}`);
    }

    // A evaporação (Carrier): a poça da gota passada à película no ar de 50 % (`Atmosphere.defaults`), na superfície sem
    // poros — o espalhamento só muda a água de lugar (a conta inteira), e entre 2 e 3 s ela perde a taxa vezes a área
    // molhada (a média das células com água nos dois instantes).
    const dry = filmSurfaceTerms(new SurfacePhysics(rough), liquid, air).evaporation;
    const puddle = await dropSpread(rough, spreadFilm, [2, 3], air.relativeHumidity);
    const [p2, p3] = puddle.film;
    const area = 0.5 * (p2!.cells + p3!.cells) * cell * cell;
    const rate = (p2!.volume - p3!.volume) / area;
    log(
        `evaporation: a poça de ${p2!.cells} → ${p3!.cells} células perde ${rate.toExponential(4)} m/s (Carrier ${dry.toExponential(4)})`,
    );
    if (!(Math.abs(rate / dry - 1) <= 0.02)) fail(`evaporation: ${rate} contra ${dry}`);

    log('WETTING SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

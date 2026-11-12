// Spec 034 — Smoke da água que molha os sólidos: a película com a física da superfície (`SurfacePhysics`) e o ar
// (`Atmosphere`), contra a teoria.
//
// A barragem do tanque dos smokes; a película lida da tabela dela no buffer das consultas do campo. Duas cenas:
//   - glass: chão de concreto (`SurfacePhysics.CONCRETE`) e paredes de vidro (`GLASS`):
//     - washburn: no concreto, a água absorvida da célula molhada há mais tempo segue Lucas–Washburn — (A²(3 s) −
//       A²(2 s)) / 1 s igual ao coeficiente W da superfície a 1 %;
//     - evaporation (na cena do tijolo, de 4 a 5 s): a película parada no chão (fora da água e do toque das partículas
//       há 1 s, com as quatro vizinhas na mesma espessura: a pressão não a move) perde em 1 s a taxa de Carrier a 20 °C e 50 % (`Atmosphere.defaults`) a 2 %
//       (o ponto fixo de 0,01 nm dá ~0,7 %), em ≥ 10 células;
//     - flow: o vidro segura parada só ~0,03 mm (Furmidge, histerese de 5°): a residual de 0,1 mm que a água deixa rompe
//       a borda e escorre — há células da parede com mais que a residual (a água que desceu e se juntou) e células com
//       a espessura presa (o rastro que ela deixa);
//     - impermeable: nada absorvido no vidro nem nas superfícies sem `SurfacePhysics`;
//   - brick: paredes de tijolo (`BRICK`): a borda segura ~0,2 mm (rugoso, histerese de 35°), mais que a residual —
//     nenhuma célula da parede passa da residual (nada escorre) —, e o tijolo absorve.
// E três cenas da T066d (`support/wettingScenes.ts`):
//   - edge: o rastro de uma gota de 3 × 3 partículas num azulejo inclinado 35°, a descida a 30° dos eixos da grade, visto
//     de cima — a borda do rastro sem os degraus da grade (a célula da película de um quarto do espaçamento, a leitura
//     pela B-spline quadrática, o disco do contato na deposição): desvio RMS das bordas da reta ≤ 3,5 mm e nenhuma
//     fileira sem água (≤ 1 %) — antes da T066d, 7,4 mm: o rastro em três fileiras pontilhadas, nos degraus do voxel
//     (as três fileiras de gotas seguem como três faixas, agora lisas);
//   - anchor: a gota de uma partícula num plano inclinado da superfície { rugosidade 1,3, histerese 40° } — o ângulo de
//     deslize pela força de Furmidge da borda dela (`ParticlePhysics.dropPinning`): a metade dele, parada (< 1 mm/s); o
//     dobro, solta (> 100 mm em 1 s);
//   - drip: a água que escorre por uma esfera lisa pende embaixo, junta-se e pinga — ≥ 1 pingo abaixo da esfera, a
//     menos de 1 cm do eixo, e a película perde exatamente o volume das partículas que voltaram (≤ 0,1 %).
//
// Para rodar: `npm run smoke -- wetting`. Resultado: `WETTING SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Atmosphere,
    createScene,
    ParticlePhysics,
    SurfacePhysics,
} from 'clayflow/web';
import type { StagingBufferSpec, SurfacePhysicsOptions } from 'clayflow/web';
import { FluidField, fieldFilmOffset } from '../elements/fields/FluidField';
import { FIELD_FILM_CELLS, FIELD_FILM_SUBDIV, FIELD_FILM_WORDS } from '../elements/fields/schemas';
import { filmSurfaceTerms, pinnedThickness } from '../elements/physics/wetting/wetting';
import { nextGpuFrame } from './support/extensionScenes';
import { DRIP_SPHERE, dropSlide, sphereDrips, trailEdge } from './support/wettingScenes';
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

/** Chave da célula de coordenadas `c` (`field_film_key`). */
const keyOf = (c: readonly number[]): number =>
    ((((c[0]! + 1024) << 21) | ((c[1]! + 512) << 11) | (c[2]! + 1024)) + 1) >>> 0;

/** As quatro vizinhas do plano da célula (os eixos fora da normal dominante, como `field_film_axes`). */
function neighbors(c: Cell): number[] {
    const a = [Math.abs(c.nx), Math.abs(c.ny), Math.abs(c.nz)];
    const axes = a[0]! >= a[1]! && a[0]! >= a[2]! ? [1, 2] : a[1]! >= a[2]! ? [0, 2] : [0, 1];
    const at = coords(c.key);
    const out: number[] = [];
    for (const axis of axes)
        for (const d of [-1, 1]) {
            const o = [...at];
            o[axis]! += d;
            out.push(keyOf(o));
        }
    return out;
}

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
        frame.copy(spec, staging, bytes, fieldFilmOffset(field.capacity) * 4, 0);
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

const median = (v: number[]): number => {
    const s = [...v].sort((a, b) => a - b);
    return s[s.length >> 1]!;
};

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
    const [, , b3, b4, b5] = await run({ walls: SurfacePhysics.BRICK }, 5);

    // A evaporação no chão sem `SurfacePhysics` (a superfície padrão: não absorve, a taxa de Carrier é a mesma do
    // vidro — só o ar e a temperatura): as células fora da água, mais secas aos 3 s, com as quatro vizinhas do plano
    // na mesma espessura nos dois instantes — ali a pressão (o peso e a de Laplace) não move água, só a evaporação.
    const level = (m: Map<number, Cell>, c: Cell): boolean =>
        neighbors(c).every((k) => {
            const o = m.get(k);
            return o !== undefined && !o.submerged && Math.abs(o.free - c.free) <= 2 * UNIT;
        });
    const drops: number[] = [];
    for (const c of b5!.values()) {
        const p = b4!.get(c.key);
        if (
            c.surface !== 1
            || c.ny < 0.9
            || p === undefined
            || p.submerged
            || c.submerged
            || !(c.free < p.free)
            // Fora do alcance das partículas há pelo menos 1 s (a deposição devolve a residual a quem elas tocam).
            || !(p.free <= RESIDUAL - glass.evaporation)
            || !level(b4!, p)
            || !level(b5!, c)
        )
            continue;
        drops.push(p.free - c.free);
    }
    const rate = drops.length > 0 ? median(drops) : NaN;
    log(
        `evaporation: ${drops.length} células paradas no chão, ${rate.toExponential(4)} m/s (Carrier ${glass.evaporation.toExponential(4)})`,
    );
    if (drops.length < 10 || !(Math.abs(rate / glass.evaporation - 1) <= 0.02))
        fail(`evaporation: ${drops.length} células, ${rate} contra ${glass.evaporation}`);
    const brickWalls = [...b3!.values()].filter(
        (c) => c.surface >= 2 && Math.abs(c.ny) < 0.3 && !c.submerged,
    );
    const over = brickWalls.filter((c) => c.free > RESIDUAL + 2 * UNIT).length;
    const absorbed = brickWalls.filter((c) => c.absorbed > 0).length;
    log(
        `brick: ${brickWalls.length} células à vista nas paredes, ${over} acima da residual, ${absorbed} com água absorvida`,
    );
    if (over > 0 || absorbed === 0)
        fail(`brick: ${over} acima da residual, ${absorbed} absorvendo`);

    // A borda do rastro (T066d).
    const edge = await trailEdge();
    log(
        `edge: serrilha ${edge.rms.toFixed(2)} mm, ${edge.crossings.toFixed(2)} bordas por fileira, falhas ${(100 * edge.gaps).toFixed(1)} %, largura ${edge.width.toFixed(1)} mm (${edge.rows} fileiras)`,
    );
    if (!(edge.rms <= 3.5) || !(edge.gaps <= 0.01) || edge.rows < 100)
        fail(
            `edge: serrilha ${edge.rms} mm, ${edge.crossings} bordas por fileira, falhas ${edge.gaps}, ${edge.rows} fileiras`,
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
        for (const c of (await table(app, field)).values())
            if (c.surface === 2) volume += (c.free + c.pending * 1024 * UNIT) * cell * cell;
        return { volume };
    };
    const drip = await sphereDrips(sphereFilm, 2, 10);
    const lost = drip.before - drip.after;
    const expected = drip.drips * drip.volume;
    const bottom = DRIP_SPHERE.center[1] - DRIP_SPHERE.radius;
    log(
        `drip: ${drip.drips} pingos de ${(drip.volume * 1e6).toFixed(3)} mL entre 2 e 10 s, a película perdeu ${(lost * 1e6).toFixed(4)} mL (as partículas: ${(expected * 1e6).toFixed(4)} mL); os pingos de ${drip.lowest.toFixed(3)} a ${drip.highest.toFixed(3)} m (o fundo da esfera a ${bottom.toFixed(2)} m), a ${(drip.aside * 1e3).toFixed(1)} mm do eixo`,
    );
    if (
        drip.drips < 1
        || !(Math.abs(lost - expected) <= 1e-3 * expected)
        || !(drip.highest < bottom)
        || !(drip.lowest > bottom - 0.05)
        || !(drip.aside <= 0.01)
    )
        fail(`drip: ${drip.drips} pingos, perda ${lost} contra ${expected}`);

    log('WETTING SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

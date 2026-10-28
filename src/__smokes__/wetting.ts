// Spec 034 — Smoke da água que molha os sólidos: a película com a física da superfície (`SurfacePhysics`) e o ar
// (`Atmosphere`), contra a teoria.
//
// A barragem do tanque dos smokes; a película lida da tabela dela no buffer das consultas do campo. Duas cenas:
//   - glass: chão de concreto (`SurfacePhysics.CONCRETE`) e paredes de vidro (`GLASS`):
//     - washburn: no concreto, a água absorvida da célula molhada há mais tempo segue Lucas–Washburn — (A²(3 s) −
//       A²(2 s)) / 1 s igual ao coeficiente W da superfície a 1 %;
//     - evaporation: a película presa no vidro (fora da água, abaixo da espessura que a borda segura) perde em 1 s a
//       taxa de Carrier a 20 °C e 50 % (`Atmosphere.defaults`) a 2 % (o ponto fixo de 0,01 nm dá ~0,7 %), em ≥ 10
//       células;
//     - flow: o vidro segura parada só ~0,03 mm (Furmidge, histerese de 5°): a residual de 0,1 mm que a água deixa rompe
//       a borda e escorre — há células da parede com mais que a residual (a água que desceu e se juntou) e células com
//       a espessura presa (o rastro que ela deixa);
//     - impermeable: nada absorvido no vidro nem nas superfícies sem `SurfacePhysics`;
//   - brick: paredes de tijolo (`BRICK`): a borda segura ~0,2 mm (rugoso, histerese de 35°), mais que a residual —
//     nenhuma célula da parede passa da residual (nada escorre) —, e o tijolo absorve.
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
import { FIELD_FILM_CELLS, FIELD_FILM_WORDS } from '../elements/fields/schemas';
import { filmSurfaceTerms, pinnedThickness } from '../elements/physics/wetting/wetting';
import { nextGpuFrame } from './support/extensionScenes';
import { waterScene, WATER_SPACING } from './support/waterScene';

/** Unidade da espessura na tabela (`FIELD_FILM_UNIT`, m). */
const UNIT = 1e-11;
/** Película residual que a água deixa ao passar (`FIELD_FILM_RESIDUAL`, m). */
const RESIDUAL = 1e-4;
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
    /** Componente y da normal do sólido. */
    readonly ny: number;
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
            ny: ((((u[w + 2]! >> 8) & 255) << 24) >> 24) / 127,
            submerged: u[w + 3] !== 0,
            absorbed: u[w + 4]! * UNIT,
            surface: u[w + 5]!,
        });
    }
    return cells;
}

const median = (v: number[]): number => {
    const s = [...v].sort((a, b) => a - b);
    return s[s.length >> 1]!;
};

/** A cena: a barragem no tanque com as superfícies dadas; devolve a película a cada segundo, de 1 a 3 s. */
async function run(surfaces: {
    floor?: SurfacePhysicsOptions;
    walls?: SurfacePhysicsOptions;
}): Promise<Map<number, Cell>[]> {
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
    for (let i = 1; i <= 180; i++) {
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
    const a2 = Math.max(...floorOf(s2!).map((c) => c.absorbed));
    const a3 = Math.max(...floorOf(s3!).map((c) => c.absorbed));
    const slope = a3 * a3 - a2 * a2;
    log(
        `washburn: (A²(3 s) − A²(2 s)) / 1 s = ${slope.toExponential(4)} m²/s (W ${concrete.washburn.toExponential(4)})`,
    );
    if (!(Math.abs(slope / concrete.washburn - 1) <= 0.01))
        fail(`washburn: ${slope} contra ${concrete.washburn}`);

    const drops: number[] = [];
    for (const c of wallsOf(s3!)) {
        const p = s2!.get(c.key);
        if (
            p === undefined
            || p.submerged
            || c.submerged
            || !(p.free <= held(glass) * 1.001)
            || !(c.free < p.free)
        )
            continue;
        drops.push(p.free - c.free);
    }
    const rate = drops.length > 0 ? median(drops) : NaN;
    log(
        `evaporation: ${drops.length} células presas, ${rate.toExponential(4)} m/s (Carrier ${glass.evaporation.toExponential(4)})`,
    );
    if (drops.length < 10 || !(Math.abs(rate / glass.evaporation - 1) <= 0.02))
        fail(`evaporation: ${drops.length} células, ${rate} contra ${glass.evaporation}`);

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
    const [, , b3] = await run({ walls: SurfacePhysics.BRICK });
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

    log('WETTING SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

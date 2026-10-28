import { FieldType } from '../../scene/descriptors/FieldType';
import { fieldArray, StructSchema } from '../../scene/descriptors/StructSchema';
import { sharedConstant } from '../../scene/shaders/SharedConstant';
import { SurfacePhysics } from '../physics/wetting/SurfacePhysics';

/** Voxels por lado de um bloco do campo (o interior). */
export const FIELD_BRICK = 8;
/** Voxels de borda de cada lado (a amostra tricúbica cabe num bloco só). */
export const FIELD_APRON = 2;
/** Voxels por lado de um bloco com a borda. */
export const FIELD_BRICK_STRIDE = FIELD_BRICK + 2 * FIELD_APRON;
/** Voxels do interior de um bloco. */
export const FIELD_BRICK_VOXELS = FIELD_BRICK ** 3;
/** Voxels de um bloco com a borda. */
export const FIELD_BRICK_APRON_VOXELS = FIELD_BRICK_STRIDE ** 3;
/** Partículas por bloco na capacidade de blocos (a capacidade é as partículas divididas por isto). */
export const FIELD_PARTICLES_PER_BRICK = 8;
/**
 * Corpos de fluido no campo (a tabela `bodies` do uniform: 1 KiB). Um uniform, não um storage: as consultas ao campo
 * já ocupam ligações de storage nos estágios que traçam raios, e o teto delas por estágio é o limite apertado.
 */
export const FIELD_MAX_BODIES = 64;

/** Entradas da tabela das superfícies da película (spec 034): o padrão (0) e as `SurfacePhysics` da cena (1…). */
export const FIELD_FILM_SURFACES = sharedConstant(
    'FIELD_FILM_SURFACES',
    SurfacePhysics.MAX + 1,
    'u32',
);

/**
 * Parâmetros do campo dos fluidos (uniform, spec 033, R11): `sizes` = (partículas, capacidade de blocos, máscara da
 * tabela, iterações da eikonal); `grid` = (espaçamento, voxel, raio do núcleo, faixa útil); `tuning` = (suavização, razão máxima, raio dos
 * núcleos esparsos em fração, nível da superfície); `limits` = (vizinhos do núcleo anisotrópico, sondagens da tabela,
 * 0, 0); `contact` = (raio lateral e normal da gota pousada num sólido em frações do raio esparso, 0, 0; x = 0 sem
 * calota).
 */
export const FluidFieldSchema = new StructSchema(
    'FluidFieldParams',
    {
        sizes: FieldType.vec4u,
        grid: FieldType.vec4f,
        tuning: FieldType.vec4f,
        limits: FieldType.vec4u,
        /** x: 1 quando a simulação avançou no quadro (o nível da superfície se ajusta só então). */
        motion: FieldType.vec4u,
        /**
         * A gota que molha (spec 034): a partícula isolada encostada num sólido vira uma calota achatada contra ele,
         * com o volume do núcleo esparso e a forma do ângulo de contato de `ParticlePhysics` (`fieldContactShape`) —
         * x, y. z: o tempo simulado que o quadro avançou (s; 0 parado): o escoamento e a evaporação da película.
         */
        contact: FieldType.vec4f,
        /**
         * A película de água nos sólidos (spec 034, `field_film.wgsl`): x a primeira palavra dela no buffer das
         * consultas, y a máscara da tabela (células − 1).
         */
        film: FieldType.vec4u,
        /** O escoamento da película: a gravidade (xyz, m/s²) e a viscosidade cinemática da água (w, m²/s). */
        filmFlow: FieldType.vec4f,
        /**
         * As paredes do domínio das partículas, que a película molha como os colliders: o canto mínimo (xyz; w = 1 com
         * paredes, 0 no domínio aberto) e o máximo (xyz) — o chão e os quatro lados.
         */
        filmBoundsMin: FieldType.vec4f,
        filmBoundsMax: FieldType.vec4f,
        /**
         * Por superfície da película (`FIELD_FILM_SURFACES`, duas linhas cada; `filmSurfaceTerms`): (a força da borda
         * sobre a densidade em m³/s², o inverso da rugosidade, o coeficiente de Washburn em m²/s, a capacidade dos poros
         * em m) e (a evaporação da água livre em m/s, 0, 0, 0).
         */
        filmSurfaces: fieldArray(FieldType.vec4f, 2 * FIELD_FILM_SURFACES.value),
        /**
         * Por corpo (a palavra dos blocos é o índice + 1, spec 034 T065d): (índice + 1 da função `material` na
         * composição dos acertos dos raios — `RayScene.materialFunctions` —, 0 sem; slot dos parâmetros dela; 0; 0).
         */
        bodies: fieldArray(FieldType.vec4u, FIELD_MAX_BODIES),
    },
    { addressSpace: 'uniform' },
);

/**
 * Corpo de partículas na junção (uma região por corpo, offset dinâmico): o primeiro slot no pool, o stride do registro e
 * o deslocamento de `pos` em `vec4f`, as partículas, o início no array compacto e o corpo (índice + 1 na tabela
 * `bodies` do campo: a palavra dos blocos), e o deslocamento do contato (`contact`: o sólido mais próximo, escrito
 * pelo solver) em `vec4f` — `NONE` sem ele.
 */
export const FieldGatherSchema = new StructSchema(
    'FieldGather',
    {
        first: FieldType.u32,
        strideVec4: FieldType.u32,
        posOffsetVec4: FieldType.u32,
        count: FieldType.u32,
        base: FieldType.u32,
        body: FieldType.u32,
        contactOffsetVec4: FieldType.u32,
        _pad1: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Palavra de 32 bits (os buffers crus do campo: chaves, slots, contagens; o tamanho do descritor). */
export const FieldWordSchema = new StructSchema('FieldWord', { value: FieldType.u32 });

/**
 * Forma da gota pousada num sólido (spec 034): a calota de ângulo de contato θ como o elipsoide achatado contra o
 * sólido com o volume do núcleo esparso (raio lateral a, normal c, a² c = 1 em frações dele) e a razão c / a =
 * tan(θ/2) — a altura sobre a base da calota esférica de ângulo θ. O lateral fica no alcance do núcleo (2 frações); com
 * θ ≥ 90° a gota não molha e fica a esfera. Devolve (a, c), ou (0, 0) sem calota.
 */
export function fieldContactShape(contactAngle: number): [number, number] {
    if (!(contactAngle < 90)) return [0, 0];
    const tau = Math.tan((Math.max(contactAngle, 0) * Math.PI) / 360);
    const a = Math.min(tau > 0 ? tau ** (-1 / 3) : Infinity, 2);
    return [a, 1 / (a * a)];
}

/** Células da tabela da película de água nos sólidos (spec 034). */
export const FIELD_FILM_CELLS = 262144;

/**
 * Palavras por célula da película (`field_film.wgsl`): a chave, a água livre, a normal do sólido, a marca de submersa,
 * a água absorvida e a superfície (6 MiB na tabela).
 */
export const FIELD_FILM_WORDS = sharedConstant('FIELD_FILM_WORDS', 6, 'u32');

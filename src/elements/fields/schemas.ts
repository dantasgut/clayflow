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
/** Constantes do campo (as mesmas do WGSL; a referência da CPU, `reference/field.ts`, usa estas). */
export const FIELD = Object.freeze({
    /** Voxel em espaçamentos de partícula. */
    voxel: 0.5,
    /** Raio do núcleo em espaçamentos (o espalhamento cabe em 2 × 2 × 2 blocos: alcance ≤ 4 voxels). */
    radius: 2,
    /**
     * Raio da vizinhança da covariância, em espaçamentos (T066e): com o do núcleo (2), o arranjo das partículas da
     * superfície parada ficava no relevo dela (o favo de mel do `fluidField` `normal`: 0,0098 → 0,0059). A partir de √6
     * (a casca seguinte da rede) a forma da esfera pequena do teste da referência sai do |∇φ| ≈ 1 (1,26). A posição
     * suavizada fica no raio do núcleo: na vizinhança maior a média puxava a superfície para dentro (a barragem perdia 9 %
     * do volume antes de o nível se ajustar; o nível não compensa — o perfil dos núcleos achatados é íngreme).
     */
    neighborhood: 2.25,
    /** Suavização das posições (Laplaciano de Yu & Turk). */
    smoothing: 0.5,
    /** Razão máxima entre o maior e o menor raio do núcleo. */
    ratio: 4,
    /** Vizinhos abaixo dos quais o núcleo é isotrópico e menor. */
    neighbors: 8,
    /** Raio do núcleo isotrópico das partículas com poucos vizinhos, em fração do raio. */
    sparse: 0.5,
    /** Nível da superfície na densidade normalizada (1 dentro do fluido). */
    iso: 0.42,
    /** Faixa estreita útil do campo, em voxels (o redistanciamento calcula em 3 vezes ela). */
    band: 4,
    /** Iterações do método rápido da eikonal (a distância é exata até essa quantidade de voxels da interface). */
    iterations: 6,
    /** Blocos de voxels por lado (a grade esparsa da GPU). */
    brick: 8,
});

/** Partículas por bloco na capacidade de blocos (a capacidade é as partículas divididas por isto). */
export const FIELD_PARTICLES_PER_BRICK = 8;
/**
 * Corpos de fluido no campo (a tabela `bodies` do uniform: 1 KiB). Um uniform, não um storage: as consultas ao campo
 * já ocupam ligações de storage nos estágios que traçam raios, e o teto delas por estágio é o limite apertado.
 */
export const FIELD_MAX_BODIES = 64;

/** Palavras do meio de um corpo no buffer das consultas (`fieldMediaOffset`, spec 039). */
export const FIELD_MEDIUM_WORDS = 8;

/**
 * O mapa da luz pela água (spec 039 refeita, `field_light_map.wgsl`): luzes direcionais com mapa, texels por lado e
 * palavras por texel (`FIELD_LIGHT_WORDS`). As outras luzes marcham o campo em cada ponto.
 */
export const FIELD_LIGHT_MAPS = 2;
export const FIELD_LIGHT_RES = 512;
export const FIELD_LIGHT_WORDS = 8;

/**
 * A malha da superfície (spec 039 refeita, `field_mesh.wgsl`): triângulos por bloco da capacidade (a superfície que
 * corta um bloco dá até ~5 por célula cortada; os blocos do interior, nenhum), palavras por vértice e os argumentos (o
 * desenho indireto e a contagem).
 */
export const FIELD_MESH_TRIANGLES_PER_BRICK = 256;
export const FIELD_MESH_VERTEX_WORDS = 4;
export const FIELD_MESH_ARGS_WORDS = 8;

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
 * a primeira palavra dos blocos, a do atlas dos voxels — T060f); `contact` = (raio lateral e normal da gota pousada num sólido em frações do raio esparso, 0, 0; x = 0 sem
 * calota).
 */
export const FluidFieldSchema = new StructSchema(
    'FluidFieldParams',
    {
        sizes: FieldType.vec4u,
        grid: FieldType.vec4f,
        tuning: FieldType.vec4f,
        limits: FieldType.vec4u,
        /**
         * x: o raio da vizinhança (m) da covariância dos núcleos — maior que o do núcleo (`grid.z`, o da posição
         * suavizada): a forma pela covariância de mais partículas tira o relevo do arranjo delas da superfície parada.
         */
        reach: FieldType.vec4f,
        /** x: 1 quando a simulação avançou no quadro (o nível da superfície se ajusta só então). */
        motion: FieldType.vec4u,
        /** x: o tempo simulado do quadro (s) — a amostra do material de cada corpo (spec 039). */
        time: FieldType.vec4f,
        /** x: a primeira palavra do meio dos corpos em `data`; y: os corpos da tabela (spec 039). */
        media: FieldType.vec4u,
        /** O mapa da luz pela água (spec 039 refeita): x 0; y texels por lado; z mapas (luzes direcionais com mapa). */
        lights: FieldType.vec4u,
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
         * A forma da película (spec 034, T066d): o lado da célula (x, m — a resolução do rastro, `FIELD_FILM_SUBDIV`
         * células por voxel do campo), a tensão superficial sobre a densidade (y, m³/s²: a pressão de Laplace), o volume
         * de uma partícula (z, m³: o pingo) e o raio de colisão dela (w, m: o contato que deixa o rastro).
         */
        filmShape: FieldType.vec4f,
        /**
         * As paredes do domínio das partículas, que a película molha como os colliders: o canto mínimo (xyz; w = 1 com
         * paredes, 0 no domínio aberto) e o máximo (xyz) — o chão e os quatro lados.
         */
        filmBoundsMin: FieldType.vec4f,
        filmBoundsMax: FieldType.vec4f,
        /**
         * Por superfície da película (`FIELD_FILM_SURFACES`, três linhas cada; `filmSurfaceTerms`): (a força da borda
         * sobre a densidade em m³/s², o inverso da rugosidade, o coeficiente de Washburn em m²/s, a capacidade dos poros
         * em m), (a evaporação da água livre em m/s, o cosseno do ângulo de contato, a base da gota, a espessura da
         * ruptura) e (a desigualdade da força da borda, 0, 0, 0).
         */
        filmSurfaces: fieldArray(FieldType.vec4f, 3 * FIELD_FILM_SURFACES.value),
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
        /** Deslocamentos da velocidade e da posição anterior em `vec4f` (`NONE` sem): o pingo volta parado (T066d). */
        velOffsetVec4: FieldType.u32,
        posOldOffsetVec4: FieldType.u32,
        /**
         * Deslocamento em `vec4f` do campo cujo `w` guarda o estado da gota solta depois do passo (`fluid_drop_state`:
         * negativo na que desliza, T066d) — `NONE` sem: a gota que desliza vira película.
         */
        dropOffsetVec4: FieldType.u32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
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

/**
 * Células da tabela da película de água nos sólidos (spec 034): 2²¹ — com a célula da resolução do rastro (T066d, um
 * quarto do espaçamento), ~80 m² molhados com a tabela pela metade (56 MiB por fatia). A barragem que transborda do
 * tanque cobre o chão inteiro do domínio de 4 × 4 m (a água que passa das paredes vira película no chão: ~730 mil
 * células com as do vidro); com 2²⁰ as páginas enchiam a 95 % e as que não cabiam sumiam.
 */
export const FIELD_FILM_CELLS = 2097152;

/**
 * Palavras por célula da película (`field_film.wgsl`): a chave, a água livre, a normal do sólido, a marca de submersa,
 * a água absorvida, a superfície, a água pendente e o escoamento (a água que passou pela célula descendo, com a memória
 * de poucos passos: o filete que corre).
 */
export const FIELD_FILM_WORDS = sharedConstant('FIELD_FILM_WORDS', 8, 'u32');

/**
 * Células por página da película (T066d): páginas de 8 × 8 células no plano da superfície, numa camada, com o eixo da
 * normal dominante na chave — a tabela de espalhamento guarda as páginas, e a célula é endereçada direto dentro da sua (a
 * leitura 3 × 3 da superfície e as vizinhas do passo caem quase sempre na mesma página: uma sondagem por página, não por
 * célula). A página cúbica de 4³ de antes usava uma camada só (16 das 64): a chuva num chão grande enchia a tabela das
 * páginas. `FIELD_FILM_CELLS / FIELD_FILM_PAGE_CELLS` páginas.
 */
export const FIELD_FILM_PAGE_CELLS = 64;

/**
 * Palavras de uma fatia da película: as células (`FIELD_FILM_WORDS` cada, na ordem das páginas) e depois a tabela das
 * páginas (a chave de cada uma).
 */
export const FIELD_FILM_SLICE_WORDS =
    FIELD_FILM_WORDS.value * FIELD_FILM_CELLS + FIELD_FILM_CELLS / FIELD_FILM_PAGE_CELLS;

/**
 * Células da película por lado de voxel do campo (spec 034, T066d): com o voxel de meio espaçamento, a célula é um
 * quarto dele — o contato de uma partícula (o diâmetro) cobre quatro, e a borda do rastro sai da leitura suave delas, não
 * dos degraus do voxel.
 */
export const FIELD_FILM_SUBDIV = 2;

/** Pingos por quadro no máximo (spec 034, T066d): a lista das partículas que a película devolve à simulação. */
export const FIELD_FILM_DRIPS = sharedConstant('FIELD_FILM_DRIPS', 256, 'u32');

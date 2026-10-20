import { graphArgument, type GraphArgument } from '../../../scene/graph/NodeGraph';

// Entradas de contexto (spec 031, R12): os argumentos da função do ponto alvo como nós do grafo (`graphArgument`) — sem
// código, ligam direto no valor que o ponto recebe. Saída `value` (o argumento inteiro) e uma por campo do struct. Um
// grafo com uma entrada que o ponto não tem não compila (erro `target` nomeando o argumento e os do ponto).

/** Campos da amostra de superfície do ponto `material` (`SurfaceSample`). */
const SURFACE_SAMPLE_FIELDS = {
    world_position: 'vec3f',
    normal: 'vec3f',
    uv: 'vec2f',
    time: 'f32',
    metric: 'vec3f',
    curvature: 'vec4f',
    principal: 'vec3f',
    footprint: 'f32',
    duvdx: 'vec2f',
    duvdy: 'vec2f',
} as const;

/** Campos do corpo do ponto `field` (`FieldBody`). */
const FIELD_BODY_FIELDS = { inv_mass: 'f32', density: 'f32', volume: 'f32' } as const;

/** Campos da câmera do ponto `camera` (`Camera`). */
const CAMERA_FIELDS = {
    projection: 'u32',
    fov: 'f32',
    orthoHeight: 'f32',
    near: 'f32',
    far: 'f32',
    aspect: 'f32',
} as const;

/** Argumentos de partícula: o corpo do ponto `field` (`x`, `v`, `body`) e a emitida do ponto `emit` (`i`, `seed`). */
export type ParticleArgument = 'x' | 'v' | 'body' | 'i' | 'seed';

/** Argumentos do ponto `camera`: a câmera (`c`), a matriz de mundo dela (`world`) e a razão de aspecto (`aspect`). */
export type CameraArgument = 'c' | 'world' | 'aspect';

/**
 * Entradas de contexto: amostra de superfície e posição de mundo (`material`), material da entidade (`material`),
 * vértice (entradas de ponto dos nós de conjunto), partícula (`field`, `emit`), célula da grade paramétrica (`surface`),
 * tempo (pontos com argumento `time`), câmera (`camera`).
 */
export const input = {
    /**
     * A amostra de superfície do ponto `material` (`s`): posição de mundo, normal, uv, tempo, a geometria diferencial
     * da 010 (`metric`, `curvature`, `principal`) e a largura do pixel ou do cone do raio no ponto (`footprint`, em
     * metros) com as derivadas do uv (`duvdx`, `duvdy`) — a entrada `width` dos nós de ruído (spec 034).
     */
    surfaceSample: (): GraphArgument => graphArgument('s', SURFACE_SAMPLE_FIELDS),
    /** A posição de mundo da amostra do ponto `material` (`s.world_position`). */
    worldPosition: (): GraphArgument => graphArgument('s', { world_position: 'vec3f' }),
    /** As constantes do material da entidade (`m`, ponto `material`). */
    material: (): GraphArgument =>
        graphArgument('m', { albedo: 'vec4f', roughness: 'f32', metallic: 'f32' }),
    /**
     * O tempo simulado (argumento `time` dos pontos `surface`, `space`, `field`, `transform`, `camera` e `emit`). No
     * ponto `material` o tempo é o campo `time` da amostra (`surfaceSample`).
     */
    time: (): GraphArgument => graphArgument('time'),
    /**
     * Um argumento das entradas de ponto dos nós de conjunto — o vértice (`height` de `set.displace`, `density` de
     * `set.distributeOnMesh`): `position` e `normal` (`vec3f`) ou `uv` (`vec2f`) do elemento.
     */
    vertexField: (name: 'position' | 'normal' | 'uv'): GraphArgument => graphArgument(name),
    /**
     * Um argumento de partícula: no ponto `field`, a posição `x`, a velocidade `v` (`vec3f`) e o corpo `body` (massa
     * inversa, densidade, volume); no ponto `emit`, o índice global `i` e a semente `seed` (`u32`) da emitida.
     */
    particle: (name: ParticleArgument): GraphArgument =>
        graphArgument(name, name === 'body' ? FIELD_BODY_FIELDS : {}),
    /** A célula da grade paramétrica do ponto `surface`: a coordenada `u` ou `v` (`f32`) da amostra. */
    cell: (name: 'u' | 'v'): GraphArgument => graphArgument(name),
    /**
     * Um argumento do ponto `camera`: a câmera `c` (projeção, `fov`, `orthoHeight`, `near`, `far`, `aspect`), a matriz
     * de mundo `world` (`mat4x4f`) ou a razão de aspecto do alvo `aspect`.
     */
    camera: (name: CameraArgument): GraphArgument =>
        graphArgument(name, name === 'c' ? CAMERA_FIELDS : {}),
} as const;

import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { parseWgslFunctions } from '../../scene/shaders/WgslPoint';
import { materialPoint } from '../material/point/shaders';
import {
    ALL_LOBES,
    lobeMask,
    lobeMaskOfTags,
    PARAMS_LOBES,
    TRANSMISSIVE_LOBES,
    type LobeName,
} from '../material/pbr/lobes';

/** Opções de uma `MaterialFunction`: código ou grafo, e os lobos que um código de fechamento usa. */
export type MaterialFunctionOptions = ExtensionFunctionOptions & {
    /**
     * Lobos que a função de código `-> Closure` produz (spec 011): o shader é especializado só com eles. Sem a lista,
     * todos — menos os transmissivos, se o código não tem como produzi-los. Ignorado num grafo (os lobos vêm dos nós) e nas funções `-> SurfaceParams` (difuso, especular e emissão).
     */
    readonly lobes?: readonly LobeName[];
};

/**
 * Função do ponto `material` — a aparência de uma superfície por regra, em WGSL ou por um grafo de nós. Duas formas
 * (spec 011):
 *
 * ```wgsl
 * fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure        // fechamento (011)
 * fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams  // 009
 * ```
 *
 * `s` traz a posição de mundo, a normal, o uv da geometria, o tempo simulado e a geometria diferencial; `m` as
 * constantes do material da entidade; `data` os parâmetros. O fechamento compõe lobos de espalhamento (`closure_*`, ou
 * os nós `bsdf.*`/`closure.*` num grafo com `output.closure`); `SurfaceParams` (cor base, rugosidade, metalicidade,
 * emissão) vira a base do OpenPBR — difuso, dielétrico de IOR 1,5 e condutor pela metalicidade. O shader de cada
 * material contém só os lobos que ele usa (`lobeMask`); mudar valores não recompila. Anexada a uma entidade desenhada
 * com `StandardMaterial`; até compilar, a entidade usa as constantes. Instâncias com o mesmo código compartilham o
 * pipeline.
 */
export class MaterialFunction extends ExtensionFunction {
    readonly #lobes: number | undefined;

    constructor(options: MaterialFunctionOptions) {
        super(materialPoint, options);
        this.#lobes = options.lobes === undefined ? undefined : lobeMask(options.lobes);
    }

    /** A função devolve um fechamento (`-> Closure`); `false`: `SurfaceParams` da 009. */
    get returnsClosure(): boolean {
        return parseWgslFunctions(this.module.source).get('material_fn')?.returns === 'Closure';
    }

    /**
     * Máscara dos lobos do shader (bits de `LOBES`): num grafo, a união das marcas `lobe:*` dos nós; num código de
     * fechamento, os `lobes` declarados (sem eles, todos — menos os transmissivos se o código não tem como produzi-los,
     * `TRANSMISSIVE_SOURCE`); com `SurfaceParams`, difuso, especular e emissão.
     */
    get lobeMask(): number {
        if (!this.returnsClosure) return PARAMS_LOBES;
        const graph = this.graph;
        if (graph !== undefined) {
            const mask = lobeMaskOfTags(graph.tags());
            return mask === 0 ? PARAMS_LOBES : mask;
        }
        if (this.#lobes !== undefined) return this.#lobes;
        return TRANSMISSIVE_SOURCE.test(this.module.source)
            ? ALL_LOBES
            : ALL_LOBES & ~TRANSMISSIVE_LOBES;
    }
}

/**
 * O código pode produzir transmissão, opacidade ou translucidez? O fechamento só as ganha pelos construtores delas
 * (`closure_transmission`, `closure_translucent`, `closure_opacity`), pelos campos delas (`.transmission_*`,
 * `.translucent_*`, `.opacity`) ou montado inteiro (`Closure(…)`). Na dúvida (o nome em qualquer lugar, comentário
 * incluído), sim. Um código sem nenhum deles não é transmissivo: não pede a refração nem traz o traçado à cena — o piso
 * de `closure_diffuse` sem a lista de lobos era desenhado pelo traçado da refração, com as sombras dos raios.
 */
const TRANSMISSIVE_SOURCE =
    /\bclosure_(?:transmission|translucent|opacity)\b|\.(?:transmission_\w+|translucent_\w+|opacity)\b|\bClosure\s*\(/;

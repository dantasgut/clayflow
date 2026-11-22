import type { ExtensionParamValue } from '../../scene/contracts/ExtensionParams';
import { NodeGraph } from '../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../scene/graph/NodeDefinition';
import { MaterialFunction } from '../extension/MaterialFunction';
import { material } from '../nodes/material';
import { output } from '../nodes/output';

/** Nome de um material pronto da biblioteca (os nós de `nodes.material`, menos o OpenPBR). */
export type MaterialName =
    | 'woodRaw'
    | 'woodRough'
    | 'woodVarnishedGloss'
    | 'woodVarnishedMatte'
    | 'cotton'
    | 'wool'
    | 'velvet'
    | 'silk'
    | 'denim'
    | 'sheerFabric'
    | 'leather'
    | 'rubber'
    | 'ceramic'
    | 'porcelain'
    | 'plasticMatte'
    | 'plasticGloss'
    | 'metalPolished'
    | 'metalBrushed'
    | 'carPaint'
    | 'carPaintSilver'
    | 'glass'
    | 'metalOxidized'
    | 'skin'
    | 'wax'
    | 'marble'
    | 'jade'
    | 'milk'
    | 'gold'
    | 'copper'
    | 'brass'
    | 'chrome'
    | 'aluminiumAnodized'
    | 'metalHammered'
    | 'castIron'
    | 'bronzePatina'
    | 'concrete'
    | 'granite'
    | 'sandstone'
    | 'brick'
    | 'plaster'
    | 'asphalt'
    | 'tile'
    | 'terracotta'
    | 'driedMud'
    | 'sand'
    | 'woodOak'
    | 'woodWalnut'
    | 'woodPine'
    | 'woodMahogany'
    | 'woodOakVarnished'
    | 'woodFloorPlanks'
    | 'woodFloorHerringbone'
    | 'bark'
    | 'barkBirch'
    | 'cork'
    | 'paper'
    | 'carbonFiber'
    | 'ice'
    | 'soap'
    | 'ivory'
    | 'motherOfPearl'
    | 'snow';

/**
 * Fábrica de um material pronto: os valores dos parâmetros expostos do nó (os que faltam ficam no padrão documentado)
 * → a `MaterialFunction` que se anexa à entidade.
 */
export type MaterialFactory = (
    values?: Readonly<Record<string, ExtensionParamValue>>,
) => MaterialFunction;

/** A fábrica do nó `definition`: o grafo de um nó (`material`) ligado à saída de fechamento. */
function factory(definition: NodeDefinition): MaterialFactory {
    return (values = {}) =>
        new MaterialFunction({
            graph: new NodeGraph({
                nodes: { material: definition.with(values), out: output.closure },
                links: [['material.value', 'out.closure']],
                output: 'out.value',
            }),
        });
}

/**
 * Biblioteca de materiais prontos (spec 011, US5): cada fábrica devolve uma `MaterialFunction` cujo grafo é um nó — o
 * sub-grafo `nodes.material.<nome>` — ligado à saída de fechamento. Os valores passados são os dos parâmetros expostos
 * do nó (ex.: `Materials.woodVarnishedGloss({ coat_color: [1, 0.85, 0.6] })`); depois de criada, mudam sem recompilar
 * por `values.material_<parâmetro>`. Materiais com o mesmo nó compartilham o pipeline. Para compor (misturar dois por
 * uma máscara, ligar a rugosidade a um ruído), use o nó `nodes.material.<nome>` num `NodeGraph` próprio.
 *
 * Madeira: `woodRaw`, `woodRough`, `woodVarnishedGloss`, `woodVarnishedMatte`, as espécies `woodOak`, `woodWalnut`,
 * `woodPine`, `woodMahogany`, `woodOakVarnished`, os assoalhos `woodFloorPlanks` e `woodFloorHerringbone`, as cascas `bark` e `barkBirch` e a cortiça `cork`. Tecidos: `cotton`, `wool`, `velvet`, `silk`, `denim`,
 * `sheerFabric`. Dielétricos opacos: `leather`, `rubber`, `ceramic`, `porcelain`, `plasticMatte`, `plasticGloss`,
 * `paper`. Metais: `metalPolished`, `gold`, `copper`, `brass`, `chrome`, `metalBrushed`, `metalHammered`,
 * `aluminiumAnodized`, `castIron`, `bronzePatina`, `metalOxidized`, `carPaint`, `carPaintSilver`, `carbonFiber`. Pedra, construção e
 * terra: `concrete`, `granite`, `sandstone`, `brick`, `plaster`, `asphalt`, `tile`, `terracotta`, `driedMud`, `sand`.
 * Translúcidos: `glass`, `skin`, `wax`, `marble`, `jade`, `milk`, `ice`, `soap`, `ivory`, `snow`. Iridescente:
 * `motherOfPearl`. Os valores físicos e as fontes estão na documentação de cada nó.
 *
 * Os de subsuperfície (`skin`, `wax`, `marble`, `porcelain`, `jade`, `milk`, `ice`, `soap`, `ivory`, `snow`) têm o raio de espalhamento em milímetros
 * (`radius`) e a escala do mundo em unidades por metro (`scale`, 1 por padrão): a luz se difunde sob a superfície e
 * atravessa as partes finas na medida do tamanho real do objeto — `Materials.wax({ scale: 100 })` numa cena em
 * centímetros.
 *
 * Os de relevo em milímetros (`woodRough`, `leather`, `wool`, `sandstone`, `brick`, `bark`, `barkBirch`, `driedMud`) têm as alturas em milímetros e a mesma escala do mundo
 * (`scale`): o relevo inclina a normal no material e, com a `DisplacementFunction` de mesmo nome (`Displacements`) na
 * entidade de uma `ParametricSurface`, move a geometria — os mesmos valores nos dois.
 *
 * A estrutura de cada um (o veio da madeira, a trama dos tecidos, o grão do couro, os riscos do metal escovado, os
 * flocos da pintura, a ferrugem, os veios do mármore) é calculada por pixel pelos nós `nodes.pattern.*` sobre o uv do
 * objeto, com o relevo na normal, filtrada pela largura do pixel. Os que têm padrão expõem `pattern_scale` (repetições
 * por unidade de uv, por eixo; (1, 1)): numa esfera, `Materials.denim({ pattern_scale: [2, 1] })`.
 *
 * @throws NodeGraphError (`node-signature`) valor para um parâmetro que o material não expõe.
 */
export const Materials: Readonly<Record<MaterialName, MaterialFactory>> = Object.freeze({
    woodRaw: factory(material.woodRaw),
    woodRough: factory(material.woodRough),
    woodVarnishedGloss: factory(material.woodVarnishedGloss),
    woodVarnishedMatte: factory(material.woodVarnishedMatte),
    cotton: factory(material.cotton),
    wool: factory(material.wool),
    velvet: factory(material.velvet),
    silk: factory(material.silk),
    denim: factory(material.denim),
    sheerFabric: factory(material.sheerFabric),
    leather: factory(material.leather),
    rubber: factory(material.rubber),
    ceramic: factory(material.ceramic),
    porcelain: factory(material.porcelain),
    plasticMatte: factory(material.plasticMatte),
    plasticGloss: factory(material.plasticGloss),
    metalPolished: factory(material.metalPolished),
    metalBrushed: factory(material.metalBrushed),
    carPaint: factory(material.carPaint),
    carPaintSilver: factory(material.carPaintSilver),
    glass: factory(material.glass),
    metalOxidized: factory(material.metalOxidized),
    skin: factory(material.skin),
    wax: factory(material.wax),
    marble: factory(material.marble),
    jade: factory(material.jade),
    milk: factory(material.milk),
    gold: factory(material.gold),
    copper: factory(material.copper),
    brass: factory(material.brass),
    chrome: factory(material.chrome),
    aluminiumAnodized: factory(material.aluminiumAnodized),
    metalHammered: factory(material.metalHammered),
    castIron: factory(material.castIron),
    bronzePatina: factory(material.bronzePatina),
    concrete: factory(material.concrete),
    granite: factory(material.granite),
    sandstone: factory(material.sandstone),
    brick: factory(material.brick),
    plaster: factory(material.plaster),
    asphalt: factory(material.asphalt),
    tile: factory(material.tile),
    terracotta: factory(material.terracotta),
    driedMud: factory(material.driedMud),
    sand: factory(material.sand),
    woodOak: factory(material.woodOak),
    woodWalnut: factory(material.woodWalnut),
    woodPine: factory(material.woodPine),
    woodMahogany: factory(material.woodMahogany),
    woodOakVarnished: factory(material.woodOakVarnished),
    woodFloorPlanks: factory(material.woodFloorPlanks),
    woodFloorHerringbone: factory(material.woodFloorHerringbone),
    bark: factory(material.bark),
    barkBirch: factory(material.barkBirch),
    cork: factory(material.cork),
    paper: factory(material.paper),
    carbonFiber: factory(material.carbonFiber),
    ice: factory(material.ice),
    soap: factory(material.soap),
    ivory: factory(material.ivory),
    motherOfPearl: factory(material.motherOfPearl),
    snow: factory(material.snow),
});

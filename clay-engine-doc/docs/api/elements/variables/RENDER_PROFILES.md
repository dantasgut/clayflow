[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / RENDER\_PROFILES

# Variable: RENDER\_PROFILES

> `const` **RENDER\_PROFILES**: `Readonly`\<`Record`\<[`RenderProfile`](../type-aliases/RenderProfile.md), `ProfileValues`\>\>

Defined in: [src/elements/render/Renderer.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L61)

Os perfis (medidos no tanque, `baseline.md`, "Os botões de qualidade" e "Os perfis do renderizador no tanque"): o alto
é o padrão de antes da 039 (a mesma imagem); o médio corta o teto de interfaces e os fótons; o baixo, mais fótons. As
cáusticas ficam ligadas em todos. A luz global segue as qualidades dela (spec 033 R9: alto, médio e baixo); a névoa,
a sombra e a penumbra têm no alto os valores de antes da T079 (a mesma imagem) e, no médio e no baixo, grades menores
— o espaçamento das sondas do mundo fica com a cena (ele é limitado pela parede mais fina: maior, a luz vaza).

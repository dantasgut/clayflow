// Texturas virtuais dos materiais (spec 034, T060c): a disposição comum ao nó e aos kernels das páginas — os tamanhos
// da página (120² de conteúdo e 4 de borda: 128² no atlas), o preâmbulo e o cabeçalho de cada imagem no buffer `words`
// (ver `VirtualTextures.ts`) e os bits da entrada da tabela. Disposição: `material/virtual/layout.ts`; referência:
// `material/virtual/reference/virtualTexture.ts`.

const VT_PAYLOAD: u32 = 120u;
const VT_BORDER: u32 = 4u;
const VT_STRIDE: u32 = 128u;
const VT_MAX_LEVELS: u32 = 16u;
const VT_PREAMBLE: u32 = 4u;
const VT_HEADER: u32 = 32u;
const VT_PHYS_MASK: u32 = 0xFFFFu;
const VT_RESIDENT: u32 = 0x10000u;
const VT_PENDING: u32 = 0x20000u;
const VT_AGE_SHIFT: u32 = 24u;
/** Palavra do cabeçalho da imagem com a marca de preparada (a pirâmide inteira com a fonte). */
const VT_READY_WORD: u32 = 24u;

/**
 * Cabeçalho de uma imagem: tamanho, níveis, primeira página global, endereçamento e codificação (bit 0 prender, bit 1
 * linear), média, a página mais grossa.
 */
struct VtImage {
    size: vec2u,
    levels: u32,
    first: u32,
    wrap: u32,
    average: u32,
    coarsest: u32,
}

/** Lado do nível `l` (o anterior dividido por dois, no mínimo 1). */
fn vt_level_size(img: VtImage, l: u32) -> vec2u {
    return max(vec2u(1u), img.size >> vec2u(l));
}

/** Páginas por eixo do nível `l`. */
fn vt_level_pages(img: VtImage, l: u32) -> vec2u {
    return (vt_level_size(img, l) + vec2u(VT_PAYLOAD - 1u)) / VT_PAYLOAD;
}

/** O uv em [0, 1] pelo endereçamento (bit 0 da palavra: prender; senão, repetir). */
fn vt_wrap(uv: vec2f, wrap: u32) -> vec2f {
    return select(uv - floor(uv), clamp(uv, vec2f(0.0), vec2f(1.0)), (wrap & 1u) != 0u);
}

/** A página (px, py) do nível `l` que contém o uv (já no intervalo) e a posição contínua no nível, em texels. */
fn vt_page_at(img: VtImage, l: u32, q: vec2f) -> vec4f {
    let size = vec2f(vt_level_size(img, l));
    let x = q * size;
    let pages = vt_level_pages(img, l);
    let p = min(vec2u(x / f32(VT_PAYLOAD)), pages - vec2u(1u));
    return vec4f(vec2f(p), x);
}

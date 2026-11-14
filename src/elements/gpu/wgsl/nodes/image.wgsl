// Nó da imagem virtual (spec 034, T060c): a cor de uma `VirtualImage` da cena no uv, pelas páginas residentes no atlas.
// O nível contínuo pelas derivadas do uv (a maior pegada do pixel em texels do nível 0); em cada um dos dois níveis em
// volta, a página residente mais fina a partir dele (a tabela), lida pelo bilinear dentro da página — em luz linear
// (cada texel sRGB decodificado antes da mistura), ou pelo hardware na imagem linear; a borda de 4 texels cobre o vizinho —, e a mistura linear entre os dois; sem página residente, a média da
// imagem. As páginas dos dois níveis são marcadas na série dos pedidos (o `VirtualTextureFlow` do quadro seguinte a carrega).
// Laços com teto constante (os níveis). Referência: `material/virtual/reference/virtualTexture.ts` (`vtSample`).
// Requer: vt_common, color e os recursos `vt_words`, `vt_requests`, `vt_atlas`, `vt_sampler`.

/** Saída do nó: a cor em luz linear e a opacidade. */
struct NodeImageVirtual {
    color: vec3f,
    alpha: f32,
}

fn node_image_header(i: u32) -> VtImage {
    let h = VT_PREAMBLE + i * VT_HEADER;
    return VtImage(
        vec2u(vt_words[h], vt_words[h + 1u]),
        vt_words[h + 2u],
        vt_words[h + 3u],
        vt_words[h + 4u],
        vt_words[h + 5u],
        vt_words[h + 7u],
    );
}

/** A página global do nível `l` na página (px, py). */
fn node_image_page(i: u32, img: VtImage, l: u32, p: vec2u) -> u32 {
    let base = vt_words[VT_PREAMBLE + i * VT_HEADER + 8u + l];
    return img.first + base + p.y * vt_level_pages(img, l).x + p.x;
}

/** A cor do nível residente mais fino a partir de `l` (a média da imagem sem nenhum). */
fn node_image_level(i: u32, img: VtImage, l: u32, q: vec2f) -> vec4f {
    let table = vt_words[1];
    let side = textureDimensions(vt_atlas).x / VT_STRIDE;
    for (var k = l; k < VT_MAX_LEVELS; k++) {
        if (k >= img.levels) { break; }
        let at = vt_page_at(img, k, q);
        let p = vec2u(at.xy);
        let entry = vt_words[table + node_image_page(i, img, k, p)];
        if ((entry & VT_RESIDENT) == 0u) { continue; }
        let phys = entry & VT_PHYS_MASK;
        let origin = vec2f(f32((phys % side) * VT_STRIDE + VT_BORDER), f32((phys / side) * VT_STRIDE + VT_BORDER));
        let local = at.zw - at.xy * f32(VT_PAYLOAD);
        let texel = origin + local;
        if ((img.wrap & 2u) != 0u) {
            // Linear: a filtragem do hardware.
            return textureSampleLevel(vt_atlas, vt_sampler, texel / f32(side * VT_STRIDE), 0.0);
        }
        // sRGB: o bilinear em luz linear (cada texel decodificado antes da mistura).
        let x = texel - vec2f(0.5);
        let i0 = vec2i(floor(x));
        let f = x - floor(x);
        let a = node_image_texel(i0);
        let b = node_image_texel(i0 + vec2i(1, 0));
        let c = node_image_texel(i0 + vec2i(0, 1));
        let d = node_image_texel(i0 + vec2i(1, 1));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    let avg = unpack4x8unorm(img.average);
    return select(vec4f(srgb_decode(avg.rgb), avg.a), avg, (img.wrap & 2u) != 0u);
}

/** O texel do atlas em `i` decodificado de sRGB para luz linear (o alfa linear). */
fn node_image_texel(i: vec2i) -> vec4f {
    let t = textureLoad(vt_atlas, i, 0);
    return vec4f(srgb_decode(t.rgb), t.a);
}

/** O pedido da página do nível `l` no uv (a primeira marca do quadro escreve). */
fn node_image_request(i: u32, img: VtImage, l: u32, q: vec2f) {
    let want = node_image_page(i, img, l, vec2u(vt_page_at(img, l, q).xy));
    if (atomicLoad(&vt_requests[want]) == 0u) { atomicStore(&vt_requests[want], 1u); }
}

fn node_image_virtual(uv: vec2f, duvdx: vec2f, duvdy: vec2f, image: u32) -> NodeImageVirtual {
    if (image >= vt_words[0]) { return NodeImageVirtual(vec3f(0.0), 1.0); }
    let img = node_image_header(image);
    let size = vec2f(img.size);
    let rho = max(length(duvdx * size), length(duvdy * size));
    let lod = clamp(log2(max(rho, 1e-8)), 0.0, f32(img.levels - 1u));
    let l0 = u32(floor(lod));
    let t = lod - floor(lod);
    let q = vt_wrap(uv, img.wrap);
    node_image_request(image, img, l0, q);
    var c = node_image_level(image, img, l0, q);
    if (t > 0.0 && l0 + 1u < img.levels) {
        node_image_request(image, img, l0 + 1u, q);
        c = mix(c, node_image_level(image, img, l0 + 1u, q), t);
    }
    return NodeImageVirtual(c.rgb, c.a);
}

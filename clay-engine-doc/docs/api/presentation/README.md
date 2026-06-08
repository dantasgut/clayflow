[**webgpu-engine**](../README.md)

***

[webgpu-engine](../modules.md) / presentation

# presentation

Camada 4 — Presentation API pública.

Esta é a "fronteira" recomendada para apps que consomem a engine. O default
é importar tudo aqui (`Application`, `Camera`, `BoxGeometry`, controllers,
effects, etc.) e usar `Application.create({ canvas })` como bootstrap.

Para implementar Resources/Flows customizados, importe diretamente de
`webgpu-engine` (que re-exporta este barrel + `core/`+`scene/` types).

## Classes

- [Application](classes/Application.md)
- [Assets](classes/Assets.md)
- [AudioLoader](classes/AudioLoader.md)
- [Bloom](classes/Bloom.md)
- [Blur](classes/Blur.md)
- [ChromaticAberration](classes/ChromaticAberration.md)
- [ColorGrading](classes/ColorGrading.md)
- [DebugFlow](classes/DebugFlow.md)
- [FlyController](classes/FlyController.md)
- [FontLoader](classes/FontLoader.md)
- [ForwardFlow](classes/ForwardFlow.md)
- [FpsController](classes/FpsController.md)
- [Fxaa](classes/Fxaa.md)
- [GameLoop](classes/GameLoop.md)
- [GamepadDevice](classes/GamepadDevice.md)
- [GltfLoader](classes/GltfLoader.md)
- [HeightmapLoader](classes/HeightmapLoader.md)
- [Input](classes/Input.md)
- [InputDrivenController](classes/InputDrivenController.md)
- [InteractionSystem](classes/InteractionSystem.md)
- [KeyboardDevice](classes/KeyboardDevice.md)
- [OrbitController](classes/OrbitController.md)
- [PointerDevice](classes/PointerDevice.md)
- [PostFlow](classes/PostFlow.md)
- [PostProcessEffect](classes/PostProcessEffect.md)
- [ShadowFlow](classes/ShadowFlow.md)
- [Ssao](classes/Ssao.md)
- [TextureLoader](classes/TextureLoader.md)
- [Time](classes/Time.md)
- [ToneMapping](classes/ToneMapping.md)
- [TouchDevice](classes/TouchDevice.md)
- [UiButton](classes/UiButton.md)
- [UiElement](classes/UiElement.md)
- [UIFlow](classes/UIFlow.md)
- [UiHBox](classes/UiHBox.md)
- [UiInteractionHandler](classes/UiInteractionHandler.md)
- [UiPanel](classes/UiPanel.md)
- [UiSlider](classes/UiSlider.md)
- [UiStack](classes/UiStack.md)
- [UiText](classes/UiText.md)
- [UiTree](classes/UiTree.md)
- [UiVBox](classes/UiVBox.md)
- [Vignette](classes/Vignette.md)

## Interfaces

- [ApplicationOptions](interfaces/ApplicationOptions.md)
- [ControllerContext](interfaces/ControllerContext.md)
- [EnginePlugin](interfaces/EnginePlugin.md)
- [GltfAnimation](interfaces/GltfAnimation.md)
- [GltfAnimationChannel](interfaces/GltfAnimationChannel.md)
- [GltfAnimationSampler](interfaces/GltfAnimationSampler.md)
- [GltfDocument](interfaces/GltfDocument.md)
- [GltfMaterial](interfaces/GltfMaterial.md)
- [GltfMesh](interfaces/GltfMesh.md)
- [GltfNode](interfaces/GltfNode.md)
- [GltfPrimitive](interfaces/GltfPrimitive.md)
- [GltfSkin](interfaces/GltfSkin.md)
- [Heightmap](interfaces/Heightmap.md)
- [InputState](interfaces/InputState.md)
- [InteractionPluginOptions](interfaces/InteractionPluginOptions.md)
- [InteractionSystemOptions](interfaces/InteractionSystemOptions.md)
- [LoadedAudio](interfaces/LoadedAudio.md)
- [LoadedFont](interfaces/LoadedFont.md)
- [LoadedTexture](interfaces/LoadedTexture.md)
- [OrbitControllerOptions](interfaces/OrbitControllerOptions.md)
- [PhysicsPluginOptions](interfaces/PhysicsPluginOptions.md)
- [PostProcessOptions](interfaces/PostProcessOptions.md)
- [PresentationDefaults](interfaces/PresentationDefaults.md)
- [PresentationDefaultsOptions](interfaces/PresentationDefaultsOptions.md)
- [UiBounds](interfaces/UiBounds.md)

## Type Aliases

- [GltfAnimationPath](type-aliases/GltfAnimationPath.md)
- [GltfInterpolation](type-aliases/GltfInterpolation.md)

## Functions

- [interactionPlugin](functions/interactionPlugin.md)
- [physicsPlugin](functions/physicsPlugin.md)
- [registerPresentationDefaults](functions/registerPresentationDefaults.md)

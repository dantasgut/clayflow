[**clayflow**](../README.md)

***

[clayflow](../modules.md) / presentation

# presentation

Camada 4 — Presentation API pública.

O que não depende do ambiente (spec 038): o `Engine`, os controllers, os efeitos, a UI. O `Application` sobre um
canvas e o que é do navegador (entrada do DOM, carregadores) estão no `clayflow/web`; o do Deno, no `clayflow/deno`.

Para implementar Resources/Flows customizados, importe diretamente de
`webgpu-engine` (que re-exporta este barrel + `core/`+`scene/` types).

## Classes

- [Bloom](classes/Bloom.md)
- [Blur](classes/Blur.md)
- [ChromaticAberration](classes/ChromaticAberration.md)
- [ColorGrading](classes/ColorGrading.md)
- [DebugFlow](classes/DebugFlow.md)
- [Engine](classes/Engine.md)
- [FlyController](classes/FlyController.md)
- [ForwardFlow](classes/ForwardFlow.md)
- [GameLoop](classes/GameLoop.md)
- [Input](classes/Input.md)
- [InputDrivenController](classes/InputDrivenController.md)
- [InteractionSystem](classes/InteractionSystem.md)
- [OrbitController](classes/OrbitController.md)
- [ParticleFlow](classes/ParticleFlow.md)
- [PostFlow](classes/PostFlow.md)
- [PostProcessEffect](classes/PostProcessEffect.md)
- [SceneRenderer](classes/SceneRenderer.md)
- [ShadowFlow](classes/ShadowFlow.md)
- [Time](classes/Time.md)
- [ToneMapping](classes/ToneMapping.md)
- [UiButton](classes/UiButton.md)
- [UiElement](classes/UiElement.md)
- [UIFlow](classes/UIFlow.md)
- [UiHBox](classes/UiHBox.md)
- [UiPanel](classes/UiPanel.md)
- [UiSlider](classes/UiSlider.md)
- [UiStack](classes/UiStack.md)
- [UiText](classes/UiText.md)
- [UiTree](classes/UiTree.md)
- [UiVBox](classes/UiVBox.md)
- [Vignette](classes/Vignette.md)

## Interfaces

- [ColorGradingOptions](interfaces/ColorGradingOptions.md)
- [DebugFlowOptions](interfaces/DebugFlowOptions.md)
- [EngineCommonOptions](interfaces/EngineCommonOptions.md)
- [EngineOptions](interfaces/EngineOptions.md)
- [EnginePlugin](interfaces/EnginePlugin.md)
- [FlyControllerKeymap](interfaces/FlyControllerKeymap.md)
- [FlyControllerOptions](interfaces/FlyControllerOptions.md)
- [FontGlyph](interfaces/FontGlyph.md)
- [ForwardFlowOptions](interfaces/ForwardFlowOptions.md)
- [ForwardSlots](interfaces/ForwardSlots.md)
- [FrameScheduler](interfaces/FrameScheduler.md)
- [GamepadState](interfaces/GamepadState.md)
- [InputDevice](interfaces/InputDevice.md)
- [InputState](interfaces/InputState.md)
- [KeyEvent](interfaces/KeyEvent.md)
- [LoadedFont](interfaces/LoadedFont.md)
- [OrbitControllerOptions](interfaces/OrbitControllerOptions.md)
- [ParticleSlots](interfaces/ParticleSlots.md)
- [PointerInputEvent](interfaces/PointerInputEvent.md)
- [PostProcessData](interfaces/PostProcessData.md)
- [PostProcessOptions](interfaces/PostProcessOptions.md)
- [PostSlots](interfaces/PostSlots.md)
- [PreparedEngine](interfaces/PreparedEngine.md)
- [PresentationDefaults](interfaces/PresentationDefaults.md)
- [PresentationDefaultsOptions](interfaces/PresentationDefaultsOptions.md)
- [ShadowFlowOptions](interfaces/ShadowFlowOptions.md)
- [ShadowSlots](interfaces/ShadowSlots.md)
- [ToneMappingData](interfaces/ToneMappingData.md)
- [ToneMappingOptions](interfaces/ToneMappingOptions.md)
- [UiBounds](interfaces/UiBounds.md)
- [UISlots](interfaces/UISlots.md)
- [WheelInputEvent](interfaces/WheelInputEvent.md)

## Type Aliases

- [DebugSlots](type-aliases/DebugSlots.md)
- [ForwardOutput](type-aliases/ForwardOutput.md)
- [GamepadSource](type-aliases/GamepadSource.md)
- [InputDevicesFactory](type-aliases/InputDevicesFactory.md)
- [PresentationOutput](type-aliases/PresentationOutput.md)
- [ToneOperator](type-aliases/ToneOperator.md)

## Variables

- [effectsBase](variables/effectsBase.md)

## Functions

- [registerPresentationDefaults](functions/registerPresentationDefaults.md)
- [releasePresentationDefaults](functions/releasePresentationDefaults.md)

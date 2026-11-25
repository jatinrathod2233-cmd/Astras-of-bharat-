# Technical Director Rendering & Asset Pipeline Refactor — Astras of Bharat (UE 5.4+)

This specification documents the refactored C++, Shader/Material, Lighting, Environment, and Android Build settings inside `ue5_astras_of_bharata/` matching the **painterly photorealism** visual target of your reference screenshot.

---

## 1. Platform Rendering Split (PC/Console vs. Android Mobile)

| Pipeline Stage | PC / Console (`Config/DefaultEngine.ini`) | Android Mobile (`Config/Android/AndroidEngine.ini`) |
| :--- | :--- | :--- |
| **Geometry** | **Nanite** (`r.Nanite=1`, `r.Nanite.ProjectEnabled=True`) | Disabled (`r.Nanite=0`); Traditional LOD0–LOD3 + **Octahedral HLOD Imposters** (`r.HLOD=1`, `r.StaticMeshLODDistanceScale=1.35`) |
| **Shading & GI** | **Lumen GI & Reflections** (`r.DynamicGlobalIlluminationMethod=1`, `r.ReflectionMethod=1`) | **Mobile Forward Renderer** (`r.Mobile.ShadingPath=0`), **Baked Static Lightmaps** (`r.AllowStaticLighting=True`) + Sky/Reflection Captures |
| **Shadows** | **Virtual Shadow Maps** (`r.Shadow.Virtual.Enable=1`) | **Stationary Sun + Cascaded Shadow Maps** (`r.Shadow.CSM.MaxMobileCascades=2` Mid / `1` Low / `3` High, `DynamicShadowDistanceStationaryLight=9500`) |
| **Water** | **Single-Layer Water** + Lumen Reflections (`r.Water.SingleLayer=1`, `r.Water.SingleLayer.Reflection=1`) | **Single-Layer Water Mobile** (`r.Water.SingleLayer=1`, `r.Water.SingleLayer.Shaders=1`, planar/sky-capture specular) |
| **Color & Post** | Painterly ACES Filmic Grading (`ColorSaturation=1.16`, Warm Gold Highlights, Deep Blue Shadows), Volumetric Fog (`r.VolumetricFog=1`), **Sharpen `0.38`** | Mobile HDR, Exponential Height Fog (`r.VolumetricFog=0`), ACES Filmic Grading, **Sharpen `0.38`** (`0.35` on Low) |

Enforced in C++ at runtime via `AAstrasRenderingDirector::ApplyPlatformPipelineCVars()` and `AAstrasRenderingDirector::ConfigurePainterlyPostProcess()` (`Source/AstrasOfBharata/Private/AstrasRenderingDirector.cpp`).

---

## 2. Painterly PBR Material Overrides (`UAstrasMaterialPipelineLibrary`)

Implemented via `UMaterialInstanceDynamic` in `AstrasRenderingDirector.h/.cpp` (no gritty desaturated dirt or crushed blacks):

1. **Modular Sandstone Temples (`ApplyPainterlySandstonePbr`)**:
   - `BaseColorTint = (0.92, 0.75, 0.48)` (sunlit warm ochre-cream sandstone)
   - `Metallic = 0.04`, `Roughness = 0.68`, `AmbientOcclusionStrength = 0.72`, `GoldInlayMask = 0.25`
2. **Gilded Temple Domes & Colossal Bowman Statue (`ApplyGildedDomeGoldPbr`)**:
   - `BaseColorTint = (1.00, 0.76, 0.24)`, `Metallic = 0.94`, `Roughness = 0.19`, `ClearCoat = 0.28`, `EmissiveGlow = 0.10`
3. **Single-Layer Water (`ApplySingleLayerWaterOverrides`)**:
   - `ScatteringCoefficients = (0.03, 0.28, 0.46)` (deep Sarayu cobalt-teal), `AbsorptionCoefficients = (0.42, 0.12, 0.05)`, `FoamCrestColor = (0.86, 0.96, 1.0)`, `Roughness = 0.05` (`0.09` Android)
4. **Stylized Sky Dome (`ApplyStylizedSkyDomeOverrides`)**:
   - `ZenithDeepBlue = (0.06, 0.22, 0.62)`, `HorizonWarmGold = (0.98, 0.82, 0.46)`, `CloudContrast = 1.22`

---

## 3. Asset Polygon & Imposter Budgets (`EAssetBudgetCategory`)

Enforced via `UAstrasMaterialPipelineLibrary::GetAssetDensityBudget` & `EnforceMeshPlatformBudget`:

| Asset Class | PC / Console Budget | Android Mobile Budget & Culling |
| :--- | :--- | :--- |
| **Hero Characters** (`LordRam`, `WarriorHanuman`, `Lakshman`, `Bharat`) | `65,000 – 85,000` tris (`LOD0`), `ChaosCloth` cape | `<= 28,000` tris (`LOD0`), `14k` (`LOD1`), `6k` (`LOD2`); never distance-culled |
| **Giant Demon Warriors** | `45,000 – 60,000` tris (`LOD0`) | `<= 18,000` tris (`LOD0`); culled beyond `240 m` |
| **Modular Sandstone Temples & Gilded Domes** | **Nanite** (`<= 250k` source ok) | `<= 12,000` tris (`LOD0`), `Static` mobility (baked lightmaps), swaps to **HLOD Imposter** beyond `320 m` |
| **Background Cliffs, Floating Island Bases & Props** | **Nanite** (`<= 180k` source ok) | `<= 4,000` tris (`LOD0`), `Static` baked lighting, **Dynamic Shadow OFF**, **Imposter/Culled** beyond `180 m` |

---

## 4. Niagara VFX & Environment Integration
- **Niagara Waterfalls (`AAstrasFloatingIslandActor::WaterfallCurtainVfx` & `AAstrasWorldLandmarkActor::AmbientEffectVfx`)**: Ribbon/sprite sheets scaled dynamically via `fx.Niagara.Scalability.TotalConcurrentEffectsScale` (`0.45` Low / `0.75` Mid / `1.0` High).
- **Divine Astras (`AAstrasProjectileActor`)**: Particle trails & AoE detonation Niagara slots mapped per `EProjectileArchetype` (`Agneyastra` crimson-gold flame, `Varunastra` aqua crest, `Vayavyastra` emerald vortex, `Nagastra` serpent glow, `Brahmastra` blinding lotus beam).

---

## 5. Android Build Settings Checklist (`DefaultEngine.ini` + `AndroidEngine.ini`)
- **Package ID**: `com.bharata.astras` (`MinSDK = 24`, `TargetSDK = 35`)
- **Orientation**: `Orientation = Landscape`, `bSupportsPortraitOrientation = False`
- **Architecture & Graphics API**: `bBuildForArm64 = True`, `bSupportsVulkan = True`, `bSupportsOpenGLES3 = True`
- **Texture Format**: `bMultiTargetFormat_ASTC = True` (`ASTC` only to minimize APK size and Android GPU memory)
- **Lightmass Baking Before Android Cook**: Run **Build -> Build Lighting Only** in Unreal Editor on all maps so Static/Stationary temple & terrain lightmaps bake cleanly before packaging `Android (ASTC)`.

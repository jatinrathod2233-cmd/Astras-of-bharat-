# Astras of Bharat — Unreal Engine 5.4+ C++ Migration Project (`ue5_astras_of_bharata/`)

> **Important Honesty & Environment Notice**:  
> This UE5 C++ project was generated alongside—without modifying or overwriting—your original runnable Three.js/WebGL2 + Android WebView project (`src/`, `android/`, `server.ts`).  
> Inside the cloud Node.js workspace, **Unreal Engine 5, Clang++, Android NDK, and Android SDK are not installed**, so this UE5 project **has not been compiled or packaged into an APK here**. You must open and build it on a local workstation using the tools listed below.

---

## 1. Visual Target Alignment (Reference Screenshot)
This migration project targets the exact cinematic look of your reference art:
- **Hero**: `AAstrasPlayerCharacter` (gold embossed armor sockets, flowing crimson silk cape with `ChaosCloth`, blazing golden sword + `Sharnga` bow, over-shoulder chase camera).
- **World Landmarks**: `AAstrasFloatingIslandActor` (levitating sandstone temple islands with descending waterfalls & mist) and `AAstrasWorldLandmarkActor` (Colossal Golden Bowman Monument, 7-story tiered Indian Shikhara Citadel, Sun-crest banners, stone braziers, cascading waterfalls).
- **Giant Demons**: `AAstrasEnemyCharacter` scaled `1.32x–1.65x+` with spiked *Gada* mace socket, status effects (fire burn, hydro extinguish, cyclone lift, serpent bind), and 2-second GPU ash dissolve material parameters.
- **Lighting & Post-Processing**:
  - **Desktop**: SM6 / Vulkan / DirectX 12 with `r.Nanite=1`, `r.DynamicGlobalIlluminationMethod=1` (Lumen), `r.VolumetricFog=1`, Virtual Shadow Maps, `r.Tonemapper.Sharpen=0.38`.
  - **Android (`Config/Android/AndroidEngine.ini` + `DefaultDeviceProfiles.ini`)**: Honest mobile rendering! Desktop Nanite & Lumen are overridden to mobile-safe PBR (`r.Nanite=0`, `r.DynamicGlobalIlluminationMethod=0`, Mobile Forward Shading + IBL + Cascaded Shadows) across `Android_Low`, `Android_Mid`, and `Android_High`, locked to **landscape-only** (`com.bharata.astras`, `minSdk 24`, `targetSdk 35`) with smoothed `r.Tonemapper.Sharpen=0.38` to eliminate harsh edge artifacts and prevent overheating.

---

## 2. Preserved System Migration Matrix

| Original Web/TS System | Upgraded UE5 C++ Equivalent | Preserved Mechanics |
| :--- | :--- | :--- |
| `src/types/world.ts` & `worldData.ts` | `Source/AstrasOfBharata/Public/AstrasTypes.h` | Ayodhya `(0,0)` to 2.5 km Volcanic Demon Village `(2500m, 0)`, Sarayu river bounds, 5 Astras, 5 Demon variants |
| `src/shared/projectilePhysics.ts` | `AstrasProjectilePhysics.h/.cpp` | Identical deterministic kinematics (Ballistic Arrow, 3-phase Chakra, Fire/Water/Wind/Serpent/Brahmastra) + Niagara AoE |
| Two-Player Mount Seating | `AstrasMountVehicle.h/.cpp` | Exactly 2 seats (`Driver = 0`, `Passenger = 1`) for Chariot/Horse/Elephant, seat-switching, epoch/seq anti-teleport interpolation |
| `src/engine/LanMultiplayerClient.ts` | `AstrasLanSubsystem.h/.cpp` | Connects over WebSockets to existing `server.ts` / LAN room protocol (`HELLO`, `WELCOME`, `PLAYER_STATE` 20 Hz, `VEHICLE_ACTION`) |
| `src/engine/AstraQuestSystem.ts` | `AstrasQuestSubsystem.h/.cpp` | All 4 main quests + 5 Divyastra unlock tracking |
| `src/engine/QualityManager.ts` | `AstrasQualitySubsystem.h/.cpp` | Auto Low/Mid/High frame-rate governor (`r.ScreenPercentage`, cascades, Niagara cap, `r.Tonemapper.Sharpen`) |

---

## 3. Required External Tools (Local Workstation)
To open, add 3D skeletal/architectural assets, compile C++, and package an Android APK:
1. **Unreal Engine 5.4 or 5.5** (installed via Epic Games Launcher with **Android Target Support** and **C++ Source/Symbols** checked).
2. **IDE & C++ Toolchain**:
   - Windows: **Visual Studio 2022** (*Game development with C++*, MSVC v143, Windows 11 SDK).
   - Linux/macOS: **Clang 16+ / Xcode 15+**.
3. **Android Build Stack (Required for APK/AAB)**:
   - **Android Studio Ladybug / Koala**
   - **Android SDK Platform 35** & Build-Tools `35.0.0`
   - **Android NDK `r25b` or `r26d`** (configured via UE5 `Turnkey` / Project Settings -> Android SDK)
   - **Java JDK 17**
4. **3D Art & Rigging Pipeline (Assets Not Bundled)**:
   - This C++ project provides gameplay, shaders config, camera, physics, LAN, and actor classes; you must import your high-poly **Indian temple/palace modular meshes, skeletal hero/demon FBXs + Mixamo/custom animations, PBR Sandstone/Gold/Rock textures, and Niagara VFX emitters** into `Content/` (recommended sources: **Fab / Quixel Megascans**, **Blender 4.x**, UE5 **Water** plugin).

---

## 4. Exact Build & Packaging Steps (Workstation)
1. **Generate IDE Project Files**:
   - Right-click `ue5_astras_of_bharata/AstrasOfBharata.uproject` → **Generate Visual Studio project files** (or run `UnrealBuildTool` `-projectfiles`).
2. **Compile C++ Module**:
   - Open `AstrasOfBharata.sln` in Visual Studio 2022 (`Development Editor | Win64`) and build, then open `AstrasOfBharata.uproject` in Unreal Editor.
3. **Populate World & Art Assets in `Content/`**:
   - Create UMG HUD Widget matching the landscape screenshot layout (top-left portrait/Lv.10/HP/Prana/Quest, top-center compass, top-right minimap, bottom-left touch joystick, bottom-right Jump/Attack/Skill 1–3) and link Character/Demon skeletal meshes + Niagara systems (`WaterfallCurtainVfx`, `SwordFlameVfx`, Astra impact systems) on Blueprint subclasses of `AAstrasPlayerCharacter`, `AAstrasEnemyCharacter`, `AAstrasMountVehicle`, and `AAstrasFloatingIslandActor`.
4. **Configure Android Signing & Package APK**:
   - In Unreal Editor: **Project Settings -> Platforms -> Android** -> verify Package Name `com.bharata.astras`, Min SDK `24`, Target SDK `35`, Orientation `Landscape`.
   - Run **Platforms -> Android -> Package Project (Android ASTC)** or via CLI:
     ```bash
     RunUAT BuildCookRun -project="/path/to/ue5_astras_of_bharata/AstrasOfBharata.uproject" -noP4 -platform=Android -clientconfig=Shipping -cook -allmaps -build -stage -pak -archive -archivedirectory="/path/to/Builds/Android"
     ```

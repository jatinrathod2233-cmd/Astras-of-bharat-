# Photorealistic Deity Assets, Dynamic Swap & 'Dev' Menu Blueprint Guide

This document covers the C++ and Unreal Engine 5 Blueprint architecture added to `ue5_astras_of_bharata/` for **Lord Ram**, **Warrior Hanuman**, **Lakshman**, and **Bharat**.

---

## 1. Real-Time Character Swapping & 'Dev' Menu C++ Modules
- **`AstrasTypes.h`**: Defines `EHeroDeityId` (`LordRam`, `WarriorHanuman`, `Lakshman`, `Bharat`) and `FHeroDeityProfile` (photorealistic skeletal mesh, AnimBP, Blueprint subclass, primary/secondary weapons, Niagara aura VFX, portrait texture, base stats, and signature abilities).
- **`HeroDeityDataAsset` (`UHeroDeityDataAsset`)**: Data Asset (`DA_HeroDeities`) storing designer-tunable meshes, Blueprint classes, and stats for all 4 deities (plus C++ defaults if assets are unassigned).
- **`AstrasDevCharacterSwapSubsystem` (`UAstrasDevCharacterSwapSubsystem`)**:
  - `SwapActiveDeity(PC, NewDeityId)` / `CycleNextDeity(PC)`
  - **Dual Swap Modes**:
    1. **Blueprint Actor Possession** (when `BlueprintCharacterClass` like `BP_Hero_WarriorHanuman` is assigned): Spawns the target Blueprint character at the exact transform/control rotation, copies HP %, Astra Energy %, stealth state, AND preserves 2-seat Chariot/Horse/Elephant ownership (`SyncRuntimeStateFrom`).
    2. **Zero-Hitch In-Place Swap** (default when swapping on mobile or sharing the base pawn): Swaps skeletal mesh, AnimBP, right/left weapon meshes, Niagara aura, scale, and combat abilities in-place.
- **`AstrasDevMenuWidget` (`UAstrasDevMenuWidget`) & `AstrasPlayerController`**:
  - Toggle interactive Dev Menu anytime during gameplay via **`F8`** (or touch HUD Dev button / `ToggleDevMenu()` in Blueprint).
  - Hotkeys **`1`–`4`** immediately swap between **Lord Ram**, **Warrior Hanuman**, **Lakshman**, and **Bharat** mid-combat.
  - **`Q` / `R`** trigger each deity's distinct Primary and Ultimate combat abilities (`ExecuteHeroPrimaryAbility` / `ExecuteHeroUltimateAbility`).
  - Works immediately via built-in C++ Slate overlay OR visually customized via a Widget Blueprint subclass `WBP_DevCharacterMenu`.

---

## 2. Photorealistic 3D Character Asset Specifications (Blender / Maya -> UE5.4+)

| Deity | Anatomical & Armor Silhouette | Weapons & Cloth Simulation (`ChaosCloth`) | Distinct Combat Kit (`Q` / `R`) |
| :--- | :--- | :--- | :--- |
| **Lord Ram** | Athletic royal Kshatriya build (`1.0x`), flowing wavy hair, embossed Surya golden chestplate, shoulder pauldrons & greaves, white silk dhoti, crimson embroidered cape (`ChaosCloth`), Subsurface Skin (`Profile_HumanSkin_Surya`). | **Right (`hand_r`)**: Blazing Golden Sword (`SM_SuryaSword`) + Niagara fire blade.<br>**Left (`hand_l`)**: Sacred Sharnga Bow (`SM_SharngaBow`). | **Q — Surya-Agni Blade Wave**: Solar slash + Agneyastra fire detonation.<br>**R — Kodanda Brahmastra Rain**: Hypersonic golden lotus strike. |
| **Warrior Hanuman** | Towering muscular Vanara warrior (`1.14x`), detailed fur cards / grooming strand LODs, heavy ornate bronze-gold chest harness, Rudraksha & pearl necklaces, armored tail ring. | **Right (`hand_r`)**: Massive Spiked Celestial Vajra Gada Mace (`SM_VajraGada`).<br>**Aura**: Saffron storm embers. | **Q — Vajra-Gada Seismic Slam**: High vault + shockwave launching demons airborne.<br>**R — Ashta-Siddhi Pawan Avatar**: `1.42x` giant surge + cyclone burst. |
| **Lakshman** | Lean, agile prince (`0.99x`), silver-gold lamellar shoulder armor, emerald-trimmed sash (`ChaosCloth`), sharp focused brow & twin forearm bracers. | **Right (`hand_r`)**: Silver-gold Naga curved blade.<br>**Left (`hand_l`)**: Seshanaga War Bow. | **Q — Seshanaga Serpent Volley**: 3 fanned Nagastra arrows binding demons.<br>**R — Meghanad-Slayer Thunder Tempest**: Storm vortex + serpent strike. |
| **Bharat** | Broad-shouldered guardian (`1.02x`), royal Nandigram ascetic-warrior crown/hair knot, jade & burnished gold armor plates, deep emerald-trimmed cape (`ChaosCloth`). | **Right (`hand_r`)**: Dharma-Chakra Royal Halberd.<br>**Left (`hand_l`)**: Embossed Ayodhya Sun Shield. | **Q — Dharma-Chakra Cleave**: Wide 360° knockback cleave + 15% heal.<br>**R — Nandigram Sanctuary Aegis**: Full HP/Prana restore + wide radial push. |

### PBR Texture Packing Standard (Desktop + Android ASTC)
- **LOD Chain**: `LOD0` (65k–85k tris Desktop) -> `LOD1` (32k tris) -> `LOD2` (14k tris Mobile) -> `LOD3` (6k tris Far).
- **Texture Maps**:
  - `T_*_BaseColor` (`sRGB`, 4K Desktop / 2K Android max via DeviceProfile `MipMapLODBias`).
  - `T_*_ORM` (`Linear`, R = Ambient Occlusion, G = Roughness, B = Metallic).
  - `T_*_Normal` (`BC5 / Normalmap`, OpenGL tangent flipped properly for UE5).
  - Skin uses `Shading Model = Subsurface Profile`; Cloth uses `Two-Sided Foliage` / `Cloth` shading with fuzz/sheen; Armor uses `Metalness = 0.92`, `Roughness = 0.18–0.32`.

---

## 3. Unreal Editor Blueprint Wiring Steps
1. Create Data Asset **`DA_HeroDeities`** (`Misc -> Data Asset -> HeroDeityDataAsset`) and populate the 4 `DeityProfiles` (`LordRam`, `WarriorHanuman`, `Lakshman`, `Bharat`).
2. Create 4 Child Blueprints inheriting from `AAstrasPlayerCharacter`:
   - `BP_Hero_LordRam`, `BP_Hero_WarriorHanuman`, `BP_Hero_Lakshman`, `BP_Hero_Bharat`.
   - Assign each character's `SkeletalMesh`, `ABP_*`, weapon meshes (`FierySwordMesh`, `SharngaBowMesh`), and optionally override `ExecuteHeroPrimaryAbility` / `ExecuteHeroUltimateAbility` events to trigger custom AnimMontages & Niagara bursts before/after `Parent: Execute...`.
3. Create **`BP_AstrasGameMode`** inheriting `AAstrasGameMode`:
   - Set **Deity Registry Data Asset** = `DA_HeroDeities`.
4. (Optional Visual Upgrade) Create **`WBP_DevCharacterMenu`** inheriting `UAstrasDevMenuWidget`:
   - Add 4 portrait cards bound to `SelectLordRam()`, `SelectWarriorHanuman()`, `SelectLakshman()`, `SelectBharat()`, plus optional `TextActiveDeity`, `TextAbilities`, and `TextQualityStatus` text blocks.
   - Assign `WBP_DevCharacterMenu` to `DevMenuWidgetClass` inside `BP_AstrasPlayerController`.
5. Press **Play (PIE)**, press **`F8`** to open the **Dev Menu**, or press **`1`–`4`** to switch between **Lord Ram**, **Warrior Hanuman**, **Lakshman**, and **Bharat** instantaneously during combat or chariot riding!

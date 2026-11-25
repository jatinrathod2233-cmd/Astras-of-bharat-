#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "AstrasTypes.h"
#include "AstrasRenderingDirector.generated.h"

class UDirectionalLightComponent;
class USkyLightComponent;
class UExponentialHeightFogComponent;
class UPostProcessComponent;
class UStaticMeshComponent;
class UMaterialInstanceDynamic;

UENUM(BlueprintType)
enum class EAssetBudgetCategory : uint8
{
	HeroDeityCharacter,     // PC: 65k-85k tris | Android LOD0: <= 28k tris
	GiantDemonEnemy,        // PC: 45k-60k tris | Android LOD0: <= 18k tris
	ModularTempleAndDome,   // PC: Nanite      | Android: <= 12k tris + Imposter > 180m
	BackgroundCliffAndProp  // PC: Nanite      | Android: <= 4k tris + Imposter > 140m, no dynamic shadow
};

USTRUCT(BlueprintType)
struct FAssetDensityBudget
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	int32 MaxDesktopTriangles = 85000;

	UPROPERTY(BlueprintReadOnly)
	int32 MaxAndroidLod0Triangles = 28000;

	UPROPERTY(BlueprintReadOnly)
	float AndroidImposterCullDistanceCm = 25000.0f;

	UPROPERTY(BlueprintReadOnly)
	bool bCastDynamicShadowOnAndroid = true;
};

/**
 * Painterly Photorealism Material & Asset Budget Enforcer:
 * Provides Blueprint-callable and C++ helpers to apply saturated warm-gold / deep-blue
 * PBR material overrides, Single-Layer Water shader values, Stylized Sky Dome parameters,
 * and platform-specific Nanite vs. Mobile Imposter/LOD density budgets.
 */
UCLASS()
class ASTRASOFBHARATA_API UAstrasMaterialPipelineLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "Astras|Rendering|PBR")
	static UMaterialInstanceDynamic* ApplyPainterlySandstonePbr(UStaticMeshComponent* TargetMesh, int32 MaterialIndex = 0, float GoldTrimBlend = 0.25f);

	UFUNCTION(BlueprintCallable, Category = "Astras|Rendering|PBR")
	static UMaterialInstanceDynamic* ApplyGildedDomeGoldPbr(UStaticMeshComponent* TargetMesh, int32 MaterialIndex = 0);

	UFUNCTION(BlueprintCallable, Category = "Astras|Rendering|Water")
	static UMaterialInstanceDynamic* ApplySingleLayerWaterOverrides(UStaticMeshComponent* WaterMesh, bool bHighTier = true);

	UFUNCTION(BlueprintCallable, Category = "Astras|Rendering|Sky")
	static UMaterialInstanceDynamic* ApplyStylizedSkyDomeOverrides(UStaticMeshComponent* SkyDomeMesh, float TimeOfDay01 = 0.42f);

	UFUNCTION(BlueprintCallable, Category = "Astras|Rendering|Budgets")
	static void EnforceMeshPlatformBudget(UStaticMeshComponent* MeshComp, EAssetBudgetCategory Category);

	UFUNCTION(BlueprintPure, Category = "Astras|Rendering|Budgets")
	static FAssetDensityBudget GetAssetDensityBudget(EAssetBudgetCategory Category);
};

/**
 * Technical Director Level Rendering Controller:
 * Enforces painterly photorealism lighting (warm golden directional sun, deep blue sky fill,
 * ACES Filmic saturation boost avoiding gritty/muddy darks, 38% smoothed post-sharpening),
 * PC/Console Nanite + Lumen + VSM, and Android Mobile Forward + Baked Lighting + CSM.
 */
UCLASS(Blueprintable)
class ASTRASOFBHARATA_API AAstrasRenderingDirector : public AActor
{
	GENERATED_BODY()

public:
	AAstrasRenderingDirector();

	UFUNCTION(BlueprintCallable, Category = "Astras|Rendering")
	void ApplyPlatformPipelineCVars();

	UFUNCTION(BlueprintCallable, Category = "Astras|Rendering")
	void ConfigurePainterlyPostProcess();

	UFUNCTION(BlueprintCallable, Category = "Astras|Rendering")
	void SetSolarElevationByTimeOfDay(float TimeOfDay01);

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Lighting")
	TObjectPtr<UDirectionalLightComponent> SunKeyLight;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Lighting")
	TObjectPtr<USkyLightComponent> AzureSkyFillLight;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Atmosphere")
	TObjectPtr<UExponentialHeightFogComponent> PainterlyHorizonFog;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "PostProcess")
	TObjectPtr<UPostProcessComponent> PainterlyColorGradingVolume;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Atmosphere")
	TObjectPtr<UStaticMeshComponent> StylizedSkyDomeMesh;
};

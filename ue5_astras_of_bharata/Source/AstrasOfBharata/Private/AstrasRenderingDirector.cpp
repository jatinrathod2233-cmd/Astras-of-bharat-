#include "AstrasRenderingDirector.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "HAL/IConsoleManager.h"
#include "Materials/MaterialInstanceDynamic.h"

namespace
{
	void SetRendererCVarInt(const TCHAR* Name, int32 Value)
	{
		if (IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(Name))
		{
			Var->Set(Value, ECVF_SetByCode);
		}
	}

	void SetRendererCVarFloat(const TCHAR* Name, float Value)
	{
		if (IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(Name))
		{
			Var->Set(Value, ECVF_SetByCode);
		}
	}
}

UMaterialInstanceDynamic* UAstrasMaterialPipelineLibrary::ApplyPainterlySandstonePbr(
	UStaticMeshComponent* TargetMesh,
	int32 MaterialIndex,
	float GoldTrimBlend
)
{
	if (!TargetMesh) return nullptr;
	UMaterialInstanceDynamic* Dyn = TargetMesh->CreateAndSetMaterialInstanceDynamic(MaterialIndex);
	if (!Dyn) return nullptr;

	// Warm sunlit Ayodhya sandstone (saturated cream-ochre, zero muddy grey grit)
	Dyn->SetVectorParameterValue(TEXT("BaseColorTint"), FLinearColor(0.92f, 0.75f, 0.48f, 1.0f));
	Dyn->SetScalarParameterValue(TEXT("Metallic"), 0.04f);
	Dyn->SetScalarParameterValue(TEXT("Roughness"), 0.68f);
	Dyn->SetScalarParameterValue(TEXT("AmbientOcclusionStrength"), 0.72f);
	Dyn->SetScalarParameterValue(TEXT("GoldInlayMask"), FMath::Clamp(GoldTrimBlend, 0.0f, 1.0f));
	return Dyn;
}

UMaterialInstanceDynamic* UAstrasMaterialPipelineLibrary::ApplyGildedDomeGoldPbr(
	UStaticMeshComponent* TargetMesh,
	int32 MaterialIndex
)
{
	if (!TargetMesh) return nullptr;
	UMaterialInstanceDynamic* Dyn = TargetMesh->CreateAndSetMaterialInstanceDynamic(MaterialIndex);
	if (!Dyn) return nullptr;

	// Burnished royal temple gold catching warm sun & azure sky IBL reflections
	Dyn->SetVectorParameterValue(TEXT("BaseColorTint"), FLinearColor(1.0f, 0.76f, 0.24f, 1.0f));
	Dyn->SetScalarParameterValue(TEXT("Metallic"), 0.94f);
	Dyn->SetScalarParameterValue(TEXT("Roughness"), 0.19f);
	Dyn->SetScalarParameterValue(TEXT("ClearCoat"), 0.28f);
	Dyn->SetScalarParameterValue(TEXT("EmissiveGlow"), 0.10f);
	return Dyn;
}

UMaterialInstanceDynamic* UAstrasMaterialPipelineLibrary::ApplySingleLayerWaterOverrides(
	UStaticMeshComponent* WaterMesh,
	bool bHighTier
)
{
	if (!WaterMesh) return nullptr;
	UMaterialInstanceDynamic* Dyn = WaterMesh->CreateAndSetMaterialInstanceDynamic(0);
	if (!Dyn) return nullptr;

	// Stylized-photorealistic Sarayu teal-cobalt single-layer water shader parameters
	Dyn->SetVectorParameterValue(TEXT("ScatteringCoefficients"), FLinearColor(0.03f, 0.28f, 0.46f, 1.0f));
	Dyn->SetVectorParameterValue(TEXT("AbsorptionCoefficients"), FLinearColor(0.42f, 0.12f, 0.05f, 1.0f));
	Dyn->SetVectorParameterValue(TEXT("FoamCrestColor"), FLinearColor(0.86f, 0.96f, 1.0f, 1.0f));
	Dyn->SetScalarParameterValue(TEXT("Roughness"), bHighTier ? 0.05f : 0.09f);
	Dyn->SetScalarParameterValue(TEXT("RefractionScale"), bHighTier ? 1.0f : 0.0f);
	Dyn->SetScalarParameterValue(TEXT("WaveSpeed"), 0.85f);
	return Dyn;
}

UMaterialInstanceDynamic* UAstrasMaterialPipelineLibrary::ApplyStylizedSkyDomeOverrides(
	UStaticMeshComponent* SkyDomeMesh,
	float TimeOfDay01
)
{
	if (!SkyDomeMesh) return nullptr;
	UMaterialInstanceDynamic* Dyn = SkyDomeMesh->CreateAndSetMaterialInstanceDynamic(0);
	if (!Dyn) return nullptr;

	const bool bIsDay = (TimeOfDay01 > 0.22f && TimeOfDay01 < 0.78f);
	const FLinearColor ZenithColor = bIsDay ? FLinearColor(0.06f, 0.22f, 0.62f, 1.0f) : FLinearColor(0.02f, 0.05f, 0.16f, 1.0f);
	const FLinearColor HorizonColor = bIsDay ? FLinearColor(0.98f, 0.82f, 0.46f, 1.0f) : FLinearColor(0.14f, 0.22f, 0.45f, 1.0f);

	Dyn->SetVectorParameterValue(TEXT("ZenithDeepBlue"), ZenithColor);
	Dyn->SetVectorParameterValue(TEXT("HorizonWarmGold"), HorizonColor);
	Dyn->SetVectorParameterValue(TEXT("CloudHighlightTint"), FLinearColor(1.0f, 0.96f, 0.88f, 1.0f));
	Dyn->SetScalarParameterValue(TEXT("CloudContrast"), 1.22f);
	return Dyn;
}

FAssetDensityBudget UAstrasMaterialPipelineLibrary::GetAssetDensityBudget(EAssetBudgetCategory Category)
{
	FAssetDensityBudget Budget;
	switch (Category)
	{
	case EAssetBudgetCategory::HeroDeityCharacter:
		Budget.MaxDesktopTriangles = 85000;
		Budget.MaxAndroidLod0Triangles = 28000;
		Budget.AndroidImposterCullDistanceCm = 0.0f; // Never cull active hero
		Budget.bCastDynamicShadowOnAndroid = true;
		break;

	case EAssetBudgetCategory::GiantDemonEnemy:
		Budget.MaxDesktopTriangles = 60000;
		Budget.MaxAndroidLod0Triangles = 18000;
		Budget.AndroidImposterCullDistanceCm = 24000.0f;
		Budget.bCastDynamicShadowOnAndroid = true;
		break;

	case EAssetBudgetCategory::ModularTempleAndDome:
		Budget.MaxDesktopTriangles = 250000; // Nanite virtualized on PC/Console
		Budget.MaxAndroidLod0Triangles = 12000;
		Budget.AndroidImposterCullDistanceCm = 32000.0f; // Hand-off to HLOD imposter card beyond 320m
		Budget.bCastDynamicShadowOnAndroid = true;
		break;

	case EAssetBudgetCategory::BackgroundCliffAndProp:
		Budget.MaxDesktopTriangles = 180000; // Nanite on PC/Console
		Budget.MaxAndroidLod0Triangles = 4000;
		Budget.AndroidImposterCullDistanceCm = 18000.0f; // Aggressively cull/imposter beyond 180m
		Budget.bCastDynamicShadowOnAndroid = false; // Baked static lightmaps only on Android
		break;
	}
	return Budget;
}

void UAstrasMaterialPipelineLibrary::EnforceMeshPlatformBudget(
	UStaticMeshComponent* MeshComp,
	EAssetBudgetCategory Category
)
{
	if (!MeshComp) return;
	const FAssetDensityBudget Budget = GetAssetDensityBudget(Category);

#if PLATFORM_ANDROID
	MeshComp->SetCastShadow(Budget.bCastDynamicShadowOnAndroid);
	MeshComp->bCastDynamicShadow = Budget.bCastDynamicShadowOnAndroid;
	if (Category == EAssetBudgetCategory::ModularTempleAndDome || Category == EAssetBudgetCategory::BackgroundCliffAndProp)
	{
		// Enforce baked static lighting compatibility + imposter draw distance culling on mobile
		MeshComp->SetMobility(EComponentMobility::Static);
		MeshComp->SetCachedMaxDrawDistance(Budget.AndroidImposterCullDistanceCm);
	}
#else
	MeshComp->SetCastShadow(true);
	MeshComp->bCastDynamicShadow = true;
	MeshComp->SetCachedMaxDrawDistance(0.0f);
#endif
}

AAstrasRenderingDirector::AAstrasRenderingDirector()
{
	PrimaryActorTick.bCanEverTick = false;

	SunKeyLight = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("SunKeyLight"));
	RootComponent = SunKeyLight;
	SunKeyLight->SetLightColor(FLinearColor(1.0f, 0.87f, 0.64f)); // Warm sunlit gold
	SunKeyLight->SetIntensity(7.5f);
	SunKeyLight->bUsedAsAtmosphereSunLight = true;

#if PLATFORM_ANDROID
	// Mobile Forward + Baked Static Lighting + Cascaded Shadow Maps
	SunKeyLight->SetMobility(EComponentMobility::Stationary);
	SunKeyLight->DynamicShadowDistanceStationaryLight = 9500.0f;
	SunKeyLight->DynamicShadowCascades = 2;
	SunKeyLight->CascadeDistributionExponent = 3.0f;
#else
	// PC/Console Lumen + Virtual Shadow Maps
	SunKeyLight->SetMobility(EComponentMobility::Movable);
	SunKeyLight->DynamicShadowDistanceMovableLight = 25000.0f;
#endif

	AzureSkyFillLight = CreateDefaultSubobject<USkyLightComponent>(TEXT("AzureSkyFillLight"));
	AzureSkyFillLight->SetupAttachment(RootComponent);
	AzureSkyFillLight->SetLightColor(FLinearColor(0.56f, 0.76f, 1.0f)); // Deep sapphire ambient bounce
	AzureSkyFillLight->SetIntensity(1.35f);
	AzureSkyFillLight->bRealTimeCapture = false;

	PainterlyHorizonFog = CreateDefaultSubobject<UExponentialHeightFogComponent>(TEXT("PainterlyHorizonFog"));
	PainterlyHorizonFog->SetupAttachment(RootComponent);
	PainterlyHorizonFog->SetFogDensity(0.0085f);
	PainterlyHorizonFog->SetFogInscatteringColor(FLinearColor(0.32f, 0.54f, 0.88f));
	PainterlyHorizonFog->SetDirectionalInscatteringColor(FLinearColor(1.0f, 0.80f, 0.45f));

	PainterlyColorGradingVolume = CreateDefaultSubobject<UPostProcessComponent>(TEXT("PainterlyColorGradingVolume"));
	PainterlyColorGradingVolume->SetupAttachment(RootComponent);
	PainterlyColorGradingVolume->bUnbound = true;

	StylizedSkyDomeMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("StylizedSkyDomeMesh"));
	StylizedSkyDomeMesh->SetupAttachment(RootComponent);
	StylizedSkyDomeMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	StylizedSkyDomeMesh->SetCastShadow(false);
	StylizedSkyDomeMesh->SetRelativeScale3D(FVector(12000.0f));
}

void AAstrasRenderingDirector::BeginPlay()
{
	Super::BeginPlay();
	ApplyPlatformPipelineCVars();
	ConfigurePainterlyPostProcess();
	SetSolarElevationByTimeOfDay(0.42f);
}

void AAstrasRenderingDirector::ApplyPlatformPipelineCVars()
{
	SetRendererCVarInt(TEXT("r.Water.SingleLayer"), 1);
	SetRendererCVarFloat(TEXT("r.Tonemapper.Sharpen"), AstrasWorldConstants::PostSharpenDefault);

#if PLATFORM_ANDROID
	// Strict Mobile Forward Renderer + Baked Lightmaps + CSM + Imposters
	SetRendererCVarInt(TEXT("r.Nanite"), 0);
	SetRendererCVarInt(TEXT("r.DynamicGlobalIlluminationMethod"), 0);
	SetRendererCVarInt(TEXT("r.ReflectionMethod"), 0);
	SetRendererCVarInt(TEXT("r.Shadow.Virtual.Enable"), 0);
	SetRendererCVarInt(TEXT("r.Mobile.ShadingPath"), 0);
	SetRendererCVarInt(TEXT("r.VolumetricFog"), 0);
	SetRendererCVarInt(TEXT("r.HLOD"), 1);
#else
	// PC / Console High-Fidelity Nanite + Lumen + VSM
	SetRendererCVarInt(TEXT("r.Nanite"), 1);
	SetRendererCVarInt(TEXT("r.DynamicGlobalIlluminationMethod"), 1);
	SetRendererCVarInt(TEXT("r.ReflectionMethod"), 1);
	SetRendererCVarInt(TEXT("r.Shadow.Virtual.Enable"), 1);
	SetRendererCVarInt(TEXT("r.VolumetricFog"), 1);
#endif
}

void AAstrasRenderingDirector::ConfigurePainterlyPostProcess()
{
	if (!PainterlyColorGradingVolume) return;
	FPostProcessSettings& PP = PainterlyColorGradingVolume->Settings;

	// Painterly Photorealism Grading: rich saturated colors, luminous warm golds, deep cobalt shadows
	PP.bOverride_ColorSaturation = true;
	PP.ColorSaturation = FVector4(1.16f, 1.16f, 1.18f, 1.0f);

	PP.bOverride_ColorContrast = true;
	PP.ColorContrast = FVector4(1.06f, 1.06f, 1.06f, 1.0f);

	PP.bOverride_ColorGain = true;
	PP.ColorGain = FVector4(1.06f, 1.00f, 0.90f, 1.0f); // Warm sunlit gold highlights

	PP.bOverride_ColorGamma = true;
	PP.ColorGamma = FVector4(0.95f, 0.98f, 1.05f, 1.0f); // Deep sapphire shadow depth

	PP.bOverride_BloomIntensity = true;
	PP.BloomIntensity = 0.58f;

	PP.bOverride_AutoExposureBias = true;
	PP.AutoExposureBias = 0.15f;
}

void AAstrasRenderingDirector::SetSolarElevationByTimeOfDay(float TimeOfDay01)
{
	const float PitchDeg = FMath::Lerp(-18.0f, -52.0f, FMath::Sin(FMath::Clamp(TimeOfDay01, 0.0f, 1.0f) * PI));
	if (SunKeyLight)
	{
		SunKeyLight->SetWorldRotation(FRotator(PitchDeg, -38.0f, 0.0f));
	}
	UAstrasMaterialPipelineLibrary::ApplyStylizedSkyDomeOverrides(StylizedSkyDomeMesh, TimeOfDay01);
}

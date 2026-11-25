#include "AstrasWorldLandmarkActor.h"
#include "AstrasRenderingDirector.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "NiagaraComponent.h"

AAstrasWorldLandmarkActor::AAstrasWorldLandmarkActor()
{
	PrimaryActorTick.bCanEverTick = false;

	BaseStructureMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("BaseStructureMesh"));
	RootComponent = BaseStructureMesh;

	OrnamentCrownMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("OrnamentCrownMesh"));
	OrnamentCrownMesh->SetupAttachment(RootComponent);

	SingleLayerWaterPoolMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("SingleLayerWaterPoolMesh"));
	SingleLayerWaterPoolMesh->SetupAttachment(RootComponent);
	SingleLayerWaterPoolMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	SingleLayerWaterPoolMesh->SetCastShadow(false);

	AmbientEffectVfx = CreateDefaultSubobject<UNiagaraComponent>(TEXT("AmbientEffectVfx"));
	AmbientEffectVfx->SetupAttachment(RootComponent);

	BrazierFlameLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("BrazierFlameLight"));
	BrazierFlameLight->SetupAttachment(RootComponent);
	BrazierFlameLight->SetLightColor(FLinearColor(1.0f, 0.48f, 0.12f));
	BrazierFlameLight->SetIntensity(3200.0f);
	BrazierFlameLight->SetAttenuationRadius(850.0f);
	BrazierFlameLight->SetCastShadows(false); // Mobile performance: keep shadow casting to key directional sun
}

void AAstrasWorldLandmarkActor::BeginPlay()
{
	Super::BeginPlay();
	ApplyModularArchitecturePipeline(bTreatAsBackgroundProp);
}

void AAstrasWorldLandmarkActor::ApplyModularArchitecturePipeline(bool bIsBackgroundAsset)
{
	const EAssetBudgetCategory Cat = bIsBackgroundAsset
		? EAssetBudgetCategory::BackgroundCliffAndProp
		: EAssetBudgetCategory::ModularTempleAndDome;

	UAstrasMaterialPipelineLibrary::EnforceMeshPlatformBudget(BaseStructureMesh, Cat);
	UAstrasMaterialPipelineLibrary::EnforceMeshPlatformBudget(OrnamentCrownMesh, Cat);

	UAstrasMaterialPipelineLibrary::ApplyPainterlySandstonePbr(BaseStructureMesh, 0, 0.25f);
	UAstrasMaterialPipelineLibrary::ApplyGildedDomeGoldPbr(OrnamentCrownMesh, 0);

	if (LandmarkKind == EAstrasLandmarkKind::SarayuWaterfallCliff && SingleLayerWaterPoolMesh)
	{
#if PLATFORM_ANDROID
		UAstrasMaterialPipelineLibrary::ApplySingleLayerWaterOverrides(SingleLayerWaterPoolMesh, false);
#else
		UAstrasMaterialPipelineLibrary::ApplySingleLayerWaterOverrides(SingleLayerWaterPoolMesh, true);
#endif
	}
}

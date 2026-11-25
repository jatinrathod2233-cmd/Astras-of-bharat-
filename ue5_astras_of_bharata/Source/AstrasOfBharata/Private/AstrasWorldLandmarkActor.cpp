#include "AstrasWorldLandmarkActor.h"
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

	AmbientEffectVfx = CreateDefaultSubobject<UNiagaraComponent>(TEXT("AmbientEffectVfx"));
	AmbientEffectVfx->SetupAttachment(RootComponent);

	BrazierFlameLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("BrazierFlameLight"));
	BrazierFlameLight->SetupAttachment(RootComponent);
	BrazierFlameLight->SetLightColor(FLinearColor(1.0f, 0.48f, 0.12f));
	BrazierFlameLight->SetIntensity(3200.0f);
	BrazierFlameLight->SetAttenuationRadius(850.0f);
	BrazierFlameLight->SetCastShadows(false); // Mobile performance: keep shadow casting to key directional sun
}

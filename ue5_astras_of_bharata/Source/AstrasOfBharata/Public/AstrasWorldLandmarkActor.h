#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "AstrasWorldLandmarkActor.generated.h"

class UStaticMeshComponent;
class UNiagaraComponent;
class UPointLightComponent;

UENUM(BlueprintType)
enum class EAstrasLandmarkKind : uint8
{
	GoldenBowmanStatue,
	SevenStoryCitadelSpire,
	SunBannerPole,
	SacredFireBrazier,
	SarayuWaterfallCliff
};

/**
 * Modular Landmark Actor representing signature visual elements from the reference art:
 * colossal golden archer monument, tiered Indian palace spires, glowing fire braziers,
 * fluttering sun banners, and cascading mountain waterfalls.
 */
UCLASS()
class ASTRASOFBHARATA_API AAstrasWorldLandmarkActor : public AActor
{
	GENERATED_BODY()

public:
	AAstrasWorldLandmarkActor();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Landmark")
	EAstrasLandmarkKind LandmarkKind = EAstrasLandmarkKind::SevenStoryCitadelSpire;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UStaticMeshComponent> BaseStructureMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UStaticMeshComponent> OrnamentCrownMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UNiagaraComponent> AmbientEffectVfx;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UPointLightComponent> BrazierFlameLight;
};

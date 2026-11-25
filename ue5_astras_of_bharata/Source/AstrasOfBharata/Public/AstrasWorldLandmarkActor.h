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
 * modular sandstone temples, gilded golden domes, single-layer waterfall plunge pool,
 * Niagara waterfall mist/cascades, colossal archer monument, and platform-enforced poly/imposter budgets.
 */
UCLASS(Blueprintable)
class ASTRASOFBHARATA_API AAstrasWorldLandmarkActor : public AActor
{
	GENERATED_BODY()

public:
	AAstrasWorldLandmarkActor();

	UFUNCTION(BlueprintCallable, Category = "Landmark|Pipeline")
	void ApplyModularArchitecturePipeline(bool bIsBackgroundAsset);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Landmark")
	EAstrasLandmarkKind LandmarkKind = EAstrasLandmarkKind::SevenStoryCitadelSpire;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Landmark|Budget")
	bool bTreatAsBackgroundProp = false;

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UStaticMeshComponent> BaseStructureMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UStaticMeshComponent> OrnamentCrownMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UStaticMeshComponent> SingleLayerWaterPoolMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UNiagaraComponent> AmbientEffectVfx;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UPointLightComponent> BrazierFlameLight;
};

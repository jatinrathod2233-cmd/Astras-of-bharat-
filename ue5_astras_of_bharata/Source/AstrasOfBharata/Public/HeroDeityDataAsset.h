#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "AstrasTypes.h"
#include "HeroDeityDataAsset.generated.h"

/**
 * Editable UE5 Primary Data Asset holding photorealistic meshes, AnimBPs,
 * Blueprint character subclasses, weapons, and combat tuning for Lord Ram,
 * Warrior Hanuman, Lakshman, and Bharat.
 */
UCLASS(BlueprintType)
class ASTRASOFBHARATA_API UHeroDeityDataAsset : public UPrimaryDataAsset
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Deities")
	TArray<FHeroDeityProfile> DeityProfiles;

	UFUNCTION(BlueprintPure, Category = "Deities")
	bool FindProfile(EHeroDeityId DeityId, FHeroDeityProfile& OutProfile) const;

	static TArray<FHeroDeityProfile> BuildDefaultDeityProfiles();
};

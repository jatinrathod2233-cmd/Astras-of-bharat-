#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "AstrasGameMode.generated.h"

class UHeroDeityDataAsset;

/**
 * Primary GameMode for Astras of Bharat (UE5 C++ Upgraded Project):
 * - Spawns AAstrasPlayerCharacter & AAstrasPlayerController (with Dev Menu & live Deity swap)
 * - Registers DA_HeroDeities (photorealistic meshes & Blueprint subclasses for Ram, Hanuman, Lakshman, Bharat)
 * - Drives adaptive Android/Desktop quality scaling via UAstrasQualitySubsystem
 * - Broadcasts 20 Hz player & 2-seat vehicle sync packets via UAstrasLanSubsystem
 */
UCLASS(Blueprintable)
class ASTRASOFBHARATA_API AAstrasGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AAstrasGameMode();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

protected:
	/** Assign DA_HeroDeities in BP_AstrasGameMode to link photorealistic SkeletalMeshes & BP_Hero_* subclasses */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "Deities")
	TObjectPtr<UHeroDeityDataAsset> DeityRegistryDataAsset;

private:
	float LanSyncAccumSec = 0.0f;
};

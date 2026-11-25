#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "AstrasTypes.h"
#include "AstrasDevCharacterSwapSubsystem.generated.h"

class UHeroDeityDataAsset;
class UNiagaraSystem;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnDeitySwapped, EHeroDeityId, NewDeityId, const FHeroDeityProfile&, Profile);

/**
 * Dynamic Real-Time Deity Character Swapping Subsystem:
 * Allows developers and players via the interactive 'Dev' Menu (or Blueprints)
 * to seamlessly switch between Lord Ram, Warrior Hanuman, Lakshman, and Bharat
 * mid-gameplay while preserving transform, control rotation, vitals, and 2-seat vehicle mounts.
 */
UCLASS()
class ASTRASOFBHARATA_API UAstrasDevCharacterSwapSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	/** Registers an editor UHeroDeityDataAsset (DA_HeroDeities) with photorealistic skeletal meshes & BP classes */
	UFUNCTION(BlueprintCallable, Category = "Astras|DevSwap")
	void RegisterDeityDataAsset(UHeroDeityDataAsset* DataAsset);

	/** Registers or overrides a Blueprint character subclass (e.g. BP_Hero_WarriorHanuman) per deity */
	UFUNCTION(BlueprintCallable, Category = "Astras|DevSwap")
	void RegisterDeityBlueprintClass(EHeroDeityId DeityId, TSubclassOf<AAstrasPlayerCharacter> BlueprintClass);

	/** Seamlessly swaps the controlled player character in real time */
	UFUNCTION(BlueprintCallable, Category = "Astras|DevSwap")
	bool SwapActiveDeity(APlayerController* PlayerController, EHeroDeityId NewDeityId);

	UFUNCTION(BlueprintCallable, Category = "Astras|DevSwap")
	bool CycleNextDeity(APlayerController* PlayerController);

	UFUNCTION(BlueprintPure, Category = "Astras|DevSwap")
	EHeroDeityId GetActiveDeityId() const { return ActiveDeityId; }

	UFUNCTION(BlueprintPure, Category = "Astras|DevSwap")
	FHeroDeityProfile GetProfileForDeity(EHeroDeityId DeityId) const;

	UFUNCTION(BlueprintPure, Category = "Astras|DevSwap")
	TArray<FHeroDeityProfile> GetAllDeityProfiles() const { return CachedProfiles; }

	UPROPERTY(BlueprintAssignable, Category = "Astras|DevSwap")
	FOnDeitySwapped OnDeitySwapped;

private:
	EHeroDeityId ActiveDeityId = EHeroDeityId::LordRam;
	TArray<FHeroDeityProfile> CachedProfiles;
};

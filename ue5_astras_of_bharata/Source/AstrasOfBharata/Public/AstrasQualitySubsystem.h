#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "AstrasTypes.h"
#include "AstrasQualitySubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnQualityTierChanged, EAstrasQualityTier, NewTier);

/**
 * Adaptive Mobile Performance & Thermal Governor:
 * Monitors frame deltas to scale screen percentage, shadow cascades, Niagara cap,
 * and smoothed post-processing sharpness (0.35 - 0.38) across Android Low/Mid/High tiers.
 */
UCLASS()
class ASTRASOFBHARATA_API UAstrasQualitySubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	UFUNCTION(BlueprintCallable, Category = "Astras|Quality")
	void SetQualityMode(bool bAutoMode, EAstrasQualityTier ManualTier);

	UFUNCTION(BlueprintCallable, Category = "Astras|Quality")
	void TickPerformanceGovernor(float DeltaSeconds);

	UFUNCTION(BlueprintPure, Category = "Astras|Quality")
	EAstrasQualityTier GetActiveTier() const { return ActiveTier; }

	UFUNCTION(BlueprintPure, Category = "Astras|Quality")
	float GetCurrentFps() const { return SmoothedFps; }

	UPROPERTY(BlueprintAssignable, Category = "Astras|Quality")
	FOnQualityTierChanged OnQualityTierChanged;

private:
	bool bIsAutoMode = true;
	EAstrasQualityTier ActiveTier = EAstrasQualityTier::Medium;
	float SmoothedFps = 60.0f;
	float SlowFrameWindowSec = 0.0f;
	float FastFrameWindowSec = 0.0f;

	void ApplyTierConsoleVariables(EAstrasQualityTier Tier);
};

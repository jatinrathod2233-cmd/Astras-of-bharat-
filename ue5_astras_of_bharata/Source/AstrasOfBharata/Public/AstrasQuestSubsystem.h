#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "AstrasTypes.h"
#include "AstrasQuestSubsystem.generated.h"

USTRUCT(BlueprintType)
struct FAstrasMissionState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly)
	FString MissionId;

	UPROPERTY(BlueprintReadOnly)
	FString Title;

	UPROPERTY(BlueprintReadOnly)
	FString Description;

	UPROPERTY(BlueprintReadOnly)
	int32 Progress = 0;

	UPROPERTY(BlueprintReadOnly)
	int32 Target = 1;

	UPROPERTY(BlueprintReadOnly)
	FVector WaypointWorldM = FVector::ZeroVector;
};

/**
 * Preserves all 4 Ayodhya-to-Demon-Village main missions + all 5 Divyastra sacred trials
 * (Agneyastra Fire Temple, Varunastra River Shrine, Vayavyastra Wind Spire, Nagastra Serpent Gate, Brahmastra Trial).
 */
UCLASS()
class ASTRASOFBHARATA_API UAstrasQuestSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	UFUNCTION(BlueprintCallable, Category = "Astras|Quest")
	void AdvanceActiveMission(int32 Delta = 1);

	UFUNCTION(BlueprintCallable, Category = "Astras|Quest")
	void UnlockAstra(EAstraId AstraId);

	UFUNCTION(BlueprintPure, Category = "Astras|Quest")
	bool IsAstraUnlocked(EAstraId AstraId) const;

	UFUNCTION(BlueprintPure, Category = "Astras|Quest")
	FAstrasMissionState GetCurrentMission() const;

	UFUNCTION(BlueprintPure, Category = "Astras|Quest")
	int32 GetUnlockedAstraCount() const { return UnlockedAstras.Num(); }

private:
	TArray<FAstrasMissionState> MainMissions;
	int32 CurrentMissionIndex = 0;
	TSet<EAstraId> UnlockedAstras;
};

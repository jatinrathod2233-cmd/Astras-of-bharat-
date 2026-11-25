#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "AstrasFloatingIslandActor.generated.h"

class UStaticMeshComponent;
class UNiagaraComponent;

/**
 * Floating Celestial Sky Island & Waterfall Actor:
 * Matches the reference screenshot's floating rock sanctuaries crowned with tiered sandstone
 * palace shrines and long cascading waterfalls descending through mountain mist.
 */
UCLASS()
class ASTRASOFBHARATA_API AAstrasFloatingIslandActor : public AActor
{
	GENERATED_BODY()

public:
	AAstrasFloatingIslandActor();

	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "FloatingIsland")
	float BobAmplitudeCm = 95.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "FloatingIsland")
	float BobSpeedRad = 0.45f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "FloatingIsland")
	float WaterfallHeightM = 140.0f;

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UStaticMeshComponent> CraggyRockBaseMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UStaticMeshComponent> TempleCitadelCrownMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UNiagaraComponent> WaterfallCurtainVfx;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UNiagaraComponent> CloudMistVfx;

private:
	FVector BaseLocationCm = FVector::ZeroVector;
	float PhaseOffset = 0.0f;
};

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "AstrasTypes.h"
#include "AstrasProjectilePhysics.generated.h"

class USphereComponent;
class UStaticMeshComponent;
class UNiagaraComponent;
class UNiagaraSystem;

USTRUCT(BlueprintType)
struct FProjectilePhysicsProfile
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	EProjectileArchetype Archetype = EProjectileArchetype::Arrow;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	EProjectilePhysicsCategory Category = EProjectilePhysicsCategory::BallisticArrow;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float SpeedMs = 48.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float GravityMs2 = 9.81f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float Drag = 0.04f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float QuadraticDrag = 0.0028f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float BuoyancyAccel = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float HelicalOmega = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float HelicalRadiusAccel = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float MaxLifeSec = 1.65f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float CooldownSec = 0.22f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float HitRadiusM = 0.16f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float AoeRadiusM = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float DirectDamage = 32.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float SplashDamage = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float DotDamagePerSec = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float EffectDurationSec = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float KnockbackForce = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float LiftHeightM = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float LateralCurveAccel = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float ReturnAfterSec = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float HomingTurnRate = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float SlitherFreq = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float SlitherAmp = 0.0f;
};

USTRUCT(BlueprintType)
struct FProjectileKinematicsState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite)
	EProjectileArchetype Archetype = EProjectileArchetype::Arrow;

	UPROPERTY(BlueprintReadWrite)
	FVector PositionM = FVector::ZeroVector;

	UPROPERTY(BlueprintReadWrite)
	FVector VelocityMs = FVector::ZeroVector;

	UPROPERTY(BlueprintReadWrite)
	float ElapsedSec = 0.0f;

	UPROPERTY(BlueprintReadWrite)
	float SpinAngle = 0.0f;
};

UCLASS()
class ASTRASOFBHARATA_API AAstrasProjectileActor : public AActor
{
	GENERATED_BODY()

public:
	AAstrasProjectileActor();

	virtual void Tick(float DeltaSeconds) override;

	UFUNCTION(BlueprintCallable, Category = "Astras|Projectile")
	void LaunchProjectile(
		EProjectileArchetype InArchetype,
		const FVector& WorldOriginCm,
		const FVector& Direction,
		AActor* InCaster,
		AActor* InHomingTarget,
		bool bInStealthAmbush
	);

	static const FProjectilePhysicsProfile& GetPhysicsProfile(EProjectileArchetype Archetype);
	static void StepKinematics(
		FProjectileKinematicsState& State,
		float DeltaSec,
		const FVector* TargetPosM,
		const FVector* CasterPosM
	);

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<USphereComponent> CollisionSphere;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UStaticMeshComponent> ProjectileMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UNiagaraComponent> TrailNiagara;

	UPROPERTY(EditDefaultsOnly, Category = "VFX")
	TMap<EProjectileArchetype, TObjectPtr<UNiagaraSystem>> ImpactVfxMap;

private:
	FProjectileKinematicsState Kinematics;
	TWeakObjectPtr<AActor> CasterActor;
	TWeakObjectPtr<AActor> HomingTargetActor;
	bool bStealthAmbush = false;
	bool bHasDetonated = false;

	void HandleImpact(const FVector& HitPosCm, AActor* DirectHitActor);
};

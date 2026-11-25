#include "AstrasProjectilePhysics.h"
#include "AstrasEnemyCharacter.h"
#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/OverlapResult.h"
#include "Kismet/GameplayStatics.h"
#include "NiagaraComponent.h"
#include "NiagaraFunctionLibrary.h"

namespace
{
	TMap<EProjectileArchetype, FProjectilePhysicsProfile> BuildPhysicsRegistry()
	{
		TMap<EProjectileArchetype, FProjectilePhysicsProfile> Map;

		{
			FProjectilePhysicsProfile P;
			P.Archetype = EProjectileArchetype::Arrow;
			P.Category = EProjectilePhysicsCategory::BallisticArrow;
			P.SpeedMs = 48.0f;
			P.GravityMs2 = 9.81f;
			P.Drag = 0.04f;
			P.QuadraticDrag = 0.0028f;
			P.MaxLifeSec = 1.65f;
			P.CooldownSec = 0.22f;
			P.HitRadiusM = 0.16f;
			P.DirectDamage = 32.0f;
			Map.Add(P.Archetype, P);
		}
		{
			FProjectilePhysicsProfile P;
			P.Archetype = EProjectileArchetype::Chakra;
			P.Category = EProjectilePhysicsCategory::EnergyGyroscopic;
			P.SpeedMs = 36.0f;
			P.GravityMs2 = 0.0f;
			P.Drag = 0.015f;
			P.MaxLifeSec = 2.25f;
			P.CooldownSec = 8.5f;
			P.HitRadiusM = 0.62f;
			P.AoeRadiusM = 6.5f;
			P.DirectDamage = 95.0f;
			P.SplashDamage = 72.0f;
			P.KnockbackForce = 6.0f;
			P.LateralCurveAccel = 13.5f;
			P.ReturnAfterSec = 0.78f;
			P.HomingTurnRate = 8.5f;
			Map.Add(P.Archetype, P);
		}
		{
			FProjectilePhysicsProfile P;
			P.Archetype = EProjectileArchetype::Agneyastra;
			P.Category = EProjectilePhysicsCategory::ElementalFire;
			P.SpeedMs = 46.0f;
			P.GravityMs2 = 3.4f;
			P.Drag = 0.025f;
			P.QuadraticDrag = 0.0008f;
			P.BuoyancyAccel = 1.45f;
			P.MaxLifeSec = 1.45f;
			P.CooldownSec = 4.5f;
			P.HitRadiusM = 0.42f;
			P.AoeRadiusM = 8.2f;
			P.DirectDamage = 86.0f;
			P.SplashDamage = 74.0f;
			P.DotDamagePerSec = 18.0f;
			P.EffectDurationSec = 4.0f;
			P.KnockbackForce = 5.0f;
			Map.Add(P.Archetype, P);
		}
		{
			FProjectilePhysicsProfile P;
			P.Archetype = EProjectileArchetype::Varunastra;
			P.Category = EProjectilePhysicsCategory::ElementalWater;
			P.SpeedMs = 44.0f;
			P.GravityMs2 = 5.4f;
			P.Drag = 0.11f;
			P.QuadraticDrag = 0.0045f;
			P.MaxLifeSec = 1.45f;
			P.CooldownSec = 5.0f;
			P.HitRadiusM = 0.46f;
			P.AoeRadiusM = 9.0f;
			P.DirectDamage = 54.0f;
			P.SplashDamage = 50.0f;
			P.EffectDurationSec = 2.2f;
			P.KnockbackForce = 18.0f;
			Map.Add(P.Archetype, P);
		}
		{
			FProjectilePhysicsProfile P;
			P.Archetype = EProjectileArchetype::Vayavyastra;
			P.Category = EProjectilePhysicsCategory::ElementalWind;
			P.SpeedMs = 52.0f;
			P.GravityMs2 = 0.7f;
			P.Drag = 0.008f;
			P.BuoyancyAccel = 0.35f;
			P.HelicalOmega = 9.2f;
			P.HelicalRadiusAccel = 3.8f;
			P.MaxLifeSec = 1.45f;
			P.CooldownSec = 6.0f;
			P.HitRadiusM = 0.40f;
			P.AoeRadiusM = 9.5f;
			P.DirectDamage = 42.0f;
			P.SplashDamage = 24.0f;
			P.DotDamagePerSec = 18.0f;
			P.EffectDurationSec = 3.4f;
			P.LiftHeightM = 4.8f;
			Map.Add(P.Archetype, P);
		}
		{
			FProjectilePhysicsProfile P;
			P.Archetype = EProjectileArchetype::Nagastra;
			P.Category = EProjectilePhysicsCategory::ElementalSerpent;
			P.SpeedMs = 42.0f;
			P.GravityMs2 = 2.8f;
			P.Drag = 0.04f;
			P.QuadraticDrag = 0.0012f;
			P.MaxLifeSec = 1.45f;
			P.CooldownSec = 6.5f;
			P.HitRadiusM = 0.34f;
			P.AoeRadiusM = 14.0f;
			P.DirectDamage = 38.0f;
			P.SplashDamage = 28.0f;
			P.DotDamagePerSec = 14.0f;
			P.EffectDurationSec = 2.8f;
			P.SlitherFreq = 7.5f;
			P.SlitherAmp = 1.2f;
			Map.Add(P.Archetype, P);
		}
		{
			FProjectilePhysicsProfile P;
			P.Archetype = EProjectileArchetype::Brahmastra;
			P.Category = EProjectilePhysicsCategory::EnergyBeam;
			P.SpeedMs = 64.0f;
			P.GravityMs2 = 0.0f;
			P.Drag = 0.0f;
			P.MaxLifeSec = 1.8f;
			P.CooldownSec = 28.0f;
			P.HitRadiusM = 0.80f;
			P.AoeRadiusM = 18.0f;
			P.DirectDamage = 320.0f;
			P.SplashDamage = 240.0f;
			P.EffectDurationSec = 5.0f;
			P.KnockbackForce = 28.0f;
			Map.Add(P.Archetype, P);
		}
		return Map;
	}
}

AAstrasProjectileActor::AAstrasProjectileActor()
{
	PrimaryActorTick.bCanEverTick = true;

	CollisionSphere = CreateDefaultSubobject<USphereComponent>(TEXT("CollisionSphere"));
	CollisionSphere->InitSphereRadius(24.0f);
	CollisionSphere->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	RootComponent = CollisionSphere;

	ProjectileMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ProjectileMesh"));
	ProjectileMesh->SetupAttachment(RootComponent);
	ProjectileMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	TrailNiagara = CreateDefaultSubobject<UNiagaraComponent>(TEXT("TrailNiagara"));
	TrailNiagara->SetupAttachment(RootComponent);
}

const FProjectilePhysicsProfile& AAstrasProjectileActor::GetPhysicsProfile(EProjectileArchetype Archetype)
{
	static const TMap<EProjectileArchetype, FProjectilePhysicsProfile> Registry = BuildPhysicsRegistry();
	if (const FProjectilePhysicsProfile* Found = Registry.Find(Archetype))
	{
		return *Found;
	}
	return Registry[EProjectileArchetype::Arrow];
}

void AAstrasProjectileActor::LaunchProjectile(
	EProjectileArchetype InArchetype,
	const FVector& WorldOriginCm,
	const FVector& Direction,
	AActor* InCaster,
	AActor* InHomingTarget,
	bool bInStealthAmbush
)
{
	const FProjectilePhysicsProfile& Profile = GetPhysicsProfile(InArchetype);
	Kinematics.Archetype = InArchetype;
	Kinematics.PositionM = WorldOriginCm / AstrasWorldConstants::MetersToUnrealUnits;
	Kinematics.VelocityMs = Direction.GetSafeNormal() * Profile.SpeedMs;
	Kinematics.ElapsedSec = 0.0f;
	Kinematics.SpinAngle = 0.0f;

	CasterActor = InCaster;
	HomingTargetActor = InHomingTarget;
	bStealthAmbush = bInStealthAmbush;
	bHasDetonated = false;

	CollisionSphere->SetSphereRadius(FMath::Max(16.0f, Profile.HitRadiusM * AstrasWorldConstants::MetersToUnrealUnits));
	SetActorLocationAndRotation(WorldOriginCm, Direction.Rotation());
}

void AAstrasProjectileActor::StepKinematics(
	FProjectileKinematicsState& State,
	float DeltaSec,
	const FVector* TargetPosM,
	const FVector* CasterPosM
)
{
	if (DeltaSec <= 0.0f) return;
	const FProjectilePhysicsProfile& Profile = GetPhysicsProfile(State.Archetype);
	State.ElapsedSec += DeltaSec;

	// UE axes: X/Y horizontal plane, Z vertical up
	switch (Profile.Category)
	{
	case EProjectilePhysicsCategory::BallisticArrow:
	{
		State.VelocityMs.Z -= Profile.GravityMs2 * DeltaSec;
		const float Speed = State.VelocityMs.Size();
		if (Profile.QuadraticDrag > 0.0f && Speed > 0.1f)
		{
			State.VelocityMs *= 1.0f / (1.0f + Profile.QuadraticDrag * Speed * DeltaSec);
		}
		break;
	}
	case EProjectilePhysicsCategory::EnergyGyroscopic:
	{
		const float HorizSpeed = FVector2D(State.VelocityMs.X, State.VelocityMs.Y).Size();
		if (HorizSpeed > 0.2f)
		{
			if (State.ElapsedSec < Profile.ReturnAfterSec)
			{
				const float Nx = State.VelocityMs.X / HorizSpeed;
				const float Ny = State.VelocityMs.Y / HorizSpeed;
				const float Phase = State.ElapsedSec < Profile.ReturnAfterSec * 0.55f ? 1.0f : 0.45f;
				State.VelocityMs.X += (-Ny) * Profile.LateralCurveAccel * Phase * DeltaSec;
				State.VelocityMs.Y += Nx * Profile.LateralCurveAccel * Phase * DeltaSec;

				if (TargetPosM)
				{
					const FVector AimDir = ((*TargetPosM + FVector(0, 0, 1.25f)) - State.PositionM).GetSafeNormal();
					const float LockSteer = 1.0f - FMath::Exp(-3.2f * DeltaSec);
					State.VelocityMs = FMath::Lerp(State.VelocityMs, AimDir * Profile.SpeedMs, LockSteer);
				}
			}
			else if (CasterPosM)
			{
				const FVector RetDir = ((*CasterPosM + FVector(0, 0, 1.45f)) - State.PositionM).GetSafeNormal();
				const float Steer = 1.0f - FMath::Exp(-Profile.HomingTurnRate * DeltaSec);
				State.VelocityMs = FMath::Lerp(State.VelocityMs, RetDir * (Profile.SpeedMs * 1.12f), Steer);
			}
		}
		break;
	}
	case EProjectilePhysicsCategory::EnergyBeam:
	{
		const float Speed = State.VelocityMs.Size();
		if (Speed > 0.1f && Speed < Profile.SpeedMs * 1.16f)
		{
			State.VelocityMs *= (1.0f + 0.12f * DeltaSec);
		}
		break;
	}
	case EProjectilePhysicsCategory::ElementalFire:
	{
		State.VelocityMs.Z -= (Profile.GravityMs2 - Profile.BuoyancyAccel) * DeltaSec;
		break;
	}
	case EProjectilePhysicsCategory::ElementalWater:
	{
		State.VelocityMs.Z -= Profile.GravityMs2 * DeltaSec;
		const float Speed = State.VelocityMs.Size();
		if (Profile.QuadraticDrag > 0.0f && Speed > 0.1f)
		{
			State.VelocityMs *= 1.0f / (1.0f + Profile.QuadraticDrag * Speed * DeltaSec);
		}
		break;
	}
	case EProjectilePhysicsCategory::ElementalWind:
	{
		State.VelocityMs.Z -= (Profile.GravityMs2 - Profile.BuoyancyAccel) * DeltaSec;
		const float HorizSpeed = FVector2D(State.VelocityMs.X, State.VelocityMs.Y).Size();
		if (HorizSpeed > 0.5f)
		{
			const float Px = -State.VelocityMs.Y / HorizSpeed;
			const float Py = State.VelocityMs.X / HorizSpeed;
			const float Phase = State.ElapsedSec * Profile.HelicalOmega;
			State.VelocityMs.X += Px * FMath::Cos(Phase) * Profile.HelicalRadiusAccel * DeltaSec;
			State.VelocityMs.Y += Py * FMath::Cos(Phase) * Profile.HelicalRadiusAccel * DeltaSec;
			State.VelocityMs.Z += FMath::Sin(Phase) * (Profile.HelicalRadiusAccel * 0.55f) * DeltaSec;
		}
		break;
	}
	case EProjectilePhysicsCategory::ElementalSerpent:
	{
		State.VelocityMs.Z -= Profile.GravityMs2 * DeltaSec;
		if (TargetPosM)
		{
			const FVector AimDir = ((*TargetPosM + FVector(0, 0, 1.1f)) - State.PositionM).GetSafeNormal();
			const float Steer = 1.0f - FMath::Exp(-Profile.HomingTurnRate * DeltaSec);
			State.VelocityMs = FMath::Lerp(State.VelocityMs, AimDir * Profile.SpeedMs, Steer);
		}
		break;
	}
	}

	if (Profile.Drag > 0.0f)
	{
		State.VelocityMs *= FMath::Exp(-Profile.Drag * DeltaSec);
	}
	State.PositionM += State.VelocityMs * DeltaSec;
}

void AAstrasProjectileActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bHasDetonated) return;

	const FProjectilePhysicsProfile& Profile = GetPhysicsProfile(Kinematics.Archetype);
	const FVector PrevPosCm = GetActorLocation();

	FVector TargetM = FVector::ZeroVector;
	FVector CasterM = FVector::ZeroVector;
	const FVector* TargetPtr = nullptr;
	const FVector* CasterPtr = nullptr;
	if (HomingTargetActor.IsValid())
	{
		TargetM = HomingTargetActor->GetActorLocation() / AstrasWorldConstants::MetersToUnrealUnits;
		TargetPtr = &TargetM;
	}
	if (CasterActor.IsValid())
	{
		CasterM = CasterActor->GetActorLocation() / AstrasWorldConstants::MetersToUnrealUnits;
		CasterPtr = &CasterM;
	}

	StepKinematics(Kinematics, DeltaSeconds, TargetPtr, CasterPtr);
	const FVector NextPosCm = Kinematics.PositionM * AstrasWorldConstants::MetersToUnrealUnits;

	FHitResult Hit;
	FCollisionQueryParams Params;
	Params.AddIgnoredActor(this);
	if (CasterActor.IsValid()) Params.AddIgnoredActor(CasterActor.Get());

	if (GetWorld()->SweepSingleByChannel(
			Hit, PrevPosCm, NextPosCm, FQuat::Identity,
			ECC_WorldDynamic, FCollisionShape::MakeSphere(CollisionSphere->GetScaledSphereRadius()), Params))
	{
		HandleImpact(Hit.ImpactPoint, Hit.GetActor());
		return;
	}

	SetActorLocationAndRotation(NextPosCm, Kinematics.VelocityMs.Rotation());

	if (Kinematics.ElapsedSec >= Profile.MaxLifeSec)
	{
		HandleImpact(NextPosCm, nullptr);
	}
}

void AAstrasProjectileActor::HandleImpact(const FVector& HitPosCm, AActor* DirectHitActor)
{
	if (bHasDetonated) return;
	bHasDetonated = true;

	const FProjectilePhysicsProfile& Profile = GetPhysicsProfile(Kinematics.Archetype);
	const float StealthMult = bStealthAmbush ? 2.0f : 1.0f;

	if (TObjectPtr<UNiagaraSystem>* VfxPtr = ImpactVfxMap.Find(Kinematics.Archetype))
	{
		if (*VfxPtr)
		{
			UNiagaraFunctionLibrary::SpawnSystemAtLocation(GetWorld(), *VfxPtr, HitPosCm);
		}
	}

	if (Profile.AoeRadiusM > 0.0f)
	{
		TArray<FOverlapResult> Overlaps;
		const float AoeCm = Profile.AoeRadiusM * AstrasWorldConstants::MetersToUnrealUnits;
		FCollisionQueryParams Params;
		Params.AddIgnoredActor(this);
		GetWorld()->OverlapMultiByChannel(
			Overlaps, HitPosCm, FQuat::Identity, ECC_Pawn,
			FCollisionShape::MakeSphere(AoeCm), Params
		);

		for (const FOverlapResult& Ov : Overlaps)
		{
			if (AAstrasEnemyCharacter* Demon = Cast<AAstrasEnemyCharacter>(Ov.GetActor()))
			{
				const bool bIsDirect = (Demon == DirectHitActor);
				const float BaseDmg = bIsDirect ? Profile.DirectDamage : Profile.SplashDamage;
				const FVector PushDir = (Demon->GetActorLocation() - HitPosCm).GetSafeNormal2D();
				Demon->ApplyAstraDamage(
					BaseDmg * StealthMult,
					Kinematics.Archetype,
					PushDir * Profile.KnockbackForce * 100.0f,
					Profile.LiftHeightM * 100.0f,
					Profile.DotDamagePerSec,
					Profile.EffectDurationSec
				);
			}
		}
	}
	else if (AAstrasEnemyCharacter* DirectDemon = Cast<AAstrasEnemyCharacter>(DirectHitActor))
	{
		DirectDemon->ApplyAstraDamage(
			Profile.DirectDamage * StealthMult,
			Kinematics.Archetype,
			FVector::ZeroVector,
			0.0f,
			Profile.DotDamagePerSec,
			Profile.EffectDurationSec
		);
	}

	Destroy();
}

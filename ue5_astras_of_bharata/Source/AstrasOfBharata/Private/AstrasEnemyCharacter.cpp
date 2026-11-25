#include "AstrasEnemyCharacter.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

AAstrasEnemyCharacter::AAstrasEnemyCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	GetCapsuleComponent()->InitCapsuleSize(62.0f, 132.0f);
	GetCharacterMovement()->MaxWalkSpeed = 480.0f;

	SpikedGadaMaceMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("SpikedGadaMaceMesh"));
	SpikedGadaMaceMesh->SetupAttachment(GetMesh(), TEXT("hand_r"));
	SpikedGadaMaceMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void AAstrasEnemyCharacter::BeginPlay()
{
	Super::BeginPlay();

	const int32 MatCount = GetMesh()->GetNumMaterials();
	for (int32 i = 0; i < MatCount; ++i)
	{
		if (UMaterialInstanceDynamic* Dyn = GetMesh()->CreateAndSetMaterialInstanceDynamic(i))
		{
			DynamicMaterials.Add(Dyn);
		}
	}
}

void AAstrasEnemyCharacter::ConfigureDemonVariant(EDemonVariant InVariant, bool bInCommander, float InScale)
{
	Variant = InVariant;
	bIsCommander = bInCommander;
	const float FinalScale = bIsCommander ? FMath::Max(1.65f, InScale) : FMath::Max(1.32f, InScale);
	SetActorScale3D(FVector(FinalScale));

	MaxHp = bIsCommander ? 1800.0f : (Variant == EDemonVariant::BruteHuman ? 680.0f : 380.0f);
	Hp = MaxHp;
}

void AAstrasEnemyCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (bDissolving)
	{
		DissolveProgress = FMath::Min(1.0f, DissolveProgress + DeltaSeconds * 0.5f); // 2-sec ash dissolve
		for (UMaterialInstanceDynamic* Mat : DynamicMaterials)
		{
			if (Mat)
			{
				Mat->SetScalarParameterValue(TEXT("DissolveAmount"), DissolveProgress);
				Mat->SetScalarParameterValue(TEXT("EmissiveEdgeGlow"), 1.0f);
			}
		}
		if (DissolveProgress >= 1.0f)
		{
			Destroy();
		}
		return;
	}

	if (!bAlive) return;

	if (BindRemainingSec > 0.0f)
	{
		BindRemainingSec = FMath::Max(0.0f, BindRemainingSec - DeltaSeconds);
		GetCharacterMovement()->DisableMovement();
	}
	else if (GetCharacterMovement()->MovementMode == MOVE_None)
	{
		GetCharacterMovement()->SetMovementMode(MOVE_Walking);
	}

	if (BurnRemainingSec > 0.0f)
	{
		BurnRemainingSec = FMath::Max(0.0f, BurnRemainingSec - DeltaSeconds);
		Hp -= BurnDps * DeltaSeconds;
		if (Hp <= 0.0f)
		{
			bAlive = false;
			bDissolving = true;
			GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		}
	}
}

void AAstrasEnemyCharacter::ApplyAstraDamage(
	float DamageAmount,
	EProjectileArchetype SourceArchetype,
	const FVector& KnockbackImpulseCm,
	float TornadoLiftHeightCm,
	float DotDps,
	float StatusDurationSec
)
{
	if (!bAlive) return;

	Hp = FMath::Max(0.0f, Hp - DamageAmount);

	if (!KnockbackImpulseCm.IsNearlyZero())
	{
		LaunchCharacter(KnockbackImpulseCm + FVector(0.0f, 0.0f, 220.0f), true, true);
	}
	if (TornadoLiftHeightCm > 10.0f)
	{
		LaunchCharacter(FVector(0.0f, 0.0f, TornadoLiftHeightCm * 1.4f), false, true);
	}

	if (SourceArchetype == EProjectileArchetype::Agneyastra && DotDps > 0.0f)
	{
		BurnDps = DotDps;
		BurnRemainingSec = StatusDurationSec;
	}
	else if (SourceArchetype == EProjectileArchetype::Varunastra)
	{
		BurnRemainingSec = 0.0f; // Varunastra quenches fire
	}
	else if ((SourceArchetype == EProjectileArchetype::Nagastra || SourceArchetype == EProjectileArchetype::NagastraSerpent) && StatusDurationSec > 0.0f)
	{
		BindRemainingSec = StatusDurationSec;
	}

	if (Hp <= 0.0f)
	{
		bAlive = false;
		bDissolving = true;
		GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
}

#include "AstrasPlayerCharacter.h"
#include "AstrasEnemyCharacter.h"
#include "AstrasMountVehicle.h"
#include "AstrasProjectilePhysics.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/OverlapResult.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "NiagaraComponent.h"
#include "NiagaraSystem.h"

AAstrasPlayerCharacter::AAstrasPlayerCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	GetCapsuleComponent()->InitCapsuleSize(42.0f, 96.0f);
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;

	UCharacterMovementComponent* MoveComp = GetCharacterMovement();
	MoveComp->bOrientRotationToMovement = true;
	MoveComp->RotationRate = FRotator(0.0f, 540.0f, 0.0f);
	MoveComp->JumpZVelocity = 520.0f;
	MoveComp->AirControl = 0.35f;
	MoveComp->MaxWalkSpeed = 620.0f;

	// Over-shoulder heroic framing matching reference screenshot
	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->TargetArmLength = 340.0f;
	CameraBoom->SocketOffset = FVector(0.0f, 58.0f, 72.0f);
	CameraBoom->bUsePawnControlRotation = true;
	CameraBoom->bDoCollisionTest = true;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;
	FollowCamera->FieldOfView = 72.0f;

	FierySwordMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("FierySwordMesh"));
	FierySwordMesh->SetupAttachment(GetMesh(), TEXT("hand_r"));
	FierySwordMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	SwordFlameVfx = CreateDefaultSubobject<UNiagaraComponent>(TEXT("SwordFlameVfx"));
	SwordFlameVfx->SetupAttachment(FierySwordMesh);

	SharngaBowMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("SharngaBowMesh"));
	SharngaBowMesh->SetupAttachment(GetMesh(), TEXT("hand_l"));
	SharngaBowMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	SignatureAuraVfx = CreateDefaultSubobject<UNiagaraComponent>(TEXT("SignatureAuraVfx"));
	SignatureAuraVfx->SetupAttachment(RootComponent);

	ProjectileClass = AAstrasProjectileActor::StaticClass();
}

void AAstrasPlayerCharacter::BeginPlay()
{
	Super::BeginPlay();
}

void AAstrasPlayerCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	AstraEnergy = FMath::Min(MaxAstraEnergy, AstraEnergy + 12.5f * DeltaSeconds);

	for (auto& Pair : AstraCooldownRemaining)
	{
		Pair.Value = FMath::Max(0.0f, Pair.Value - DeltaSeconds);
	}
	ChakraCooldownRemaining = FMath::Max(0.0f, ChakraCooldownRemaining - DeltaSeconds);
	PrimaryCooldownRemaining = FMath::Max(0.0f, PrimaryCooldownRemaining - DeltaSeconds);
	UltimateCooldownRemaining = FMath::Max(0.0f, UltimateCooldownRemaining - DeltaSeconds);

	if (AvatarSurgeTimerSec > 0.0f)
	{
		AvatarSurgeTimerSec = FMath::Max(0.0f, AvatarSurgeTimerSec - DeltaSeconds);
		if (AvatarSurgeTimerSec <= 0.0f)
		{
			SetActorScale3D(FVector(BaseHeroScale));
		}
	}
}

void AAstrasPlayerCharacter::ApplyDeityProfile(const FHeroDeityProfile& Profile)
{
	const float HpRatio = MaxHp > 0.0f ? FMath::Clamp(Hp / MaxHp, 0.0f, 1.0f) : 1.0f;
	const float EnergyRatio = MaxAstraEnergy > 0.0f ? FMath::Clamp(AstraEnergy / MaxAstraEnergy, 0.0f, 1.0f) : 1.0f;

	DeityId = Profile.DeityId;
	LanHeroCode = Profile.LanHeroCode;
	MaxHp = Profile.MaxHp;
	Hp = FMath::Max(1.0f, MaxHp * HpRatio);
	MaxAstraEnergy = Profile.MaxAstraEnergy;
	AstraEnergy = MaxAstraEnergy * EnergyRatio;
	BaseWalkSpeed = Profile.BaseWalkSpeed;
	SprintSpeed = Profile.SprintSpeed;
	MeleeDamage = Profile.MeleeDamage;
	PrimaryAbilityCooldownSec = Profile.PrimaryCooldownSec;
	UltimateAbilityCooldownSec = Profile.UltimateCooldownSec;
	BaseHeroScale = Profile.HeroScale;
	SetActorScale3D(FVector(BaseHeroScale));

	if (UCharacterMovementComponent* MoveComp = GetCharacterMovement())
	{
		MoveComp->JumpZVelocity = Profile.JumpZVelocity;
		MoveComp->MaxFlySpeed = SprintSpeed * 1.35f;
		if (DeityId != EHeroDeityId::WarriorHanuman && bIsFlying)
		{
			bIsFlying = false;
			MoveComp->SetMovementMode(MOVE_Walking);
		}
		SetSprinting(bIsSprinting);
	}

	if (!Profile.CharacterSkeletalMesh.IsNull())
	{
		if (USkeletalMesh* LoadedMesh = Profile.CharacterSkeletalMesh.LoadSynchronous())
		{
			GetMesh()->SetSkeletalMeshAsset(LoadedMesh);
		}
	}
	if (Profile.AnimBlueprintClass)
	{
		GetMesh()->SetAnimInstanceClass(Profile.AnimBlueprintClass);
	}
	if (!Profile.PrimaryWeaponMesh.IsNull())
	{
		if (UStaticMesh* LoadedPrimary = Profile.PrimaryWeaponMesh.LoadSynchronous())
		{
			FierySwordMesh->SetStaticMesh(LoadedPrimary);
		}
	}
	if (!Profile.SecondaryWeaponMesh.IsNull())
	{
		if (UStaticMesh* LoadedSecondary = Profile.SecondaryWeaponMesh.LoadSynchronous())
		{
			SharngaBowMesh->SetStaticMesh(LoadedSecondary);
		}
	}
	if (!Profile.SignatureAuraVfx.IsNull())
	{
		if (UNiagaraSystem* LoadedVfx = Profile.SignatureAuraVfx.LoadSynchronous())
		{
			SignatureAuraVfx->SetAsset(LoadedVfx);
			SignatureAuraVfx->Activate(true);
		}
	}
}

void AAstrasPlayerCharacter::SyncRuntimeStateFrom(AAstrasPlayerCharacter* PreviousHero)
{
	if (!PreviousHero) return;

	const float PrevHpRatio = PreviousHero->GetMaxHp() > 0.0f ? FMath::Clamp(PreviousHero->GetHp() / PreviousHero->GetMaxHp(), 0.05f, 1.0f) : 1.0f;
	const float PrevEnergyRatio = PreviousHero->GetMaxAstraEnergy() > 0.0f ? FMath::Clamp(PreviousHero->GetAstraEnergy() / PreviousHero->GetMaxAstraEnergy(), 0.0f, 1.0f) : 1.0f;

	Hp = MaxHp * PrevHpRatio;
	AstraEnergy = MaxAstraEnergy * PrevEnergyRatio;
	bIsSprinting = PreviousHero->bIsSprinting;
	bStealthActive = PreviousHero->bStealthActive;
	SetSprinting(bIsSprinting);

	// Preserve 2-seat vehicle occupancy across real-time character swap
	if (AAstrasMountVehicle* PrevMount = PreviousHero->GetMountedVehicle())
	{
		const EVehicleSeatIndex TargetSeat = PreviousHero->GetCurrentSeat();
		PreviousHero->DismountVehicle();
		EVehicleSeatIndex AssignedSeat = EVehicleSeatIndex::Unseated;
		if (PrevMount->BoardCharacter(this, AssignedSeat))
		{
			if (AssignedSeat != TargetSeat && TargetSeat != EVehicleSeatIndex::Unseated)
			{
				EVehicleSeatIndex Switched = AssignedSeat;
				if (PrevMount->SwitchSeat(this, Switched))
				{
					AssignedSeat = Switched;
				}
			}
			MountedVehicle = PrevMount;
			CurrentSeat = AssignedSeat;
			GetCharacterMovement()->SetMovementMode(MOVE_None);
			GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		}
	}
}

void AAstrasPlayerCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	PlayerInputComponent->BindAxis(TEXT("MoveForward"), this, &AAstrasPlayerCharacter::MoveForwardInput);
	PlayerInputComponent->BindAxis(TEXT("MoveRight"), this, &AAstrasPlayerCharacter::MoveRightInput);
	PlayerInputComponent->BindAxis(TEXT("Turn"), this, &AAstrasPlayerCharacter::LookYawInput);
	PlayerInputComponent->BindAxis(TEXT("LookUp"), this, &AAstrasPlayerCharacter::LookPitchInput);
	PlayerInputComponent->BindAction(TEXT("Jump"), IE_Pressed, this, &ACharacter::Jump);
	PlayerInputComponent->BindAction(TEXT("Jump"), IE_Released, this, &ACharacter::StopJumping);
}

void AAstrasPlayerCharacter::MoveForwardInput(float Value)
{
	if (MountedVehicle.IsValid() && CurrentSeat == EVehicleSeatIndex::Driver)
	{
		MountedVehicle->ApplyDriverThrottle(Value);
		return;
	}
	if (Controller && FMath::Abs(Value) > KINDA_SMALL_NUMBER && CurrentSeat == EVehicleSeatIndex::Unseated)
	{
		const FRotator YawRot(0.0f, Controller->GetControlRotation().Yaw, 0.0f);
		AddMovementInput(FRotationMatrix(YawRot).GetUnitAxis(EAxis::X), Value);
	}
}

void AAstrasPlayerCharacter::MoveRightInput(float Value)
{
	if (MountedVehicle.IsValid() && CurrentSeat == EVehicleSeatIndex::Driver)
	{
		MountedVehicle->ApplyDriverSteer(Value);
		return;
	}
	if (Controller && FMath::Abs(Value) > KINDA_SMALL_NUMBER && CurrentSeat == EVehicleSeatIndex::Unseated)
	{
		const FRotator YawRot(0.0f, Controller->GetControlRotation().Yaw, 0.0f);
		AddMovementInput(FRotationMatrix(YawRot).GetUnitAxis(EAxis::Y), Value);
	}
}

void AAstrasPlayerCharacter::LookYawInput(float Value)
{
	AddControllerYawInput(Value);
}

void AAstrasPlayerCharacter::LookPitchInput(float Value)
{
	AddControllerPitchInput(Value);
}

void AAstrasPlayerCharacter::SetSprinting(bool bEnableSprint)
{
	bIsSprinting = bEnableSprint;
	GetCharacterMovement()->MaxWalkSpeed = bIsSprinting ? SprintSpeed : (bStealthActive ? BaseWalkSpeed * 0.62f : BaseWalkSpeed);
}

void AAstrasPlayerCharacter::ToggleStealth()
{
	bStealthActive = !bStealthActive;
	SetSprinting(bIsSprinting);
}

void AAstrasPlayerCharacter::ToggleHanumanFlight()
{
	if (DeityId != EHeroDeityId::WarriorHanuman || MountedVehicle.IsValid())
	{
		return;
	}
	UCharacterMovementComponent* MoveComp = GetCharacterMovement();
	if (!MoveComp) return;

	bIsFlying = !bIsFlying;
	if (bIsFlying)
	{
		MoveComp->MaxFlySpeed = SprintSpeed * 1.35f;
		MoveComp->SetMovementMode(MOVE_Flying);
		LaunchCharacter(FVector(0.0f, 0.0f, 480.0f), false, true);
	}
	else
	{
		MoveComp->SetMovementMode(MOVE_Walking);
	}
}

void AAstrasPlayerCharacter::RestoreFullVitals()
{
	Hp = MaxHp;
	AstraEnergy = MaxAstraEnergy;
}

void AAstrasPlayerCharacter::FireStandardArrowOrSwordSlash()
{
	// Close-range melee cleave + ranged Sharnga arrow fallback
	PerformRadialMeleeStrike(280.0f, MeleeDamage, 350.0f, 0.0f, EProjectileArchetype::Arrow);

	if (!ProjectileClass) return;
	const FVector SpawnLoc = FollowCamera->GetComponentLocation() + FollowCamera->GetForwardVector() * 140.0f;
	const FVector AimDir = FollowCamera->GetForwardVector();

	FActorSpawnParameters Params;
	Params.Owner = this;
	if (AAstrasProjectileActor* Proj = GetWorld()->SpawnActor<AAstrasProjectileActor>(ProjectileClass, SpawnLoc, AimDir.Rotation(), Params))
	{
		Proj->LaunchProjectile(EProjectileArchetype::Arrow, SpawnLoc, AimDir, this, nullptr, bStealthActive);
	}
}

void AAstrasPlayerCharacter::ExecuteHeroPrimaryAbility_Implementation()
{
	if (PrimaryCooldownRemaining > 0.0f || AstraEnergy < 30.0f) return;
	AstraEnergy -= 30.0f;
	PrimaryCooldownRemaining = PrimaryAbilityCooldownSec;

	switch (DeityId)
	{
	case EHeroDeityId::LordRam:
		// Surya-Agni Blade Wave: blazing forward fire strike
		PerformRadialMeleeStrike(460.0f, MeleeDamage * 1.8f, 650.0f, 120.0f, EProjectileArchetype::Agneyastra);
		CastSelectedAstra(EAstraId::Agneyastra);
		break;

	case EHeroDeityId::WarriorHanuman:
		// Vajra-Gada Seismic Slam: vault + massive earth shockwave knocking giant demons airborne
		LaunchCharacter(GetActorForwardVector() * 550.0f + FVector(0.0f, 0.0f, 440.0f), false, false);
		PerformRadialMeleeStrike(680.0f, MeleeDamage * 2.1f, 1250.0f, 480.0f, EProjectileArchetype::Varunastra);
		break;

	case EHeroDeityId::Lakshman:
	{
		// Seshanaga Serpent Volley: 3 fanned piercing serpent arrows + evasive dash
		if (ProjectileClass)
		{
			const FVector BaseDir = FollowCamera->GetForwardVector();
			const FVector SpawnLoc = FollowCamera->GetComponentLocation() + BaseDir * 150.0f;
			for (int32 i = -1; i <= 1; ++i)
			{
				const FVector SpreadDir = BaseDir.RotateAngleAxis(i * 9.0f, FVector::UpVector);
				FActorSpawnParameters Params;
				Params.Owner = this;
				if (AAstrasProjectileActor* Proj = GetWorld()->SpawnActor<AAstrasProjectileActor>(ProjectileClass, SpawnLoc, SpreadDir.Rotation(), Params))
				{
					Proj->LaunchProjectile(EProjectileArchetype::Nagastra, SpawnLoc, SpreadDir, this, nullptr, bStealthActive);
				}
			}
		}
		break;
	}

	case EHeroDeityId::Bharat:
		// Dharma-Chakra Cleave & Aegis: wide 360 cleave + self heal
		PerformRadialMeleeStrike(560.0f, MeleeDamage * 1.9f, 800.0f, 140.0f, EProjectileArchetype::Chakra);
		Hp = FMath::Min(MaxHp, Hp + MaxHp * 0.15f);
		break;
	}
}

void AAstrasPlayerCharacter::ExecuteHeroUltimateAbility_Implementation()
{
	if (UltimateCooldownRemaining > 0.0f || AstraEnergy < 65.0f) return;
	AstraEnergy -= 65.0f;
	UltimateCooldownRemaining = UltimateAbilityCooldownSec;

	switch (DeityId)
	{
	case EHeroDeityId::LordRam:
		CastSelectedAstra(EAstraId::Brahmastra);
		break;

	case EHeroDeityId::WarriorHanuman:
		// Ashta-Siddhi Pawan Avatar: colossal scale surge + storm launch
		AvatarSurgeTimerSec = 10.0f;
		SetActorScale3D(FVector(BaseHeroScale * 1.42f));
		PerformRadialMeleeStrike(880.0f, MeleeDamage * 2.8f, 1600.0f, 650.0f, EProjectileArchetype::Vayavyastra);
		break;

	case EHeroDeityId::Lakshman:
		CastSelectedAstra(EAstraId::Vayavyastra);
		CastSelectedAstra(EAstraId::Nagastra);
		break;

	case EHeroDeityId::Bharat:
		// Nandigram Sanctuary Aegis: full vitals restoration + wide knockback shockwave
		RestoreFullVitals();
		PerformRadialMeleeStrike(900.0f, MeleeDamage * 2.2f, 1400.0f, 320.0f, EProjectileArchetype::Varunastra);
		break;
	}
}

void AAstrasPlayerCharacter::PerformRadialMeleeStrike(
	float RadiusCm,
	float DamageAmount,
	float KnockbackCm,
	float LiftCm,
	EProjectileArchetype TagArchetype
)
{
	TArray<FOverlapResult> Overlaps;
	FCollisionQueryParams Params;
	Params.AddIgnoredActor(this);
	GetWorld()->OverlapMultiByChannel(
		Overlaps, GetActorLocation(), FQuat::Identity, ECC_Pawn,
		FCollisionShape::MakeSphere(RadiusCm), Params
	);

	for (const FOverlapResult& Ov : Overlaps)
	{
		if (AAstrasEnemyCharacter* Demon = Cast<AAstrasEnemyCharacter>(Ov.GetActor()))
		{
			const FVector PushDir = (Demon->GetActorLocation() - GetActorLocation()).GetSafeNormal2D();
			Demon->ApplyAstraDamage(DamageAmount, TagArchetype, PushDir * KnockbackCm, LiftCm, 16.0f, 3.0f);
		}
	}
}

void AAstrasPlayerCharacter::CastSelectedAstra(EAstraId AstraId)
{
	const float Cooldown = AstraCooldownRemaining.FindRef(AstraId);
	if (Cooldown > 0.0f) return;

	EProjectileArchetype Archetype = EProjectileArchetype::Agneyastra;
	float EnergyCost = 22.0f;
	switch (AstraId)
	{
	case EAstraId::Agneyastra: Archetype = EProjectileArchetype::Agneyastra; EnergyCost = 22.0f; break;
	case EAstraId::Varunastra: Archetype = EProjectileArchetype::Varunastra; EnergyCost = 22.0f; break;
	case EAstraId::Vayavyastra: Archetype = EProjectileArchetype::Vayavyastra; EnergyCost = 26.0f; break;
	case EAstraId::Nagastra: Archetype = EProjectileArchetype::Nagastra; EnergyCost = 28.0f; break;
	case EAstraId::Brahmastra: Archetype = EProjectileArchetype::Brahmastra; EnergyCost = 65.0f; break;
	}

	if (AstraEnergy < EnergyCost) return;
	AstraEnergy -= EnergyCost;

	const FProjectilePhysicsProfile& Profile = AAstrasProjectileActor::GetPhysicsProfile(Archetype);
	AstraCooldownRemaining.Add(AstraId, Profile.CooldownSec);

	const FVector SpawnLoc = FollowCamera->GetComponentLocation() + FollowCamera->GetForwardVector() * 160.0f;
	const FVector AimDir = FollowCamera->GetForwardVector();
	FActorSpawnParameters Params;
	Params.Owner = this;
	if (AAstrasProjectileActor* Proj = GetWorld()->SpawnActor<AAstrasProjectileActor>(ProjectileClass, SpawnLoc, AimDir.Rotation(), Params))
	{
		Proj->LaunchProjectile(Archetype, SpawnLoc, AimDir, this, nullptr, bStealthActive);
	}
}

void AAstrasPlayerCharacter::ThrowSudarshanChakra()
{
	if (ChakraCooldownRemaining > 0.0f) return;
	const FProjectilePhysicsProfile& Profile = AAstrasProjectileActor::GetPhysicsProfile(EProjectileArchetype::Chakra);
	ChakraCooldownRemaining = Profile.CooldownSec;

	const FVector SpawnLoc = GetActorLocation() + GetActorForwardVector() * 110.0f + FVector(0, 0, 60.0f);
	const FVector AimDir = FollowCamera->GetForwardVector();
	FActorSpawnParameters Params;
	Params.Owner = this;
	if (AAstrasProjectileActor* Proj = GetWorld()->SpawnActor<AAstrasProjectileActor>(ProjectileClass, SpawnLoc, AimDir.Rotation(), Params))
	{
		Proj->LaunchProjectile(EProjectileArchetype::Chakra, SpawnLoc, AimDir, this, nullptr, bStealthActive);
	}
}

bool AAstrasPlayerCharacter::TryBoardNearestMount()
{
	if (MountedVehicle.IsValid()) return false;

	AAstrasMountVehicle* BestMount = nullptr;
	float BestDistSq = FMath::Square(480.0f);

	for (TActorIterator<AAstrasMountVehicle> It(GetWorld()); It; ++It)
	{
		AAstrasMountVehicle* Mount = *It;
		const float DistSq = FVector::DistSquared(GetActorLocation(), Mount->GetActorLocation());
		if (DistSq < BestDistSq && Mount->HasAvailableSeat())
		{
			BestDistSq = DistSq;
			BestMount = Mount;
		}
	}

	if (!BestMount) return false;

	EVehicleSeatIndex AssignedSeat = EVehicleSeatIndex::Unseated;
	if (BestMount->BoardCharacter(this, AssignedSeat))
	{
		MountedVehicle = BestMount;
		CurrentSeat = AssignedSeat;
		GetCharacterMovement()->SetMovementMode(MOVE_None);
		GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		return true;
	}
	return false;
}

void AAstrasPlayerCharacter::DismountVehicle()
{
	if (!MountedVehicle.IsValid()) return;
	MountedVehicle->DismountCharacter(this);
	DetachFromActor(FDetachmentTransformRules::KeepWorldTransform);
	SetActorLocation(MountedVehicle->GetActorLocation() + MountedVehicle->GetActorRightVector() * 190.0f + FVector(0, 0, 80.0f));
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	GetCharacterMovement()->SetMovementMode(MOVE_Walking);
	MountedVehicle = nullptr;
	CurrentSeat = EVehicleSeatIndex::Unseated;
}

void AAstrasPlayerCharacter::SwitchMountSeat()
{
	if (!MountedVehicle.IsValid()) return;
	EVehicleSeatIndex UpdatedSeat = CurrentSeat;
	if (MountedVehicle->SwitchSeat(this, UpdatedSeat))
	{
		CurrentSeat = UpdatedSeat;
	}
}

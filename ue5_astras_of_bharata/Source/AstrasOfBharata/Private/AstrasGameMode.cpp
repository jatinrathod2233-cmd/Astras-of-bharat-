#include "AstrasGameMode.h"
#include "AstrasDevCharacterSwapSubsystem.h"
#include "AstrasLanSubsystem.h"
#include "AstrasMountVehicle.h"
#include "AstrasPlayerCharacter.h"
#include "AstrasPlayerController.h"
#include "AstrasQualitySubsystem.h"
#include "HeroDeityDataAsset.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"

AAstrasGameMode::AAstrasGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	DefaultPawnClass = AAstrasPlayerCharacter::StaticClass();
	PlayerControllerClass = AAstrasPlayerController::StaticClass();
}

void AAstrasGameMode::BeginPlay()
{
	Super::BeginPlay();

	if (UGameInstance* GI = GetGameInstance())
	{
		if (UAstrasDevCharacterSwapSubsystem* SwapSub = GI->GetSubsystem<UAstrasDevCharacterSwapSubsystem>())
		{
			if (DeityRegistryDataAsset)
			{
				SwapSub->RegisterDeityDataAsset(DeityRegistryDataAsset);
			}
			if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
			{
				if (AAstrasPlayerCharacter* Hero = Cast<AAstrasPlayerCharacter>(PC->GetPawn()))
				{
					Hero->ApplyDeityProfile(SwapSub->GetProfileForDeity(SwapSub->GetActiveDeityId()));
				}
			}
		}
	}
}

void AAstrasGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	UGameInstance* GI = GetGameInstance();
	if (!GI) return;

	if (UAstrasQualitySubsystem* QualitySub = GI->GetSubsystem<UAstrasQualitySubsystem>())
	{
		QualitySub->TickPerformanceGovernor(DeltaSeconds);
	}

	LanSyncAccumSec += DeltaSeconds;
	if (LanSyncAccumSec >= AstrasWorldConstants::LanSyncIntervalSec)
	{
		LanSyncAccumSec = 0.0f;
		if (UAstrasLanSubsystem* LanSub = GI->GetSubsystem<UAstrasLanSubsystem>(); LanSub && LanSub->IsConnected())
		{
			if (AAstrasPlayerCharacter* Hero = Cast<AAstrasPlayerCharacter>(UGameplayStatics::GetPlayerCharacter(this, 0)))
			{
				FLanPlayerState State;
				State.PlayerId = Hero->GetName();
				State.HeroId = Hero->GetLanHeroCode();
				State.PositionCm = Hero->GetActorLocation();
				State.YawDeg = Hero->GetActorRotation().Yaw;
				State.HorizontalSpeedMs = Hero->GetVelocity().Size2D() / AstrasWorldConstants::MetersToUnrealUnits;
				State.bGrounded = !Hero->GetCharacterMovement()->IsFalling();
				State.Hp = Hero->GetHp();
				State.MaxHp = Hero->GetMaxHp();
				State.SeatIndex = Hero->GetCurrentSeat();
				if (AAstrasMountVehicle* Mount = Hero->GetMountedVehicle())
				{
					State.MountedVehicleId = Mount->VehicleId;
					State.MountKind = Mount->MountKind;
				}
				LanSub->SendPlayerState(State);
			}
		}
	}
}

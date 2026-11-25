#include "AstrasMountVehicle.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/Character.h"

AAstrasMountVehicle::AAstrasMountVehicle()
{
	PrimaryActorTick.bCanEverTick = true;

	VehicleRoot = CreateDefaultSubobject<USceneComponent>(TEXT("VehicleRoot"));
	RootComponent = VehicleRoot;

	BodyMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("BodyMesh"));
	BodyMesh->SetupAttachment(RootComponent);

	Seat0DriverAnchor = CreateDefaultSubobject<USceneComponent>(TEXT("Seat0DriverAnchor"));
	Seat0DriverAnchor->SetupAttachment(RootComponent);
	Seat0DriverAnchor->SetRelativeLocation(FVector(55.0f, 0.0f, 115.0f));

	Seat1PassengerAnchor = CreateDefaultSubobject<USceneComponent>(TEXT("Seat1PassengerAnchor"));
	Seat1PassengerAnchor->SetupAttachment(RootComponent);
	Seat1PassengerAnchor->SetRelativeLocation(FVector(-65.0f, 0.0f, 115.0f));
}

void AAstrasMountVehicle::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (DriverCharacter.IsValid() && DriverCharacter->IsLocallyControlled())
	{
		const float TargetSpeed = PendingThrottle * MaxSpeedCmPerSec;
		CurrentSpeedCm = FMath::FInterpTo(CurrentSpeedCm, TargetSpeed, DeltaSeconds, 3.2f);
		const float YawDelta = PendingSteer * TurnRateDegPerSec * DeltaSeconds * (FMath::Abs(CurrentSpeedCm) > 25.0f ? 1.0f : 0.4f);

		AddActorLocalRotation(FRotator(0.0f, YawDelta, 0.0f));
		AddActorWorldOffset(GetActorForwardVector() * CurrentSpeedCm * DeltaSeconds, true);
		GaitPhase += (FMath::Abs(CurrentSpeedCm) / 400.0f) * DeltaSeconds;

		PendingThrottle = 0.0f;
		PendingSteer = 0.0f;
	}
	else if (bHasRemoteTarget)
	{
		const FVector CurLoc = GetActorLocation();
		const float DistCm = FVector::Dist(CurLoc, RemoteTargetPosCm);
		// Hard snap only if hopelessly divergent (>22m); smooth exponential damping otherwise to avoid teleporting
		const FVector NextLoc = (DistCm > 2200.0f)
			? RemoteTargetPosCm
			: FMath::VInterpTo(CurLoc, RemoteTargetPosCm, DeltaSeconds, 12.0f);
		const FRotator NextRot = FMath::RInterpTo(GetActorRotation(), FRotator(0.0f, RemoteTargetYawDeg, 0.0f), DeltaSeconds, 12.0f);
		SetActorLocationAndRotation(NextLoc, NextRot);
	}
}

void AAstrasMountVehicle::ApplyDriverThrottle(float ThrottleInput)
{
	PendingThrottle = FMath::Clamp(ThrottleInput, -0.5f, 1.0f);
}

void AAstrasMountVehicle::ApplyDriverSteer(float SteerInput)
{
	PendingSteer = FMath::Clamp(SteerInput, -1.0f, 1.0f);
}

bool AAstrasMountVehicle::BoardCharacter(ACharacter* Rider, EVehicleSeatIndex& OutAssignedSeat)
{
	if (!Rider) return false;

	if (!DriverCharacter.IsValid())
	{
		DriverCharacter = Rider;
		OutAssignedSeat = EVehicleSeatIndex::Driver;
		Rider->AttachToComponent(Seat0DriverAnchor, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
		++AuthoritativeEpoch;
		return true;
	}
	if (!PassengerCharacter.IsValid())
	{
		PassengerCharacter = Rider;
		OutAssignedSeat = EVehicleSeatIndex::Passenger;
		Rider->AttachToComponent(Seat1PassengerAnchor, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
		++AuthoritativeEpoch;
		return true;
	}
	OutAssignedSeat = EVehicleSeatIndex::Unseated;
	return false;
}

void AAstrasMountVehicle::DismountCharacter(ACharacter* Rider)
{
	if (!Rider) return;
	if (DriverCharacter.Get() == Rider)
	{
		DriverCharacter = nullptr;
		++AuthoritativeEpoch;
	}
	if (PassengerCharacter.Get() == Rider)
	{
		PassengerCharacter = nullptr;
		++AuthoritativeEpoch;
	}
}

bool AAstrasMountVehicle::SwitchSeat(ACharacter* Rider, EVehicleSeatIndex& OutNewSeat)
{
	if (!Rider) return false;

	if (DriverCharacter.Get() == Rider && !PassengerCharacter.IsValid())
	{
		DriverCharacter = nullptr;
		PassengerCharacter = Rider;
		OutNewSeat = EVehicleSeatIndex::Passenger;
		Rider->AttachToComponent(Seat1PassengerAnchor, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
		++AuthoritativeEpoch;
		return true;
	}
	if (PassengerCharacter.Get() == Rider && !DriverCharacter.IsValid())
	{
		PassengerCharacter = nullptr;
		DriverCharacter = Rider;
		OutNewSeat = EVehicleSeatIndex::Driver;
		Rider->AttachToComponent(Seat0DriverAnchor, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
		++AuthoritativeEpoch;
		return true;
	}
	return false;
}

void AAstrasMountVehicle::ApplyNetworkVehicleState(const FLanVehicleSyncState& State, double EstimatedLatencySec)
{
	if (State.Seq < LastNetworkSeq && State.Epoch == AuthoritativeEpoch)
	{
		return; // Discard stale/out-of-order UDP/WS packet
	}
	LastNetworkSeq = State.Seq;
	AuthoritativeEpoch = FMath::Max(AuthoritativeEpoch, State.Epoch);

	const float ExtrapSec = FMath::Clamp(static_cast<float>(EstimatedLatencySec), 0.0f, 0.25f);
	RemoteTargetPosCm = State.PositionCm + State.VelocityCm * ExtrapSec;
	RemoteTargetYawDeg = State.YawDeg;
	bHasRemoteTarget = true;
}

FLanVehicleSyncState AAstrasMountVehicle::ExportSyncState() const
{
	FLanVehicleSyncState Out;
	Out.VehicleId = VehicleId;
	Out.Kind = MountKind;
	Out.PositionCm = GetActorLocation();
	Out.YawDeg = GetActorRotation().Yaw;
	Out.PitchDeg = GetActorRotation().Pitch;
	Out.SpeedMs = CurrentSpeedCm / AstrasWorldConstants::MetersToUnrealUnits;
	Out.VelocityCm = GetActorForwardVector() * CurrentSpeedCm;
	Out.GaitPhase = GaitPhase;
	Out.DriverId = DriverCharacter.IsValid() ? DriverCharacter->GetName() : FString();
	Out.PassengerId = PassengerCharacter.IsValid() ? PassengerCharacter->GetName() : FString();
	Out.Epoch = AuthoritativeEpoch;
	Out.Seq = LastNetworkSeq;
	return Out;
}

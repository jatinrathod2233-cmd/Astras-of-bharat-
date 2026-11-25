#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "AstrasTypes.h"
#include "AstrasMountVehicle.generated.h"

class USceneComponent;
class UStaticMeshComponent;
class USkeletalMeshComponent;

/**
 * Multi-passenger Mount / Vehicle supporting EXACTLY two players (Driver = Seat 0, Passenger = Seat 1)
 * for Royal Ratha Chariots, Ashva Warhorses, and Gaja War Elephants.
 * Includes epoch/seq seat arbitration and dead-reckoning smoothing for LAN multiplayer.
 */
UCLASS()
class ASTRASOFBHARATA_API AAstrasMountVehicle : public APawn
{
	GENERATED_BODY()

public:
	AAstrasMountVehicle();

	virtual void Tick(float DeltaSeconds) override;

	UFUNCTION(BlueprintPure, Category = "Astras|Vehicle")
	bool HasAvailableSeat() const { return !DriverCharacter.IsValid() || !PassengerCharacter.IsValid(); }

	UFUNCTION(BlueprintCallable, Category = "Astras|Vehicle")
	bool BoardCharacter(ACharacter* Rider, EVehicleSeatIndex& OutAssignedSeat);

	UFUNCTION(BlueprintCallable, Category = "Astras|Vehicle")
	void DismountCharacter(ACharacter* Rider);

	UFUNCTION(BlueprintCallable, Category = "Astras|Vehicle")
	bool SwitchSeat(ACharacter* Rider, EVehicleSeatIndex& OutNewSeat);

	void ApplyDriverThrottle(float ThrottleInput);
	void ApplyDriverSteer(float SteerInput);

	/** Applies remote LAN vehicle snapshot with latency dead-reckoning & prevents teleport desyncs */
	UFUNCTION(BlueprintCallable, Category = "Astras|Vehicle|Network")
	void ApplyNetworkVehicleState(const FLanVehicleSyncState& State, double EstimatedLatencySec);

	FLanVehicleSyncState ExportSyncState() const;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vehicle")
	FString VehicleId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vehicle")
	EMountKind MountKind = EMountKind::Ratha;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vehicle")
	float MaxSpeedCmPerSec = 1850.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vehicle")
	float TurnRateDegPerSec = 68.0f;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
	TObjectPtr<USceneComponent> VehicleRoot;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
	TObjectPtr<UStaticMeshComponent> BodyMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
	TObjectPtr<USceneComponent> Seat0DriverAnchor;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
	TObjectPtr<USceneComponent> Seat1PassengerAnchor;

private:
	TWeakObjectPtr<ACharacter> DriverCharacter;
	TWeakObjectPtr<ACharacter> PassengerCharacter;

	float PendingThrottle = 0.0f;
	float PendingSteer = 0.0f;
	float CurrentSpeedCm = 0.0f;
	float GaitPhase = 0.0f;
	int32 AuthoritativeEpoch = 0;
	int32 LastNetworkSeq = 0;

	bool bHasRemoteTarget = false;
	FVector RemoteTargetPosCm = FVector::ZeroVector;
	float RemoteTargetYawDeg = 0.0f;
};

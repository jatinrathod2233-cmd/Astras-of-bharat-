#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "AstrasTypes.h"
#include "AstrasLanSubsystem.generated.h"

class IWebSocket;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnLanVehicleAck, const FString&, VehicleId, bool, bAccepted);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnLanWorldSnapshotReceived, int32, SnapshotSeq);

/**
 * Offline Wi-Fi / LAN Multiplayer Client Subsystem:
 * Connects cleanly to the existing Astras of Bharat LAN room protocol (CREATE_ROOM, HELLO, WELCOME,
 * PLAYER_STATE 20Hz, VEHICLE_ACTION / VEHICLE_ACTION_ACK, WORLD_SNAPSHOT, PING/PONG RTT).
 */
UCLASS()
class ASTRASOFBHARATA_API UAstrasLanSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "Astras|LAN")
	void ConnectToLanServer(const FString& WebSocketUrl, const FString& RoomCode, const FString& PlayerName, const FString& HeroId);

	UFUNCTION(BlueprintCallable, Category = "Astras|LAN")
	void DisconnectLan();

	UFUNCTION(BlueprintCallable, Category = "Astras|LAN")
	void SendPlayerState(const FLanPlayerState& State);

	UFUNCTION(BlueprintCallable, Category = "Astras|LAN")
	void SendVehicleAction(const FString& VehicleId, const FString& ActionKind, EVehicleSeatIndex PreferredSeat);

	UFUNCTION(BlueprintPure, Category = "Astras|LAN")
	double GetEstimatedRttMs() const { return SmoothedRttMs; }

	UFUNCTION(BlueprintPure, Category = "Astras|LAN")
	bool IsConnected() const;

	UPROPERTY(BlueprintAssignable, Category = "Astras|LAN")
	FOnLanVehicleAck OnLanVehicleAck;

	UPROPERTY(BlueprintAssignable, Category = "Astras|LAN")
	FOnLanWorldSnapshotReceived OnWorldSnapshotReceived;

private:
	TSharedPtr<IWebSocket> Socket;
	FString LocalPlayerId;
	double SmoothedRttMs = 0.0;
	int32 OutboundSeq = 0;

	void HandleRawMessage(const FString& MessageJson);
};

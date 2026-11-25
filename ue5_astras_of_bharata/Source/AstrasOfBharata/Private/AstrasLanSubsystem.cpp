#include "AstrasLanSubsystem.h"
#include "AstrasOfBharata.h"
#include "IWebSocket.h"
#include "WebSocketsModule.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

void UAstrasLanSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	FModuleManager::Get().LoadModuleChecked(TEXT("WebSockets"));
}

void UAstrasLanSubsystem::Deinitialize()
{
	DisconnectLan();
	Super::Deinitialize();
}

void UAstrasLanSubsystem::ConnectToLanServer(
	const FString& WebSocketUrl,
	const FString& RoomCode,
	const FString& PlayerName,
	const FString& HeroId
)
{
	DisconnectLan();

	Socket = FWebSocketsModule::Get().CreateWebSocket(WebSocketUrl);
	if (!Socket.IsValid()) return;

	Socket->OnConnected().AddWeakLambda(this, [this, RoomCode, PlayerName, HeroId]()
	{
		TSharedRef<FJsonObject> Hello = MakeShared<FJsonObject>();
		Hello->SetStringField(TEXT("type"), TEXT("HELLO"));
		Hello->SetStringField(TEXT("roomCode"), RoomCode);
		Hello->SetStringField(TEXT("playerName"), PlayerName);
		Hello->SetStringField(TEXT("heroId"), HeroId);

		FString Payload;
		TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Payload);
		FJsonSerializer::Serialize(Hello, Writer);
		if (Socket.IsValid() && Socket->IsConnected())
		{
			Socket->Send(Payload);
		}
	});

	Socket->OnMessage().AddWeakLambda(this, [this](const FString& Msg)
	{
		HandleRawMessage(Msg);
	});

	Socket->OnConnectionError().AddWeakLambda(this, [](const FString& Error)
	{
		UE_LOG(LogAstrasOfBharata, Warning, TEXT("LAN WebSocket error: %s"), *Error);
	});

	Socket->Connect();
}

void UAstrasLanSubsystem::DisconnectLan()
{
	if (Socket.IsValid())
	{
		Socket->Close();
		Socket.Reset();
	}
}

bool UAstrasLanSubsystem::IsConnected() const
{
	return Socket.IsValid() && Socket->IsConnected();
}

void UAstrasLanSubsystem::SendPlayerState(const FLanPlayerState& State)
{
	if (!IsConnected()) return;

	TSharedRef<FJsonObject> StateObj = MakeShared<FJsonObject>();
	StateObj->SetStringField(TEXT("id"), LocalPlayerId.IsEmpty() ? State.PlayerId : LocalPlayerId);
	StateObj->SetNumberField(TEXT("x"), State.PositionCm.X / AstrasWorldConstants::MetersToUnrealUnits);
	StateObj->SetNumberField(TEXT("y"), State.PositionCm.Z / AstrasWorldConstants::MetersToUnrealUnits);
	StateObj->SetNumberField(TEXT("z"), State.PositionCm.Y / AstrasWorldConstants::MetersToUnrealUnits);
	StateObj->SetNumberField(TEXT("yaw"), FMath::DegreesToRadians(State.YawDeg));
	StateObj->SetNumberField(TEXT("horizSpeed"), State.HorizontalSpeedMs);
	StateObj->SetBoolField(TEXT("grounded"), State.bGrounded);
	StateObj->SetBoolField(TEXT("aiming"), State.bAiming);
	StateObj->SetBoolField(TEXT("stealth"), State.bStealth);
	StateObj->SetBoolField(TEXT("sprint"), State.bSprint);
	StateObj->SetStringField(TEXT("mountedVehicleId"), State.MountedVehicleId);
	StateObj->SetNumberField(TEXT("seq"), ++OutboundSeq);

	TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("type"), TEXT("PLAYER_STATE"));
	Root->SetObjectField(TEXT("state"), StateObj);

	FString Payload;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Payload);
	FJsonSerializer::Serialize(Root, Writer);
	Socket->Send(Payload);
}

void UAstrasLanSubsystem::SendVehicleAction(const FString& VehicleId, const FString& ActionKind, EVehicleSeatIndex PreferredSeat)
{
	if (!IsConnected()) return;

	TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("type"), TEXT("VEHICLE_ACTION"));
	Root->SetStringField(TEXT("actionId"), FGuid::NewGuid().ToString(EGuidFormats::Digits));
	Root->SetStringField(TEXT("playerId"), LocalPlayerId);
	Root->SetStringField(TEXT("vehicleId"), VehicleId);
	Root->SetStringField(TEXT("action"), ActionKind);
	if (PreferredSeat != EVehicleSeatIndex::Unseated)
	{
		Root->SetNumberField(TEXT("preferredSeat"), static_cast<int32>(PreferredSeat));
	}
	Root->SetNumberField(TEXT("seq"), ++OutboundSeq);

	FString Payload;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Payload);
	FJsonSerializer::Serialize(Root, Writer);
	Socket->Send(Payload);
}

void UAstrasLanSubsystem::HandleRawMessage(const FString& MessageJson)
{
	TSharedPtr<FJsonObject> Root;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(MessageJson);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return;

	const FString Type = Root->GetStringField(TEXT("type"));
	if (Type == TEXT("WELCOME"))
	{
		LocalPlayerId = Root->GetStringField(TEXT("yourPlayerId"));
	}
	else if (Type == TEXT("VEHICLE_ACTION_ACK"))
	{
		const FString VehicleId = Root->GetStringField(TEXT("vehicleId"));
		const bool bAccepted = Root->GetBoolField(TEXT("accepted"));
		OnLanVehicleAck.Broadcast(VehicleId, bAccepted);
	}
	else if (Type == TEXT("WORLD_SNAPSHOT"))
	{
		if (const TSharedPtr<FJsonObject>* SnapObj = nullptr; Root->TryGetObjectField(TEXT("snapshot"), SnapObj) && SnapObj)
		{
			const int32 Seq = (*SnapObj)->GetIntegerField(TEXT("snapshotSeq"));
			OnWorldSnapshotReceived.Broadcast(Seq);
		}
	}
	else if (Type == TEXT("PONG"))
	{
		const double SentTs = Root->GetNumberField(TEXT("ts"));
		const double NowMs = FPlatformTime::Seconds() * 1000.0;
		const double SampleRtt = FMath::Max(1.0, NowMs - SentTs);
		SmoothedRttMs = SmoothedRttMs <= 0.0 ? SampleRtt : FMath::Lerp(SmoothedRttMs, SampleRtt, 0.25);
	}
}

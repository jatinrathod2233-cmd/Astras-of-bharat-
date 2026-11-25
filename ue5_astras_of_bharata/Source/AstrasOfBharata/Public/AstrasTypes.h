#pragma once

#include "CoreMinimal.h"
#include "AstrasTypes.generated.h"

/**
 * Coordinates mirror the original web engine (converted to UE centimeters: 1 m = 100 uu).
 * Original world: Ayodhya Royal Citadel at (0,0) -> 2,500m East -> Volcanic Demon Village at (2500m, 0).
 */
namespace AstrasWorldConstants
{
	inline constexpr float MetersToUnrealUnits = 100.0f;
	inline constexpr float RiverCenterXM = 46.0f;
	inline constexpr float RiverHalfWidthM = 14.5f;
	inline constexpr float DemonVillageCenterXM = 2500.0f;
	inline constexpr float DemonVillageCenterZM = 0.0f;
	inline constexpr int32 MaxLanPlayers = 6;
	inline constexpr int32 LanTcpPort = 38472;
	inline constexpr float LanSyncIntervalSec = 0.05f; // 20 Hz state sync
	inline constexpr float PostSharpenDefault = 0.38f; // 35-40% smoothed post-processing sharpness
}

UENUM(BlueprintType)
enum class EAstraId : uint8
{
	Agneyastra UMETA(DisplayName = "Agneyastra (Sacred Fire)"),
	Varunastra UMETA(DisplayName = "Varunastra (Endless Oceans)"),
	Vayavyastra UMETA(DisplayName = "Vayavyastra (Tempest)"),
	Nagastra UMETA(DisplayName = "Nagastra (Serpent Coils)"),
	Brahmastra UMETA(DisplayName = "Brahmastra (Celestial Lotus)")
};

UENUM(BlueprintType)
enum class EProjectileArchetype : uint8
{
	Arrow,
	Chakra,
	Agneyastra,
	Varunastra,
	Vayavyastra,
	Nagastra,
	NagastraSerpent,
	Brahmastra
};

UENUM(BlueprintType)
enum class EProjectilePhysicsCategory : uint8
{
	BallisticArrow,
	EnergyGyroscopic,
	EnergyBeam,
	ElementalFire,
	ElementalWater,
	ElementalWind,
	ElementalSerpent
};

UENUM(BlueprintType)
enum class EDemonVariant : uint8
{
	BoarDemon,
	RabbitDemon,
	BruteHuman,
	SorcererHuman,
	ShadowGhost
};

UENUM(BlueprintType)
enum class EMountKind : uint8
{
	None,
	Ratha,
	Horse,
	Elephant
};

UENUM(BlueprintType)
enum class EAstrasQualityTier : uint8
{
	Low,
	Medium,
	High
};

UENUM(BlueprintType)
enum class EVehicleSeatIndex : uint8
{
	Driver = 0,
	Passenger = 1,
	Unseated = 255
};

UENUM(BlueprintType)
enum class EHeroDeityId : uint8
{
	LordRam UMETA(DisplayName = "Lord Ram"),
	WarriorHanuman UMETA(DisplayName = "Warrior Hanuman"),
	Lakshman UMETA(DisplayName = "Lakshman"),
	Bharat UMETA(DisplayName = "Bharat")
};

class AAstrasPlayerCharacter;
class USkeletalMesh;
class UStaticMesh;
class UAnimInstance;
class UNiagaraSystem;
class UTexture2D;

USTRUCT(BlueprintType)
struct FHeroDeityProfile
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Identity")
	EHeroDeityId DeityId = EHeroDeityId::LordRam;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Identity")
	FString DisplayName = TEXT("Lord Ram");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Identity")
	FString SanskritTitle = TEXT("Maryada Purushottam");

	/** Matches shared LAN protocol IDs: RAM, HANUMAN, LAKSHMAN, BHARAT */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Identity")
	FString LanHeroCode = TEXT("RAM");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Identity")
	FLinearColor AccentColor = FLinearColor(0.96f, 0.76f, 0.26f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat")
	FString PrimaryAbilityName = TEXT("Surya-Agni Blade Wave");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat")
	FString UltimateAbilityName = TEXT("Kodanda Brahmastra Rain");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float MaxHp = 1000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float MaxAstraEnergy = 500.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float BaseWalkSpeed = 620.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float SprintSpeed = 1050.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float JumpZVelocity = 520.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float MeleeDamage = 75.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float HeroScale = 1.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float PrimaryCooldownSec = 4.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float UltimateCooldownSec = 18.0f;

	/** Optional UE5 Blueprint subclass (e.g., BP_Hero_WarriorHanuman) for real-time Actor swapping */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PhotorealisticAssets")
	TSubclassOf<AAstrasPlayerCharacter> BlueprintCharacterClass;

	/** Photorealistic skeletal character mesh (rigged to UE5 Mannequin / custom skeleton + Chaos Cloth cape) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PhotorealisticAssets")
	TSoftObjectPtr<USkeletalMesh> CharacterSkeletalMesh;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PhotorealisticAssets")
	TSubclassOf<UAnimInstance> AnimBlueprintClass;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PhotorealisticAssets")
	TSoftObjectPtr<UStaticMesh> PrimaryWeaponMesh;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PhotorealisticAssets")
	TSoftObjectPtr<UStaticMesh> SecondaryWeaponMesh;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PhotorealisticAssets")
	TSoftObjectPtr<UNiagaraSystem> SignatureAuraVfx;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PhotorealisticAssets")
	TSoftObjectPtr<UTexture2D> PortraitTexture;
};

USTRUCT(BlueprintType)
struct FAstraPowerConfig
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	EAstraId Id = EAstraId::Agneyastra;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FString DisplayName;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FString SanskritTitle;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float Damage = 86.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float SplashDamage = 74.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float DotDamagePerSec = 18.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float EffectDurationSec = 4.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float RadiusM = 8.2f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float ProjectileSpeedMs = 46.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float CooldownSec = 4.5f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float EnergyCost = 22.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float KnockbackForce = 5.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	float LiftHeightM = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	int32 SplitCount = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FLinearColor PrimaryColor = FLinearColor(1.0f, 0.42f, 0.1f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite)
	FLinearColor SecondaryColor = FLinearColor(1.0f, 0.78f, 0.29f, 1.0f);
};

USTRUCT(BlueprintType)
struct FLanVehicleSyncState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite)
	FString VehicleId;

	UPROPERTY(BlueprintReadWrite)
	EMountKind Kind = EMountKind::Ratha;

	UPROPERTY(BlueprintReadWrite)
	FVector PositionCm = FVector::ZeroVector;

	UPROPERTY(BlueprintReadWrite)
	float YawDeg = 0.0f;

	UPROPERTY(BlueprintReadWrite)
	float PitchDeg = 0.0f;

	UPROPERTY(BlueprintReadWrite)
	float SpeedMs = 0.0f;

	UPROPERTY(BlueprintReadWrite)
	FVector VelocityCm = FVector::ZeroVector;

	UPROPERTY(BlueprintReadWrite)
	float GaitPhase = 0.0f;

	UPROPERTY(BlueprintReadWrite)
	FString DriverId;

	UPROPERTY(BlueprintReadWrite)
	FString PassengerId;

	UPROPERTY(BlueprintReadWrite)
	int32 Epoch = 0;

	UPROPERTY(BlueprintReadWrite)
	int32 Seq = 0;
};

USTRUCT(BlueprintType)
struct FLanPlayerState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite)
	FString PlayerId;

	UPROPERTY(BlueprintReadWrite)
	FString PlayerName;

	UPROPERTY(BlueprintReadWrite)
	FString HeroId = TEXT("RAM");

	UPROPERTY(BlueprintReadWrite)
	FVector PositionCm = FVector::ZeroVector;

	UPROPERTY(BlueprintReadWrite)
	float YawDeg = 0.0f;

	UPROPERTY(BlueprintReadWrite)
	float HorizontalSpeedMs = 0.0f;

	UPROPERTY(BlueprintReadWrite)
	bool bGrounded = true;

	UPROPERTY(BlueprintReadWrite)
	bool bAiming = false;

	UPROPERTY(BlueprintReadWrite)
	bool bStealth = false;

	UPROPERTY(BlueprintReadWrite)
	bool bSprint = false;

	UPROPERTY(BlueprintReadWrite)
	EMountKind MountKind = EMountKind::None;

	UPROPERTY(BlueprintReadWrite)
	FString MountedVehicleId;

	UPROPERTY(BlueprintReadWrite)
	EVehicleSeatIndex SeatIndex = EVehicleSeatIndex::Unseated;

	UPROPERTY(BlueprintReadWrite)
	float Hp = 1000.0f;

	UPROPERTY(BlueprintReadWrite)
	float MaxHp = 1000.0f;

	UPROPERTY(BlueprintReadWrite)
	int32 Seq = 0;

	UPROPERTY(BlueprintReadWrite)
	double SentAtMs = 0.0;
};

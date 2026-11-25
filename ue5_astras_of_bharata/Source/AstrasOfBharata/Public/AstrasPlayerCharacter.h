#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "AstrasTypes.h"
#include "AstrasPlayerCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UStaticMeshComponent;
class UNiagaraComponent;
class AAstrasMountVehicle;
class AAstrasProjectileActor;

/**
 * Playable Deity Hero Base Class (Blueprintable: BP_Hero_LordRam, BP_Hero_WarriorHanuman,
 * BP_Hero_Lakshman, BP_Hero_Bharat).
 * Supports photorealistic rigged SkeletalMeshes + Chaos Cloth silk cape/dhoti, distinct weapons
 * & combat abilities, and seamless real-time Dev-Menu character swapping preserving world state
 * and 2-player mount seats.
 */
UCLASS(Blueprintable, BlueprintType)
class ASTRASOFBHARATA_API AAstrasPlayerCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AAstrasPlayerCharacter();

	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	/** Applies photorealistic mesh, AnimBP, weapon meshes, stats, and scaling from a Deity Profile */
	UFUNCTION(BlueprintCallable, Category = "Astras|HeroSwap")
	void ApplyDeityProfile(const FHeroDeityProfile& Profile);

	/** Transfers HP ratio, Astra energy ratio, stealth, velocity, and 2-seat vehicle ownership during live swap */
	void SyncRuntimeStateFrom(AAstrasPlayerCharacter* PreviousHero);

	UFUNCTION(BlueprintCallable, Category = "Astras|Combat")
	void FireStandardArrowOrSwordSlash();

	/** Deity-unique Primary Ability (overrideable in Blueprint via BlueprintNativeEvent) */
	UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category = "Astras|Combat")
	void ExecuteHeroPrimaryAbility();
	virtual void ExecuteHeroPrimaryAbility_Implementation();

	/** Deity-unique Ultimate Ability (overrideable in Blueprint via BlueprintNativeEvent) */
	UFUNCTION(BlueprintCallable, BlueprintNativeEvent, Category = "Astras|Combat")
	void ExecuteHeroUltimateAbility();
	virtual void ExecuteHeroUltimateAbility_Implementation();

	UFUNCTION(BlueprintCallable, Category = "Astras|Combat")
	void CastSelectedAstra(EAstraId AstraId);

	UFUNCTION(BlueprintCallable, Category = "Astras|Combat")
	void ThrowSudarshanChakra();

	UFUNCTION(BlueprintCallable, Category = "Astras|Mount")
	bool TryBoardNearestMount();

	UFUNCTION(BlueprintCallable, Category = "Astras|Mount")
	void DismountVehicle();

	UFUNCTION(BlueprintCallable, Category = "Astras|Mount")
	void SwitchMountSeat();

	UFUNCTION(BlueprintCallable, Category = "Astras|Movement")
	void SetSprinting(bool bEnableSprint);

	UFUNCTION(BlueprintCallable, Category = "Astras|Movement")
	void ToggleStealth();

	UFUNCTION(BlueprintCallable, Category = "Astras|Movement")
	void ToggleHanumanFlight();

	UFUNCTION(BlueprintCallable, Category = "Astras|Stats")
	void RestoreFullVitals();

	UFUNCTION(BlueprintPure, Category = "Astras|Identity")
	EHeroDeityId GetDeityId() const { return DeityId; }

	UFUNCTION(BlueprintPure, Category = "Astras|Identity")
	FString GetLanHeroCode() const { return LanHeroCode; }

	UFUNCTION(BlueprintPure, Category = "Astras|Stats")
	float GetHp() const { return Hp; }

	UFUNCTION(BlueprintPure, Category = "Astras|Stats")
	float GetMaxHp() const { return MaxHp; }

	UFUNCTION(BlueprintPure, Category = "Astras|Stats")
	float GetAstraEnergy() const { return AstraEnergy; }

	UFUNCTION(BlueprintPure, Category = "Astras|Stats")
	float GetMaxAstraEnergy() const { return MaxAstraEnergy; }

	UFUNCTION(BlueprintPure, Category = "Astras|Mount")
	AAstrasMountVehicle* GetMountedVehicle() const { return MountedVehicle.Get(); }

	UFUNCTION(BlueprintPure, Category = "Astras|Mount")
	EVehicleSeatIndex GetCurrentSeat() const { return CurrentSeat; }

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	TObjectPtr<UCameraComponent> FollowCamera;

	/** Primary right-hand weapon (Fiery Sword / Hanuman Vajra Gada / Twin Blade / Dharma Halberd) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Equipment")
	TObjectPtr<UStaticMeshComponent> FierySwordMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Equipment")
	TObjectPtr<UNiagaraComponent> SwordFlameVfx;

	/** Secondary left-hand weapon (Sharnga Bow / Seshanaga Bow / Royal Shield) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Equipment")
	TObjectPtr<UStaticMeshComponent> SharngaBowMesh;

	/** Ambient divine aura around the deity character */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "VFX")
	TObjectPtr<UNiagaraComponent> SignatureAuraVfx;

	UPROPERTY(EditDefaultsOnly, Category = "Combat")
	TSubclassOf<AAstrasProjectileActor> ProjectileClass;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Identity")
	EHeroDeityId DeityId = EHeroDeityId::LordRam;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Identity")
	FString LanHeroCode = TEXT("RAM");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float Hp = 1000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float MaxHp = 1000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float AstraEnergy = 500.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float MaxAstraEnergy = 500.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float BaseWalkSpeed = 620.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float SprintSpeed = 1050.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float MeleeDamage = 80.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float PrimaryAbilityCooldownSec = 4.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	float UltimateAbilityCooldownSec = 18.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
	int32 HeroLevel = 10;

private:
	UPROPERTY()
	TWeakObjectPtr<AAstrasMountVehicle> MountedVehicle;

	EVehicleSeatIndex CurrentSeat = EVehicleSeatIndex::Unseated;
	bool bIsSprinting = false;
	bool bStealthActive = false;
	bool bIsFlying = false;
	TMap<EAstraId, float> AstraCooldownRemaining;
	float ChakraCooldownRemaining = 0.0f;
	float PrimaryCooldownRemaining = 0.0f;
	float UltimateCooldownRemaining = 0.0f;
	float AvatarSurgeTimerSec = 0.0f;
	float BaseHeroScale = 1.0f;

	void MoveForwardInput(float Value);
	void MoveRightInput(float Value);
	void LookYawInput(float Value);
	void LookPitchInput(float Value);
	void PerformRadialMeleeStrike(float RadiusCm, float DamageAmount, float KnockbackCm, float LiftCm, EProjectileArchetype TagArchetype);
};

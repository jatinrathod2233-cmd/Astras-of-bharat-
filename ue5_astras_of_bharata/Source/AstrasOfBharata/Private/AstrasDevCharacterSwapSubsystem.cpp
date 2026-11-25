#include "AstrasDevCharacterSwapSubsystem.h"
#include "AstrasOfBharata.h"
#include "AstrasPlayerCharacter.h"
#include "HeroDeityDataAsset.h"
#include "GameFramework/PlayerController.h"
#include "NiagaraFunctionLibrary.h"
#include "NiagaraSystem.h"

void UAstrasDevCharacterSwapSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	CachedProfiles = UHeroDeityDataAsset::BuildDefaultDeityProfiles();
}

void UAstrasDevCharacterSwapSubsystem::RegisterDeityDataAsset(UHeroDeityDataAsset* DataAsset)
{
	if (!DataAsset || DataAsset->DeityProfiles.IsEmpty()) return;
	CachedProfiles = DataAsset->DeityProfiles;
}

void UAstrasDevCharacterSwapSubsystem::RegisterDeityBlueprintClass(EHeroDeityId DeityId, TSubclassOf<AAstrasPlayerCharacter> BlueprintClass)
{
	for (FHeroDeityProfile& Entry : CachedProfiles)
	{
		if (Entry.DeityId == DeityId)
		{
			Entry.BlueprintCharacterClass = BlueprintClass;
			break;
		}
	}
}

FHeroDeityProfile UAstrasDevCharacterSwapSubsystem::GetProfileForDeity(EHeroDeityId DeityId) const
{
	for (const FHeroDeityProfile& Entry : CachedProfiles)
	{
		if (Entry.DeityId == DeityId)
		{
			return Entry;
		}
	}
	return CachedProfiles.IsEmpty() ? FHeroDeityProfile() : CachedProfiles[0];
}

bool UAstrasDevCharacterSwapSubsystem::SwapActiveDeity(APlayerController* PlayerController, EHeroDeityId NewDeityId)
{
	if (!PlayerController || !PlayerController->GetWorld()) return false;

	AAstrasPlayerCharacter* CurrentHero = Cast<AAstrasPlayerCharacter>(PlayerController->GetPawn());
	const FHeroDeityProfile Profile = GetProfileForDeity(NewDeityId);

	const FTransform SpawnTransform = CurrentHero ? CurrentHero->GetActorTransform() : FTransform::Identity;
	const FRotator SavedControlRot = PlayerController->GetControlRotation();
	UWorld* World = PlayerController->GetWorld();

	// Spawn celestial transformation burst at the hero's world location
	if (!Profile.SignatureAuraVfx.IsNull())
	{
		if (UNiagaraSystem* SwapVfx = Profile.SignatureAuraVfx.LoadSynchronous())
		{
			UNiagaraFunctionLibrary::SpawnSystemAtLocation(World, SwapVfx, SpawnTransform.GetLocation());
		}
	}

	// Mode A: Full Blueprint Actor Swap (if BP_Hero_* subclass is assigned and differs from current class)
	if (Profile.BlueprintCharacterClass && (!CurrentHero || CurrentHero->GetClass() != Profile.BlueprintCharacterClass))
	{
		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

		AAstrasPlayerCharacter* NewHero = World->SpawnActor<AAstrasPlayerCharacter>(
			Profile.BlueprintCharacterClass,
			SpawnTransform.GetLocation(),
			SpawnTransform.GetRotation().Rotator(),
			SpawnParams
		);

		if (NewHero)
		{
			NewHero->ApplyDeityProfile(Profile);
			if (CurrentHero)
			{
				NewHero->SyncRuntimeStateFrom(CurrentHero);
			}

			PlayerController->Possess(NewHero);
			PlayerController->SetControlRotation(SavedControlRot);

			if (CurrentHero)
			{
				CurrentHero->Destroy();
			}

			ActiveDeityId = NewDeityId;
			OnDeitySwapped.Broadcast(NewDeityId, Profile);
			UE_LOG(LogAstrasOfBharata, Log, TEXT("DevSwap: Possessed Blueprint Deity %s"), *Profile.DisplayName);
			return true;
		}
	}

	// Mode B: Zero-hitch In-Place Swap (re-applies photorealistic skeletal mesh, AnimBP, weapons, and combat kit)
	if (CurrentHero)
	{
		CurrentHero->ApplyDeityProfile(Profile);
		ActiveDeityId = NewDeityId;
		OnDeitySwapped.Broadcast(NewDeityId, Profile);
		UE_LOG(LogAstrasOfBharata, Log, TEXT("DevSwap: Morphed in-place to Deity %s"), *Profile.DisplayName);
		return true;
	}

	return false;
}

bool UAstrasDevCharacterSwapSubsystem::CycleNextDeity(APlayerController* PlayerController)
{
	static const EHeroDeityId Order[] = {
		EHeroDeityId::LordRam,
		EHeroDeityId::WarriorHanuman,
		EHeroDeityId::Lakshman,
		EHeroDeityId::Bharat
	};

	int32 CurrentIdx = 0;
	for (int32 i = 0; i < 4; ++i)
	{
		if (Order[i] == ActiveDeityId)
		{
			CurrentIdx = i;
			break;
		}
	}

	const EHeroDeityId NextId = Order[(CurrentIdx + 1) % 4];
	return SwapActiveDeity(PlayerController, NextId);
}

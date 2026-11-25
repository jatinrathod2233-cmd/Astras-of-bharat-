#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "AstrasTypes.h"
#include "AstrasPlayerController.generated.h"

class UAstrasDevMenuWidget;

/**
 * PlayerController managing seamless Dev Menu toggling (F8 / HUD button),
 * quick real-time Deity Swap hotkeys (1-4), and hero ability triggers.
 */
UCLASS(Blueprintable)
class ASTRASOFBHARATA_API AAstrasPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AAstrasPlayerController();

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void ToggleDevMenu();

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void SetDevMenuOpen(bool bOpen);

	UFUNCTION(BlueprintCallable, Category = "Astras|DevSwap")
	void RequestDeitySwap(EHeroDeityId NewDeityId);

	UFUNCTION(BlueprintCallable, Category = "Astras|DevSwap")
	void CycleNextDeity();

	UFUNCTION(BlueprintPure, Category = "Astras|DevMenu")
	bool IsDevMenuOpen() const { return bDevMenuOpen; }

protected:
	virtual void BeginPlay() override;
	virtual void SetupInputComponent() override;

	/** Assign WBP_DevCharacterMenu in Blueprint GameMode/Controller, or falls back to UAstrasDevMenuWidget Slate UI */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "UI")
	TSubclassOf<UAstrasDevMenuWidget> DevMenuWidgetClass;

private:
	UPROPERTY()
	TObjectPtr<UAstrasDevMenuWidget> DevMenuInstance;

	bool bDevMenuOpen = false;

	void SwapToRamKey() { RequestDeitySwap(EHeroDeityId::LordRam); }
	void SwapToHanumanKey() { RequestDeitySwap(EHeroDeityId::WarriorHanuman); }
	void SwapToLakshmanKey() { RequestDeitySwap(EHeroDeityId::Lakshman); }
	void SwapToBharatKey() { RequestDeitySwap(EHeroDeityId::Bharat); }
	void TriggerPrimaryAbilityKey();
	void TriggerUltimateAbilityKey();
};

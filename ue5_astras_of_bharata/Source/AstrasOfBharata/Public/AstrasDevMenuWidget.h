#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "AstrasTypes.h"
#include "AstrasDevMenuWidget.generated.h"

class UTextBlock;
class STextBlock;

/**
 * Interactive 'Dev' Menu for Real-Time Deity Selection & QA Testing:
 * Works both out-of-the-box via a crisp C++ Slate overlay fallback AND as a Blueprint base
 * class (WBP_DevCharacterMenu) with BlueprintCallable swap/quality/spawn commands.
 */
UCLASS(Blueprintable)
class ASTRASOFBHARATA_API UAstrasDevMenuWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void SelectDeity(EHeroDeityId DeityId);

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void SelectLordRam() { SelectDeity(EHeroDeityId::LordRam); }

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void SelectWarriorHanuman() { SelectDeity(EHeroDeityId::WarriorHanuman); }

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void SelectLakshman() { SelectDeity(EHeroDeityId::Lakshman); }

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void SelectBharat() { SelectDeity(EHeroDeityId::Bharat); }

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void SetQualityTier(EAstrasQualityTier Tier);

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void RestoreHeroVitals();

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void SpawnTestDemonGroup();

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void RefreshActiveStatusLabels();

	UFUNCTION(BlueprintCallable, Category = "Astras|DevMenu")
	void CloseDevMenu();

protected:
	virtual void NativeConstruct() override;
	virtual TSharedRef<SWidget> RebuildWidget() override;

	UPROPERTY(meta = (BindWidgetOptional))
	TObjectPtr<UTextBlock> TextActiveDeity;

	UPROPERTY(meta = (BindWidgetOptional))
	TObjectPtr<UTextBlock> TextAbilities;

	UPROPERTY(meta = (BindWidgetOptional))
	TObjectPtr<UTextBlock> TextQualityStatus;

private:
	TSharedPtr<STextBlock> SlateStatusText;
	TSharedPtr<STextBlock> SlateAbilitiesText;
	TSharedPtr<STextBlock> SlateQualityText;

	FReply HandleSlateDeityClick(EHeroDeityId DeityId);
	FReply HandleSlateQualityClick(EAstrasQualityTier Tier);
	FReply HandleSlateRestoreClick();
	FReply HandleSlateSpawnDemonsClick();
	FReply HandleSlateCloseClick();
};

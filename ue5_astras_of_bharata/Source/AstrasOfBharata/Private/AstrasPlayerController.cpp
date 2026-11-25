#include "AstrasPlayerController.h"
#include "AstrasDevCharacterSwapSubsystem.h"
#include "AstrasDevMenuWidget.h"
#include "AstrasPlayerCharacter.h"
#include "Blueprint/UserWidget.h"
#include "InputCoreTypes.h"

AAstrasPlayerController::AAstrasPlayerController()
{
	DevMenuWidgetClass = UAstrasDevMenuWidget::StaticClass();
}

void AAstrasPlayerController::BeginPlay()
{
	Super::BeginPlay();
}

void AAstrasPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	if (!InputComponent) return;

	InputComponent->BindKey(EKeys::F8, IE_Pressed, this, &AAstrasPlayerController::ToggleDevMenu);
	InputComponent->BindKey(EKeys::One, IE_Pressed, this, &AAstrasPlayerController::SwapToRamKey);
	InputComponent->BindKey(EKeys::Two, IE_Pressed, this, &AAstrasPlayerController::SwapToHanumanKey);
	InputComponent->BindKey(EKeys::Three, IE_Pressed, this, &AAstrasPlayerController::SwapToLakshmanKey);
	InputComponent->BindKey(EKeys::Four, IE_Pressed, this, &AAstrasPlayerController::SwapToBharatKey);
	InputComponent->BindKey(EKeys::Q, IE_Pressed, this, &AAstrasPlayerController::TriggerPrimaryAbilityKey);
	InputComponent->BindKey(EKeys::R, IE_Pressed, this, &AAstrasPlayerController::TriggerUltimateAbilityKey);
}

void AAstrasPlayerController::ToggleDevMenu()
{
	SetDevMenuOpen(!bDevMenuOpen);
}

void AAstrasPlayerController::SetDevMenuOpen(bool bOpen)
{
	bDevMenuOpen = bOpen;

	if (bDevMenuOpen)
	{
		if (!DevMenuInstance && DevMenuWidgetClass)
		{
			DevMenuInstance = CreateWidget<UAstrasDevMenuWidget>(this, DevMenuWidgetClass);
		}
		if (DevMenuInstance)
		{
			if (!DevMenuInstance->IsInViewport())
			{
				DevMenuInstance->AddToViewport(50);
			}
			DevMenuInstance->SetVisibility(ESlateVisibility::Visible);
			DevMenuInstance->RefreshActiveStatusLabels();
		}
		FInputModeGameAndUI InputMode;
		InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		SetInputMode(InputMode);
		bShowMouseCursor = true;
	}
	else
	{
		if (DevMenuInstance)
		{
			DevMenuInstance->SetVisibility(ESlateVisibility::Collapsed);
		}
		FInputModeGameOnly InputMode;
		SetInputMode(InputMode);
		bShowMouseCursor = false;
	}
}

void AAstrasPlayerController::RequestDeitySwap(EHeroDeityId NewDeityId)
{
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UAstrasDevCharacterSwapSubsystem* SwapSub = GI->GetSubsystem<UAstrasDevCharacterSwapSubsystem>())
		{
			SwapSub->SwapActiveDeity(this, NewDeityId);
			if (DevMenuInstance && bDevMenuOpen)
			{
				DevMenuInstance->RefreshActiveStatusLabels();
			}
		}
	}
}

void AAstrasPlayerController::CycleNextDeity()
{
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UAstrasDevCharacterSwapSubsystem* SwapSub = GI->GetSubsystem<UAstrasDevCharacterSwapSubsystem>())
		{
			SwapSub->CycleNextDeity(this);
			if (DevMenuInstance && bDevMenuOpen)
			{
				DevMenuInstance->RefreshActiveStatusLabels();
			}
		}
	}
}

void AAstrasPlayerController::TriggerPrimaryAbilityKey()
{
	if (AAstrasPlayerCharacter* Hero = Cast<AAstrasPlayerCharacter>(GetPawn()))
	{
		Hero->ExecuteHeroPrimaryAbility();
	}
}

void AAstrasPlayerController::TriggerUltimateAbilityKey()
{
	if (AAstrasPlayerCharacter* Hero = Cast<AAstrasPlayerCharacter>(GetPawn()))
	{
		Hero->ExecuteHeroUltimateAbility();
	}
}

#include "AstrasDevMenuWidget.h"
#include "AstrasDevCharacterSwapSubsystem.h"
#include "AstrasEnemyCharacter.h"
#include "AstrasPlayerCharacter.h"
#include "AstrasPlayerController.h"
#include "AstrasQualitySubsystem.h"
#include "Blueprint/WidgetTree.h"
#include "Components/TextBlock.h"
#include "Styling/CoreStyle.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Text/STextBlock.h"

void UAstrasDevMenuWidget::NativeConstruct()
{
	Super::NativeConstruct();
	RefreshActiveStatusLabels();
}

TSharedRef<SWidget> UAstrasDevMenuWidget::RebuildWidget()
{
	// If a UMG Blueprint (WBP_DevCharacterMenu) authored visual widgets, use standard UMG hierarchy
	if (WidgetTree && WidgetTree->RootWidget)
	{
		return Super::RebuildWidget();
	}

	const FSlateFontInfo TitleFont = FCoreStyle::GetDefaultFontStyle("Bold", 18);
	const FSlateFontInfo SectionFont = FCoreStyle::GetDefaultFontStyle("Bold", 13);
	const FSlateFontInfo BodyFont = FCoreStyle::GetDefaultFontStyle("Regular", 11);

	return SNew(SOverlay)
	+ SOverlay::Slot()
	.HAlign(HAlign_Center)
	.VAlign(VAlign_Center)
	[
		SNew(SBox)
		.WidthOverride(760.0f)
		[
			SNew(SBorder)
			.Padding(FMargin(24.0f))
			.BorderBackgroundColor(FLinearColor(0.05f, 0.04f, 0.07f, 0.92f))
			[
				SNew(SVerticalBox)

				// Header
				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0, 0, 0, 12)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot()
					.FillWidth(1.0f)
					.VAlign(VAlign_Center)
					[
						SNew(STextBlock)
						.Text(FText::FromString(TEXT("DEV MENU  //  REAL-TIME DEITY & SANDBOX SWITCHER")))
						.Font(TitleFont)
						.ColorAndOpacity(FLinearColor(0.98f, 0.78f, 0.28f, 1.0f))
					]
					+ SHorizontalBox::Slot()
					.AutoWidth()
					[
						SNew(SButton)
						.OnClicked(FOnClicked::CreateUObject(this, &UAstrasDevMenuWidget::HandleSlateCloseClick))
						[
							SNew(STextBlock)
							.Text(FText::FromString(TEXT(" CLOSE [F8] ")))
							.Font(SectionFont)
						]
					]
				]

				// Active Status Banner
				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0, 0, 0, 14)
				[
					SNew(SBorder)
					.Padding(FMargin(12.0f))
					.BorderBackgroundColor(FLinearColor(0.11f, 0.09f, 0.14f, 0.95f))
					[
						SNew(SVerticalBox)
						+ SVerticalBox::Slot().AutoHeight()
						[
							SAssignNew(SlateStatusText, STextBlock)
							.Font(SectionFont)
							.ColorAndOpacity(FLinearColor::White)
						]
						+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 0)
						[
							SAssignNew(SlateAbilitiesText, STextBlock)
							.Font(BodyFont)
							.ColorAndOpacity(FLinearColor(0.82f, 0.88f, 0.96f, 1.0f))
						]
						+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 0)
						[
							SAssignNew(SlateQualityText, STextBlock)
							.Font(BodyFont)
							.ColorAndOpacity(FLinearColor(0.55f, 0.92f, 0.68f, 1.0f))
						]
					]
				]

				// Playable Deity Selector Row
				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0, 0, 0, 6)
				[
					SNew(STextBlock)
					.Text(FText::FromString(TEXT("SELECT PLAYABLE DEITY (SEAMLESS LIVE SWAP — KEYS 1-4):")))
					.Font(SectionFont)
					.ColorAndOpacity(FLinearColor(0.94f, 0.82f, 0.45f, 1.0f))
				]
				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0, 0, 0, 16)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(0, 0, 6, 0)
					[
						SNew(SButton)
						.OnClicked(FOnClicked::CreateUObject(this, &UAstrasDevMenuWidget::HandleSlateDeityClick, EHeroDeityId::LordRam))
						[
							SNew(STextBlock).Text(FText::FromString(TEXT("[1] LORD RAM\nSurya-Agni & Brahmastra"))).Font(BodyFont)
						]
					]
					+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(0, 0, 6, 0)
					[
						SNew(SButton)
						.OnClicked(FOnClicked::CreateUObject(this, &UAstrasDevMenuWidget::HandleSlateDeityClick, EHeroDeityId::WarriorHanuman))
						[
							SNew(STextBlock).Text(FText::FromString(TEXT("[2] WARRIOR HANUMAN\nVajra-Gada & Avatar Surge"))).Font(BodyFont)
						]
					]
					+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(0, 0, 6, 0)
					[
						SNew(SButton)
						.OnClicked(FOnClicked::CreateUObject(this, &UAstrasDevMenuWidget::HandleSlateDeityClick, EHeroDeityId::Lakshman))
						[
							SNew(STextBlock).Text(FText::FromString(TEXT("[3] LAKSHMAN\nSeshanaga Volley & Tempest"))).Font(BodyFont)
						]
					]
					+ SHorizontalBox::Slot().FillWidth(1.0f)
					[
						SNew(SButton)
						.OnClicked(FOnClicked::CreateUObject(this, &UAstrasDevMenuWidget::HandleSlateDeityClick, EHeroDeityId::Bharat))
						[
							SNew(STextBlock).Text(FText::FromString(TEXT("[4] BHARAT\nDharma Cleave & Aegis"))).Font(BodyFont)
						]
					]
				]

				// Android Graphics Quality & Sandbox QA Row
				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0, 0, 0, 6)
				[
					SNew(STextBlock)
					.Text(FText::FromString(TEXT("ADAPTIVE ANDROID QUALITY & COMBAT QA:")))
					.Font(SectionFont)
					.ColorAndOpacity(FLinearColor(0.94f, 0.82f, 0.45f, 1.0f))
				]
				+ SVerticalBox::Slot()
				.AutoHeight()
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(0, 0, 6, 0)
					[
						SNew(SButton)
						.OnClicked(FOnClicked::CreateUObject(this, &UAstrasDevMenuWidget::HandleSlateQualityClick, EAstrasQualityTier::Low))
						[
							SNew(STextBlock).Text(FText::FromString(TEXT("Quality: LOW"))).Font(BodyFont)
						]
					]
					+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(0, 0, 6, 0)
					[
						SNew(SButton)
						.OnClicked(FOnClicked::CreateUObject(this, &UAstrasDevMenuWidget::HandleSlateQualityClick, EAstrasQualityTier::Medium))
						[
							SNew(STextBlock).Text(FText::FromString(TEXT("Quality: MEDIUM"))).Font(BodyFont)
						]
					]
					+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(0, 0, 6, 0)
					[
						SNew(SButton)
						.OnClicked(FOnClicked::CreateUObject(this, &UAstrasDevMenuWidget::HandleSlateQualityClick, EAstrasQualityTier::High))
						[
							SNew(STextBlock).Text(FText::FromString(TEXT("Quality: HIGH"))).Font(BodyFont)
						]
					]
					+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(0, 0, 6, 0)
					[
						SNew(SButton)
						.OnClicked(FOnClicked::CreateUObject(this, &UAstrasDevMenuWidget::HandleSlateRestoreClick))
						[
							SNew(STextBlock).Text(FText::FromString(TEXT("Restore HP/Prana"))).Font(BodyFont)
						]
					]
					+ SHorizontalBox::Slot().FillWidth(1.0f)
					[
						SNew(SButton)
						.OnClicked(FOnClicked::CreateUObject(this, &UAstrasDevMenuWidget::HandleSlateSpawnDemonsClick))
						[
							SNew(STextBlock).Text(FText::FromString(TEXT("Spawn Demon Wave"))).Font(BodyFont)
						]
					]
				]
			]
		]
	];
}

void UAstrasDevMenuWidget::SelectDeity(EHeroDeityId DeityId)
{
	APlayerController* PC = GetOwningPlayer();
	UGameInstance* GI = GetGameInstance();
	if (!PC || !GI) return;

	if (UAstrasDevCharacterSwapSubsystem* SwapSub = GI->GetSubsystem<UAstrasDevCharacterSwapSubsystem>())
	{
		SwapSub->SwapActiveDeity(PC, DeityId);
		RefreshActiveStatusLabels();
	}
}

void UAstrasDevMenuWidget::SetQualityTier(EAstrasQualityTier Tier)
{
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UAstrasQualitySubsystem* QualitySub = GI->GetSubsystem<UAstrasQualitySubsystem>())
		{
			QualitySub->SetQualityMode(false, Tier);
			RefreshActiveStatusLabels();
		}
	}
}

void UAstrasDevMenuWidget::RestoreHeroVitals()
{
	if (APlayerController* PC = GetOwningPlayer())
	{
		if (AAstrasPlayerCharacter* Hero = Cast<AAstrasPlayerCharacter>(PC->GetPawn()))
		{
			Hero->RestoreFullVitals();
			RefreshActiveStatusLabels();
		}
	}
}

void UAstrasDevMenuWidget::SpawnTestDemonGroup()
{
	APlayerController* PC = GetOwningPlayer();
	if (!PC || !PC->GetWorld() || !PC->GetPawn()) return;

	UWorld* World = PC->GetWorld();
	const FVector Origin = PC->GetPawn()->GetActorLocation();
	const FVector Forward = PC->GetPawn()->GetActorForwardVector();
	const FVector Right = PC->GetPawn()->GetActorRightVector();

	const EDemonVariant Variants[3] = {
		EDemonVariant::BruteHuman,
		EDemonVariant::BoarDemon,
		EDemonVariant::SorcererHuman
	};

	for (int32 i = 0; i < 3; ++i)
	{
		const FVector SpawnLoc = Origin + Forward * 1200.0f + Right * ((i - 1) * 420.0f) + FVector(0.0f, 0.0f, 120.0f);
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		if (AAstrasEnemyCharacter* Demon = World->SpawnActor<AAstrasEnemyCharacter>(AAstrasEnemyCharacter::StaticClass(), SpawnLoc, (-Forward).Rotation(), Params))
		{
			Demon->ConfigureDemonVariant(Variants[i], i == 0, i == 0 ? 1.65f : 1.38f);
		}
	}
}

void UAstrasDevMenuWidget::RefreshActiveStatusLabels()
{
	UGameInstance* GI = GetGameInstance();
	if (!GI) return;

	FString StatusLine = TEXT("Active Deity: Lord Ram");
	FString AbilityLine = TEXT("Primary: Surya-Agni Blade Wave  |  Ultimate: Kodanda Brahmastra Rain");
	FString QualityLine = TEXT("Quality Tier: Medium  |  Post-Sharpen: 38%");

	if (UAstrasDevCharacterSwapSubsystem* SwapSub = GI->GetSubsystem<UAstrasDevCharacterSwapSubsystem>())
	{
		const FHeroDeityProfile P = SwapSub->GetProfileForDeity(SwapSub->GetActiveDeityId());
		StatusLine = FString::Printf(TEXT("Active Deity: %s (%s)  |  HP %.0f  |  Energy %.0f"), *P.DisplayName, *P.SanskritTitle, P.MaxHp, P.MaxAstraEnergy);
		AbilityLine = FString::Printf(TEXT("Primary [Q]: %s   |   Ultimate [R]: %s"), *P.PrimaryAbilityName, *P.UltimateAbilityName);
	}

	if (UAstrasQualitySubsystem* QSub = GI->GetSubsystem<UAstrasQualitySubsystem>())
	{
		const EAstrasQualityTier T = QSub->GetActiveTier();
		const TCHAR* TierStr = (T == EAstrasQualityTier::High) ? TEXT("HIGH") : (T == EAstrasQualityTier::Medium ? TEXT("MEDIUM") : TEXT("LOW"));
		QualityLine = FString::Printf(TEXT("Graphics Tier: %s  |  FPS: %.0f  |  Post-Sharpen: 38%%"), TierStr, QSub->GetCurrentFps());
	}

	if (TextActiveDeity) TextActiveDeity->SetText(FText::FromString(StatusLine));
	if (TextAbilities) TextAbilities->SetText(FText::FromString(AbilityLine));
	if (TextQualityStatus) TextQualityStatus->SetText(FText::FromString(QualityLine));

	if (SlateStatusText.IsValid()) SlateStatusText->SetText(FText::FromString(StatusLine));
	if (SlateAbilitiesText.IsValid()) SlateAbilitiesText->SetText(FText::FromString(AbilityLine));
	if (SlateQualityText.IsValid()) SlateQualityText->SetText(FText::FromString(QualityLine));
}

void UAstrasDevMenuWidget::CloseDevMenu()
{
	if (AAstrasPlayerController* PC = Cast<AAstrasPlayerController>(GetOwningPlayer()))
	{
		PC->SetDevMenuOpen(false);
	}
}

FReply UAstrasDevMenuWidget::HandleSlateDeityClick(EHeroDeityId DeityId)
{
	SelectDeity(DeityId);
	return FReply::Handled();
}

FReply UAstrasDevMenuWidget::HandleSlateQualityClick(EAstrasQualityTier Tier)
{
	SetQualityTier(Tier);
	return FReply::Handled();
}

FReply UAstrasDevMenuWidget::HandleSlateRestoreClick()
{
	RestoreHeroVitals();
	return FReply::Handled();
}

FReply UAstrasDevMenuWidget::HandleSlateSpawnDemonsClick()
{
	SpawnTestDemonGroup();
	return FReply::Handled();
}

FReply UAstrasDevMenuWidget::HandleSlateCloseClick()
{
	CloseDevMenu();
	return FReply::Handled();
}

#include "AstrasQualitySubsystem.h"
#include "HAL/IConsoleManager.h"
#include "Misc/App.h"

void UAstrasQualitySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

#if PLATFORM_ANDROID
	const int32 PhysicalCores = FPlatformMisc::NumberOfCores();
	const uint64 PhysicalRamMb = FPlatformMemory::GetConstants().TotalPhysical / (1024ULL * 1024ULL);
	if (PhysicalRamMb <= 3500 || PhysicalCores <= 4)
	{
		ActiveTier = EAstrasQualityTier::Low;
	}
	else if (PhysicalRamMb >= 7500 && PhysicalCores >= 8)
	{
		ActiveTier = EAstrasQualityTier::High;
	}
	else
	{
		ActiveTier = EAstrasQualityTier::Medium;
	}
#else
	ActiveTier = EAstrasQualityTier::High;
#endif

	ApplyTierConsoleVariables(ActiveTier);
}

void UAstrasQualitySubsystem::SetQualityMode(bool bAutoMode, EAstrasQualityTier ManualTier)
{
	bIsAutoMode = bAutoMode;
	if (!bIsAutoMode && ActiveTier != ManualTier)
	{
		ActiveTier = ManualTier;
		ApplyTierConsoleVariables(ActiveTier);
		OnQualityTierChanged.Broadcast(ActiveTier);
	}
}

void UAstrasQualitySubsystem::TickPerformanceGovernor(float DeltaSeconds)
{
	if (DeltaSeconds <= KINDA_SMALL_NUMBER) return;
	const float InstantFps = FMath::Clamp(1.0f / DeltaSeconds, 5.0f, 120.0f);
	SmoothedFps = FMath::Lerp(SmoothedFps, InstantFps, FMath::Clamp(DeltaSeconds * 4.0f, 0.0f, 1.0f));

	if (!bIsAutoMode) return;

	// Step down cleanly before frame drops or mobile overheating worsen
	if (SmoothedFps < 26.0f)
	{
		SlowFrameWindowSec += DeltaSeconds;
		FastFrameWindowSec = 0.0f;
		if (SlowFrameWindowSec > 3.0f && ActiveTier != EAstrasQualityTier::Low)
		{
			ActiveTier = (ActiveTier == EAstrasQualityTier::High) ? EAstrasQualityTier::Medium : EAstrasQualityTier::Low;
			SlowFrameWindowSec = 0.0f;
			ApplyTierConsoleVariables(ActiveTier);
			OnQualityTierChanged.Broadcast(ActiveTier);
		}
	}
	else if (SmoothedFps > 54.0f)
	{
		FastFrameWindowSec += DeltaSeconds;
		SlowFrameWindowSec = 0.0f;
		if (FastFrameWindowSec > 8.0f && ActiveTier != EAstrasQualityTier::High)
		{
			ActiveTier = (ActiveTier == EAstrasQualityTier::Low) ? EAstrasQualityTier::Medium : EAstrasQualityTier::High;
			FastFrameWindowSec = 0.0f;
			ApplyTierConsoleVariables(ActiveTier);
			OnQualityTierChanged.Broadcast(ActiveTier);
		}
	}
	else
	{
		SlowFrameWindowSec = FMath::Max(0.0f, SlowFrameWindowSec - DeltaSeconds * 0.5f);
		FastFrameWindowSec = FMath::Max(0.0f, FastFrameWindowSec - DeltaSeconds * 0.5f);
	}
}

void UAstrasQualitySubsystem::ApplyTierConsoleVariables(EAstrasQualityTier Tier)
{
	auto SetCVarFloat = [](const TCHAR* Name, float Val)
	{
		if (IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(Name))
		{
			Var->Set(Val, ECVF_SetByCode);
		}
	};
	auto SetCVarInt = [](const TCHAR* Name, int32 Val)
	{
		if (IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(Name))
		{
			Var->Set(Val, ECVF_SetByCode);
		}
	};

	// Keep smoothed post-process sharpness within 35%-38% across every tier
	SetCVarFloat(TEXT("r.Tonemapper.Sharpen"), Tier == EAstrasQualityTier::Low ? 0.35f : AstrasWorldConstants::PostSharpenDefault);

	switch (Tier)
	{
	case EAstrasQualityTier::Low:
		SetCVarFloat(TEXT("r.ScreenPercentage"), 75.0f);
		SetCVarInt(TEXT("r.ShadowQuality"), 0);
		SetCVarInt(TEXT("r.Shadow.CSM.MaxMobileCascades"), 1);
		SetCVarInt(TEXT("r.Shadow.MaxResolution"), 512);
		SetCVarFloat(TEXT("r.StaticMeshLODDistanceScale"), 1.75f);
		SetCVarInt(TEXT("r.SkeletalMeshLODBias"), 2);
		SetCVarInt(TEXT("r.BloomQuality"), 0);
		SetCVarInt(TEXT("r.AmbientOcclusionLevels"), 0);
		SetCVarFloat(TEXT("fx.Niagara.Scalability.TotalConcurrentEffectsScale"), 0.45f);
		break;

	case EAstrasQualityTier::Medium:
		SetCVarFloat(TEXT("r.ScreenPercentage"), 85.0f);
		SetCVarInt(TEXT("r.ShadowQuality"), 1);
		SetCVarInt(TEXT("r.Shadow.CSM.MaxMobileCascades"), 2);
		SetCVarInt(TEXT("r.Shadow.MaxResolution"), 1024);
		SetCVarFloat(TEXT("r.StaticMeshLODDistanceScale"), 1.35f);
		SetCVarInt(TEXT("r.SkeletalMeshLODBias"), 1);
		SetCVarInt(TEXT("r.BloomQuality"), 1);
		SetCVarInt(TEXT("r.AmbientOcclusionLevels"), 1);
		SetCVarFloat(TEXT("fx.Niagara.Scalability.TotalConcurrentEffectsScale"), 0.75f);
		break;

	case EAstrasQualityTier::High:
		SetCVarFloat(TEXT("r.ScreenPercentage"), 100.0f);
		SetCVarInt(TEXT("r.ShadowQuality"), 2);
		SetCVarInt(TEXT("r.Shadow.CSM.MaxMobileCascades"), 3);
		SetCVarInt(TEXT("r.Shadow.MaxResolution"), 2048);
		SetCVarFloat(TEXT("r.StaticMeshLODDistanceScale"), 1.0f);
		SetCVarInt(TEXT("r.SkeletalMeshLODBias"), 0);
		SetCVarInt(TEXT("r.BloomQuality"), 2);
		SetCVarInt(TEXT("r.AmbientOcclusionLevels"), 2);
		SetCVarFloat(TEXT("fx.Niagara.Scalability.TotalConcurrentEffectsScale"), 1.0f);
		break;
	}
}

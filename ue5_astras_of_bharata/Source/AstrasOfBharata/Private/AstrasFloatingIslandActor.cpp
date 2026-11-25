#include "AstrasFloatingIslandActor.h"
#include "AstrasRenderingDirector.h"
#include "Components/StaticMeshComponent.h"
#include "NiagaraComponent.h"

AAstrasFloatingIslandActor::AAstrasFloatingIslandActor()
{
	PrimaryActorTick.bCanEverTick = true;

	CraggyRockBaseMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("CraggyRockBaseMesh"));
	RootComponent = CraggyRockBaseMesh;

	TempleCitadelCrownMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("TempleCitadelCrownMesh"));
	TempleCitadelCrownMesh->SetupAttachment(RootComponent);
	TempleCitadelCrownMesh->SetRelativeLocation(FVector(0.0f, 0.0f, 820.0f));

	WaterfallCurtainVfx = CreateDefaultSubobject<UNiagaraComponent>(TEXT("WaterfallCurtainVfx"));
	WaterfallCurtainVfx->SetupAttachment(RootComponent);
	WaterfallCurtainVfx->SetRelativeLocation(FVector(420.0f, 0.0f, 240.0f));

	CloudMistVfx = CreateDefaultSubobject<UNiagaraComponent>(TEXT("CloudMistVfx"));
	CloudMistVfx->SetupAttachment(RootComponent);
	CloudMistVfx->SetRelativeLocation(FVector(0.0f, 0.0f, -450.0f));
}

void AAstrasFloatingIslandActor::BeginPlay()
{
	Super::BeginPlay();
	BaseLocationCm = GetActorLocation();
	PhaseOffset = FMath::FRandRange(0.0f, PI * 2.0f);

	UAstrasMaterialPipelineLibrary::EnforceMeshPlatformBudget(CraggyRockBaseMesh, EAssetBudgetCategory::BackgroundCliffAndProp);
	UAstrasMaterialPipelineLibrary::EnforceMeshPlatformBudget(TempleCitadelCrownMesh, EAssetBudgetCategory::ModularTempleAndDome);
	UAstrasMaterialPipelineLibrary::ApplyPainterlySandstonePbr(TempleCitadelCrownMesh, 0, 0.35f);
	UAstrasMaterialPipelineLibrary::ApplyGildedDomeGoldPbr(TempleCitadelCrownMesh, 1);
}

void AAstrasFloatingIslandActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const float TimeSec = GetWorld()->GetTimeSeconds();
	const float ZOffset = FMath::Sin(TimeSec * BobSpeedRad + PhaseOffset) * BobAmplitudeCm;
	SetActorLocation(BaseLocationCm + FVector(0.0f, 0.0f, ZOffset));
}

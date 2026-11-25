#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "AstrasTypes.h"
#include "AstrasEnemyCharacter.generated.h"

class UStaticMeshComponent;
class UMaterialInstanceDynamic;

/**
 * Giant Intimidating Rakshasa / Asura Enemy Warrior & Boss Commanders:
 * Ported to match the reference screenshot's towering horned demon brutes wielding spiked maces,
 * armored shoulder pauldrons, Agneyastra fire burn, Nagastra bind, Vayavyastra cyclone lift,
 * and 2-second GPU ash incineration dissolution shader parameter.
 */
UCLASS()
class ASTRASOFBHARATA_API AAstrasEnemyCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AAstrasEnemyCharacter();

	virtual void Tick(float DeltaSeconds) override;

	UFUNCTION(BlueprintCallable, Category = "Astras|Combat")
	void ConfigureDemonVariant(EDemonVariant InVariant, bool bInCommander, float InScale = 1.45f);

	UFUNCTION(BlueprintCallable, Category = "Astras|Combat")
	void ApplyAstraDamage(
		float DamageAmount,
		EProjectileArchetype SourceArchetype,
		const FVector& KnockbackImpulseCm,
		float TornadoLiftHeightCm,
		float DotDps,
		float StatusDurationSec
	);

	UFUNCTION(BlueprintPure, Category = "Astras|Enemy")
	bool IsAlive() const { return bAlive; }

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Weapon")
	TObjectPtr<UStaticMeshComponent> SpikedGadaMaceMesh;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Enemy")
	EDemonVariant Variant = EDemonVariant::BruteHuman;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Enemy")
	bool bIsCommander = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Enemy")
	float Hp = 420.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Enemy")
	float MaxHp = 420.0f;

private:
	bool bAlive = true;
	bool bDissolving = false;
	float DissolveProgress = 0.0f;
	float BurnRemainingSec = 0.0f;
	float BurnDps = 0.0f;
	float BindRemainingSec = 0.0f;

	UPROPERTY()
	TArray<TObjectPtr<UMaterialInstanceDynamic>> DynamicMaterials;
};

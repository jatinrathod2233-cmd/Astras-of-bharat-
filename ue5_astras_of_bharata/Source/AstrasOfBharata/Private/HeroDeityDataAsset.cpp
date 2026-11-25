#include "HeroDeityDataAsset.h"
#include "AstrasPlayerCharacter.h"

bool UHeroDeityDataAsset::FindProfile(EHeroDeityId DeityId, FHeroDeityProfile& OutProfile) const
{
	for (const FHeroDeityProfile& Entry : DeityProfiles)
	{
		if (Entry.DeityId == DeityId)
		{
			OutProfile = Entry;
			return true;
		}
	}
	return false;
}

TArray<FHeroDeityProfile> UHeroDeityDataAsset::BuildDefaultDeityProfiles()
{
	TArray<FHeroDeityProfile> Defaults;

	{
		FHeroDeityProfile Ram;
		Ram.DeityId = EHeroDeityId::LordRam;
		Ram.DisplayName = TEXT("Lord Ram");
		Ram.SanskritTitle = TEXT("Maryada Purushottam");
		Ram.LanHeroCode = TEXT("RAM");
		Ram.AccentColor = FLinearColor(0.96f, 0.76f, 0.26f, 1.0f);
		Ram.PrimaryAbilityName = TEXT("Surya-Agni Blade Wave");
		Ram.UltimateAbilityName = TEXT("Kodanda Brahmastra Rain");
		Ram.MaxHp = 1000.0f;
		Ram.MaxAstraEnergy = 500.0f;
		Ram.BaseWalkSpeed = 620.0f;
		Ram.SprintSpeed = 1050.0f;
		Ram.JumpZVelocity = 520.0f;
		Ram.MeleeDamage = 80.0f;
		Ram.HeroScale = 1.0f;
		Ram.PrimaryCooldownSec = 4.0f;
		Ram.UltimateCooldownSec = 20.0f;
		Defaults.Add(Ram);
	}
	{
		FHeroDeityProfile Hanuman;
		Hanuman.DeityId = EHeroDeityId::WarriorHanuman;
		Hanuman.DisplayName = TEXT("Warrior Hanuman");
		Hanuman.SanskritTitle = TEXT("Pawanputra Mahaveer");
		Hanuman.LanHeroCode = TEXT("HANUMAN");
		Hanuman.AccentColor = FLinearColor(0.98f, 0.52f, 0.14f, 1.0f);
		Hanuman.PrimaryAbilityName = TEXT("Vajra-Gada Seismic Slam");
		Hanuman.UltimateAbilityName = TEXT("Ashta-Siddhi Pawan Avatar");
		Hanuman.MaxHp = 1450.0f;
		Hanuman.MaxAstraEnergy = 420.0f;
		Hanuman.BaseWalkSpeed = 680.0f;
		Hanuman.SprintSpeed = 1220.0f;
		Hanuman.JumpZVelocity = 780.0f; // High leap power
		Hanuman.MeleeDamage = 135.0f;
		Hanuman.HeroScale = 1.14f;
		Hanuman.PrimaryCooldownSec = 3.5f;
		Hanuman.UltimateCooldownSec = 18.0f;
		Defaults.Add(Hanuman);
	}
	{
		FHeroDeityProfile Lakshman;
		Lakshman.DeityId = EHeroDeityId::Lakshman;
		Lakshman.DisplayName = TEXT("Lakshman");
		Lakshman.SanskritTitle = TEXT("Seshanaga Avatara");
		Lakshman.LanHeroCode = TEXT("LAKSHMAN");
		Lakshman.AccentColor = FLinearColor(0.22f, 0.74f, 0.97f, 1.0f);
		Lakshman.PrimaryAbilityName = TEXT("Seshanaga Serpent Volley");
		Lakshman.UltimateAbilityName = TEXT("Meghanad-Slayer Thunder Tempest");
		Lakshman.MaxHp = 920.0f;
		Lakshman.MaxAstraEnergy = 580.0f;
		Lakshman.BaseWalkSpeed = 670.0f;
		Lakshman.SprintSpeed = 1140.0f;
		Lakshman.JumpZVelocity = 560.0f;
		Lakshman.MeleeDamage = 72.0f;
		Lakshman.HeroScale = 0.99f;
		Lakshman.PrimaryCooldownSec = 3.2f;
		Lakshman.UltimateCooldownSec = 16.0f;
		Defaults.Add(Lakshman);
	}
	{
		FHeroDeityProfile Bharat;
		Bharat.DeityId = EHeroDeityId::Bharat;
		Bharat.DisplayName = TEXT("Bharat");
		Bharat.SanskritTitle = TEXT("Ayodhya Dharma Rakshak");
		Bharat.LanHeroCode = TEXT("BHARAT");
		Bharat.AccentColor = FLinearColor(0.20f, 0.83f, 0.60f, 1.0f);
		Bharat.PrimaryAbilityName = TEXT("Dharma-Chakra Cleave");
		Bharat.UltimateAbilityName = TEXT("Nandigram Sanctuary Aegis");
		Bharat.MaxHp = 1220.0f;
		Bharat.MaxAstraEnergy = 540.0f;
		Bharat.BaseWalkSpeed = 600.0f;
		Bharat.SprintSpeed = 1020.0f;
		Bharat.JumpZVelocity = 500.0f;
		Bharat.MeleeDamage = 95.0f;
		Bharat.HeroScale = 1.02f;
		Bharat.PrimaryCooldownSec = 4.2f;
		Bharat.UltimateCooldownSec = 20.0f;
		Defaults.Add(Bharat);
	}

	return Defaults;
}

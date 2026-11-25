#include "AstrasQuestSubsystem.h"

void UAstrasQuestSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	MainMissions.Empty();

	{
		FAstrasMissionState M;
		M.MissionId = TEXT("mission_sabha");
		M.Title = TEXT("Ascend the Royal Simhasana");
		M.Description = TEXT("Enter the grand Rajya Sabha of the 7-story palace and summon your war council.");
		M.Target = 1;
		M.WaypointWorldM = FVector(0.0f, -82.0f, 0.0f);
		MainMissions.Add(M);
	}
	{
		FAstrasMissionState M;
		M.MissionId = TEXT("mission_frontier");
		M.Title = TEXT("Clear the Eastern Demon Vanguard");
		M.Description = TEXT("Ride across the 2.5 km Royal Highway beyond the Sarayu frontier and defeat the vanguard.");
		M.Target = 4;
		M.WaypointWorldM = FVector(2220.0f, 0.0f, 0.0f);
		MainMissions.Add(M);
	}
	{
		FAstrasMissionState M;
		M.MissionId = TEXT("mission_outpost");
		M.Title = TEXT("Break the Obsidian Bastion");
		M.Description = TEXT("Dismantle the cursed sorcerer and giant brute defenders in the ash wasteland.");
		M.Target = 5;
		M.WaypointWorldM = FVector(2370.0f, 0.0f, 0.0f);
		MainMissions.Add(M);
	}
	{
		FAstrasMissionState M;
		M.MissionId = TEXT("mission_commander");
		M.Title = TEXT("Purge the 2.5 km Volcanic Demon Village");
		M.Description = TEXT("Confront Commander Viradha and purge all demon clans 2.5 km east of Ayodhya.");
		M.Target = 6;
		M.WaypointWorldM = FVector(AstrasWorldConstants::DemonVillageCenterXM, 0.0f, 0.0f);
		MainMissions.Add(M);
	}
}

void UAstrasQuestSubsystem::AdvanceActiveMission(int32 Delta)
{
	if (!MainMissions.IsValidIndex(CurrentMissionIndex)) return;
	FAstrasMissionState& Active = MainMissions[CurrentMissionIndex];
	Active.Progress = FMath::Min(Active.Target, Active.Progress + Delta);
	if (Active.Progress >= Active.Target && CurrentMissionIndex + 1 < MainMissions.Num())
	{
		++CurrentMissionIndex;
	}
}

void UAstrasQuestSubsystem::UnlockAstra(EAstraId AstraId)
{
	UnlockedAstras.Add(AstraId);
}

bool UAstrasQuestSubsystem::IsAstraUnlocked(EAstraId AstraId) const
{
	return UnlockedAstras.Contains(AstraId);
}

FAstrasMissionState UAstrasQuestSubsystem::GetCurrentMission() const
{
	if (MainMissions.IsValidIndex(CurrentMissionIndex))
	{
		return MainMissions[CurrentMissionIndex];
	}
	return FAstrasMissionState();
}

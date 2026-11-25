using UnrealBuildTool;

public class AstrasOfBharata : ModuleRules
{
	public AstrasOfBharata(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"Niagara",
			"UMG",
			"Slate",
			"SlateCore",
			"AIModule",
			"NavigationSystem",
			"PhysicsCore",
			"WebSockets",
			"Json",
			"JsonUtilities"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"RenderCore",
			"RHI",
			"Sockets",
			"Networking"
		});

		if (Target.Platform == UnrealTargetPlatform.Android)
		{
			PrivateDependencyModuleNames.Add("Launch");
		}
	}
}

using UnrealBuildTool;
using System.Collections.Generic;

public class AstrasOfBharataEditorTarget : TargetRules
{
	public AstrasOfBharataEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
		ExtraModuleNames.Add("AstrasOfBharata");
	}
}

import { Workbench } from "@/components/workbench";
import { SUGGESTED_QUESTIONS } from "@/lib/analyst";
import { COPILOT_PROMPTS } from "@/lib/copilot";

export default function Page() {
  return <Workbench suggestions={SUGGESTED_QUESTIONS} copilotPrompts={COPILOT_PROMPTS} />;
}

import { requireUser } from "@/lib/auth";
import {
  CopilotError,
  createCopilotConversation,
  listCopilotConversations,
  toCopilotConversationDto
} from "@/lib/courseWorkspace/copilot";

type RouteContext = { params: Promise<{ courseId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof CopilotError) return Response.json({ code: error.code, error: error.message }, { status: error.status });
  console.error("[copilot-conversations]", error);
  return Response.json({ code: "COPILOT_REQUEST_FAILED", error: "AI智能体对话操作失败，请重试" }, { status: 500 });
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    const conversations = await listCopilotConversations(user, courseId);
    return Response.json({ conversations: conversations.map(toCopilotConversationDto) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    const conversation = await createCopilotConversation(user, courseId);
    return Response.json({ conversation: toCopilotConversationDto(conversation) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

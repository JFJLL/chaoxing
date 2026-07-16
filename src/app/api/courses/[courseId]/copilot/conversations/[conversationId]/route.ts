import { requireUser } from "@/lib/auth";
import {
  CopilotError,
  deleteCopilotConversation,
  toCopilotConversationDto,
  updateCopilotConversation
} from "@/lib/courseWorkspace/copilot";

type RouteContext = { params: Promise<{ courseId: string; conversationId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof CopilotError) return Response.json({ code: error.code, error: error.message }, { status: error.status });
  console.error("[copilot-conversation]", error);
  return Response.json({ code: "COPILOT_REQUEST_FAILED", error: "Copilot 对话操作失败，请重试" }, { status: 500 });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, conversationId } = await context.params;
  try {
    const conversation = await updateCopilotConversation(user, courseId, conversationId, await request.json().catch(() => null));
    return Response.json({ conversation: toCopilotConversationDto(conversation) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, conversationId } = await context.params;
  try {
    await deleteCopilotConversation(user, courseId, conversationId);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

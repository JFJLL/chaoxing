import { requireUser } from "@/lib/auth";
import {
  AiConversationError,
  deleteTutorConversation,
  toTutorConversationDto,
  updateTutorConversationReferences
} from "@/lib/courseWorkspace/aiConversation";

type RouteContext = { params: Promise<{ courseId: string; conversationId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof AiConversationError) {
    return Response.json({ code: error.code, error: error.message }, { status: error.status });
  }
  return Response.json({ code: "AI_CONVERSATION_REQUEST_FAILED", error: "AI 对话操作失败，请重试" }, { status: 500 });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, conversationId } = await context.params;
  try {
    const conversation = await updateTutorConversationReferences(
      user,
      courseId,
      conversationId,
      await request.json().catch(() => null)
    );
    return Response.json({ conversation: toTutorConversationDto(conversation) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, conversationId } = await context.params;
  try {
    await deleteTutorConversation(user, courseId, conversationId);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

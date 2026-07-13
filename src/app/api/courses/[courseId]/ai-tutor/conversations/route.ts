import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  AiConversationError,
  createTutorConversation,
  listTutorConversations,
  toTutorConversationDto
} from "@/lib/courseWorkspace/aiConversation";

type RouteContext = { params: Promise<{ courseId: string }> };

function conversationError(error: unknown) {
  if (error instanceof AiConversationError) {
    return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
  }
  return NextResponse.json({ code: "AI_CONVERSATION_REQUEST_FAILED", error: "AI 对话操作失败，请重试" }, { status: 500 });
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    const conversations = await listTutorConversations(user, courseId);
    return NextResponse.json({ conversations: conversations.map(toTutorConversationDto) });
  } catch (error) {
    return conversationError(error);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId } = await context.params;
  try {
    const conversation = await createTutorConversation(user, courseId);
    return NextResponse.json({
      conversation: {
        ...conversation,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        messages: []
      }
    }, { status: 201 });
  } catch (error) {
    return conversationError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { updateQuestionSchema } from "@/lib/validation";
import { getQuestion, listMessages, updateQuestionStatus } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import type { Question } from "@/lib/models";

function isParticipant(question: Question, email: string): boolean {
  return question.authorEmail === email || question.recipientEmails.includes(email);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const question = await getQuestion(id);
  if (!question || !isParticipant(question, user.email)) {
    return NextResponse.json({ error: "Вопрос не найден" }, { status: 404 });
  }
  const messages = await listMessages(id);
  return NextResponse.json({ question, messages });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const question = await getQuestion(id);
  if (!question || !isParticipant(question, user.email)) {
    return NextResponse.json({ error: "Вопрос не найден" }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const parsed = updateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await updateQuestionStatus(id, parsed.data.status);
  return NextResponse.json({ question: updated });
}

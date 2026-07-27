import { NextResponse } from "next/server";
import { CourseDriveError } from "./service";

export function courseDriveErrorResponse(error: unknown, fallback = "课程云盘操作失败") {
  if (error instanceof CourseDriveError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : fallback;
  const forbidden = /无权|权限|教师/.test(message);
  return NextResponse.json({ error: message }, { status: forbidden ? 403 : 500 });
}

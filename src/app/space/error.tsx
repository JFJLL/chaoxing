"use client";

import { Button } from "@/components/ui/Button";

export default function SpaceError({ reset }: { reset: () => void }) {
  return (
    <div className="rounded-md border border-red-100 bg-red-50 p-5 text-red-700">
      <h1 className="font-semibold">页面加载失败</h1>
      <p className="mt-1 text-sm">请重试，或返回其他模块继续操作。</p>
      <Button type="button" className="mt-4" onClick={reset}>
        重试
      </Button>
    </div>
  );
}

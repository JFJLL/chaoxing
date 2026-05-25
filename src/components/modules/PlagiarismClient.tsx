"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function PlagiarismClient({ checks }: { checks: Array<{ id: string; title: string; status: string; similarity: number; riskLevel: string | null }> }) {
  const router = useRouter();
  async function upload(formData: FormData) { await fetch("/api/plagiarism", { method: "POST", body: formData }); router.refresh(); }
  return <div className="space-y-5"><form action={upload} className="flex gap-2"><input name="file" type="file" accept=".txt,.md,.docx,.pdf" className="rounded-md border p-2" /><Button type="submit">提交检测</Button></form><div className="grid gap-3 md:grid-cols-2">{checks.map((check) => <article key={check.id} className="rounded-md border border-[var(--cx-border)] p-4"><p className="font-medium">{check.title}</p><p className="text-sm text-slate-500">{check.status} · 相似度 {check.similarity}% · 风险 {check.riskLevel ?? "-"}</p><a className="mt-2 inline-block text-[var(--cx-blue)]" href={`/api/plagiarism/${check.id}`}>查看报告</a></article>)}</div></div>;
}

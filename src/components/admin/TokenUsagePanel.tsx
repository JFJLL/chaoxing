type TokenUsage = {
  calls: number;
  providerUsageCalls: number;
  promptTokensActual: number;
  completionTokensActual: number;
  totalTokensActual: number;
};

type TeacherUsage = TokenUsage & { userId: string; teacherName: string; teacherEmail: string };
type CourseUsage = TokenUsage & { courseId: string; courseTitle: string; ownerName: string; ownerEmail: string };

function formatTokens(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function UsageTable<T extends TokenUsage>({ title, subtitle, rows, renderIdentity }: {
  title: string;
  subtitle: string;
  rows: T[];
  renderIdentity: (item: T) => { title: string; subtitle: string };
}) {
  return <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
    <div><h2 className="text-lg font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>
    <div className="mt-4 max-h-[360px] overflow-y-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="sticky top-0 bg-white text-xs text-slate-500"><tr><th className="pb-2 font-medium">对象</th><th className="pb-2 text-right font-medium">AI 调用</th><th className="pb-2 text-right font-medium">已回传</th><th className="pb-2 text-right font-medium">输入 Token</th><th className="pb-2 text-right font-medium">输出 Token</th><th className="pb-2 text-right font-medium">实际总量</th></tr></thead><tbody>{rows.length ? rows.map((item, index) => { const identity = renderIdentity(item); return <tr key={`${identity.title}-${index}`} className="border-t border-slate-50"><td className="py-3 pr-3"><p className="font-medium text-slate-800">{identity.title}</p><p className="mt-0.5 text-xs text-slate-500">{identity.subtitle}</p></td><td className="py-3 text-right text-slate-600">{item.calls}</td><td className="py-3 text-right text-slate-600">{item.providerUsageCalls}</td><td className="py-3 text-right text-slate-600">{formatTokens(item.promptTokensActual)}</td><td className="py-3 text-right text-slate-600">{formatTokens(item.completionTokensActual)}</td><td className="py-3 text-right font-medium text-[#8E3425]">{formatTokens(item.totalTokensActual)}</td></tr>; }) : <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500">尚无可统计的 AI 调用记录</td></tr>}</tbody></table></div>
  </article>;
}

export function TokenUsagePanel({ teachers, courses }: { teachers: TeacherUsage[]; courses: CourseUsage[] }) {
  return <section className="grid gap-6 xl:grid-cols-2">
    <UsageTable title="教师 Token 用量" subtitle="只汇总模型供应商实际返回 usage 的调用；未回传 usage 的调用仅计入 AI 调用数。" rows={teachers} renderIdentity={(item) => ({ title: item.teacherName, subtitle: item.teacherEmail })} />
    <UsageTable title="课程 Token 用量" subtitle="按课程汇总实际 Token，便于识别高频 AI 辅助教学场景。" rows={courses} renderIdentity={(item) => ({ title: item.courseTitle, subtitle: `${item.ownerName} · ${item.ownerEmail}` })} />
  </section>;
}

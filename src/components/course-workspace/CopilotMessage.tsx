import { Bot, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function CopilotMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mb-3 mt-6 text-xl font-semibold leading-8 text-slate-950 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-5 text-lg font-semibold leading-7 text-slate-950 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold leading-7 text-slate-900 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="my-3 leading-7 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 marker:text-slate-400">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 marker:text-slate-500">{children}</ol>,
        li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
        blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-blue-200 bg-blue-50/60 px-4 py-2 text-slate-700">{children}</blockquote>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium text-blue-600 underline decoration-blue-200 underline-offset-4 hover:decoration-blue-500">{children}</a>,
        strong: ({ children }) => <strong className="font-semibold text-slate-950">{children}</strong>,
        code: ({ children, className }) => <code className={`${className ?? ""} rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800`}>{children}</code>,
        pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-[13px] leading-6 text-slate-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">{children}</pre>,
        hr: () => <hr className="my-6 border-slate-200" />,
        table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
        th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800">{children}</th>,
        td: ({ children }) => <td className="border border-slate-200 px-3 py-2 align-top">{children}</td>
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function CopilotAssistantReply({ content, pending = false }: { content: string; pending?: boolean }) {
  return (
    <article
      className="mx-auto flex w-full max-w-3xl gap-3 text-sm text-slate-800"
      role={pending ? "status" : undefined}
      aria-live={pending ? "polite" : undefined}
      aria-label={pending ? "Copilot 正在回复" : "Copilot 回复"}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <Bot className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {content ? <CopilotMarkdown content={content} /> : null}
        {pending ? (
          <span className={`inline-flex items-center gap-2 text-sm text-slate-500 ${content ? "mt-2" : "min-h-7"}`}>
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
            {content ? "正在生成" : "正在思考"}
          </span>
        ) : null}
      </div>
    </article>
  );
}

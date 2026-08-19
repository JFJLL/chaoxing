import { forwardRef, type InputHTMLAttributes } from "react";
import { UploadCloud } from "lucide-react";
import { clsx } from "clsx";

type FilePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  hint: string;
  selectedFileName?: string;
};

export const FilePicker = forwardRef<HTMLInputElement, FilePickerProps>(function FilePicker(
  { className, hint, label, selectedFileName, ...props },
  ref
) {
  return (
    <div className={clsx("min-w-0", className)}>
      <input ref={ref} type="file" className="peer sr-only" {...props} />
      <label
        htmlFor={props.id}
        className="cx-tactile flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--cx-border-strong)] bg-white px-4 py-3 text-left hover:border-[#C97B5E] hover:bg-[var(--cx-blue-soft)] peer-focus-visible:border-[var(--cx-blue)] peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--cx-focus)]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--cx-blue-soft)] text-[var(--cx-blue)] shadow-sm">
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-800">{selectedFileName || label}</span>
          <span className="mt-0.5 block text-xs leading-5 text-slate-500">{selectedFileName ? "点击重新选择文件" : hint}</span>
        </span>
        <span className="shrink-0 rounded-lg border border-[var(--cx-border)] bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
          {selectedFileName ? "已选择" : "浏览"}
        </span>
      </label>
    </div>
  );
});

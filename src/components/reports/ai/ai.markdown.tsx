import {normalizeAiMarkdown} from "@/lib/ai/markdown-normalize.ts";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {cn} from "@/lib/utils.ts";
import type {AiOrderRef} from "@/lib/ai/order-refs.ts";
import {linkifyOrderChildren, ReceiptMarkdownLink} from "@/lib/ai/order-receipt-links.tsx";

type AiMarkdownProps = {
  children: string;
  compact?: boolean;
  className?: string;
  orderRefs?: AiOrderRef[];
};

const buildMarkdownComponents = (compact: boolean, orderRefs?: AiOrderRef[]) => {
  const linkify = (children?: React.ReactNode) =>
    orderRefs?.length ? linkifyOrderChildren(children, orderRefs) : children;

  return {
    h1: ({children}: {children?: React.ReactNode}) => (
      <h1 className={cn(
        "font-bold text-gray-900 first:mt-0",
        compact ? "text-lg mb-2 mt-3" : "text-2xl mb-4 mt-6",
      )}>{children}</h1>
    ),
    h2: ({children}: {children?: React.ReactNode}) => (
      <h2 className={cn(
        "font-semibold text-gray-800 first:mt-0",
        compact ? "text-base mb-2 mt-2" : "text-xl mb-3 mt-5",
      )}>{children}</h2>
    ),
    h3: ({children}: {children?: React.ReactNode}) => (
      <h3 className={cn(
        "font-semibold text-gray-800 first:mt-0",
        compact ? "text-sm mb-1 mt-2" : "text-lg mb-2 mt-4",
      )}>{children}</h3>
    ),
    p: ({children}: {children?: React.ReactNode}) => (
      <p className={cn(
        "text-gray-800 leading-relaxed last:mb-0",
        compact ? "mb-2 text-sm" : "mb-3",
      )}>{linkify(children)}</p>
    ),
    ul: ({children}: {children?: React.ReactNode}) => (
      <ul className={cn(
        "list-disc text-gray-800",
        compact ? "mb-2 pl-4 space-y-0.5 text-sm" : "mb-3 pl-6 space-y-1",
      )}>{children}</ul>
    ),
    ol: ({children}: {children?: React.ReactNode}) => (
      <ol className={cn(
        "list-decimal text-gray-800",
        compact ? "mb-2 pl-4 space-y-0.5 text-sm" : "mb-3 pl-6 space-y-1",
      )}>{children}</ol>
    ),
    li: ({children}: {children?: React.ReactNode}) => (
      <li className="leading-relaxed">{linkify(children)}</li>
    ),
    strong: ({children}: {children?: React.ReactNode}) => (
      <strong className="font-semibold text-gray-900">{children}</strong>
    ),
    code: ({children, className}: {children?: React.ReactNode; className?: string}) => {
      const isBlock = className?.includes("language-");
      if (isBlock) {
        return (
          <code className={cn(
            "block overflow-x-auto rounded bg-gray-100 text-gray-800",
            compact ? "p-2 text-xs my-2" : "p-3 text-sm my-3",
          )}>
            {children}
          </code>
        );
      }
      return (
        <code className={cn(
          "rounded bg-gray-100 text-gray-800",
          compact ? "px-1 py-0.5 text-xs" : "px-1.5 py-0.5 text-sm",
        )}>{children}</code>
      );
    },
    pre: ({children}: {children?: React.ReactNode}) => (
      <pre className={compact ? "mb-2 overflow-x-auto" : "mb-3 overflow-x-auto"}>{children}</pre>
    ),
    table: ({children}: {children?: React.ReactNode}) => (
      <div className={cn(
        "overflow-x-auto rounded-lg border border-neutral-200",
        compact ? "my-2" : "my-4",
      )}>
        <table className={cn(
          "min-w-full border-collapse bg-white",
          compact ? "text-xs" : "text-sm",
        )}>{children}</table>
      </div>
    ),
    thead: ({children}: {children?: React.ReactNode}) => (
      <thead className="bg-neutral-50">{children}</thead>
    ),
    tbody: ({children}: {children?: React.ReactNode}) => (
      <tbody className="divide-y divide-neutral-100 bg-white">{children}</tbody>
    ),
    tr: ({children}: {children?: React.ReactNode}) => (
      <tr className="divide-x divide-neutral-100">{children}</tr>
    ),
    th: ({children}: {children?: React.ReactNode}) => (
      <th className={cn(
        "text-left font-semibold text-neutral-700 whitespace-nowrap",
        compact ? "px-2 py-1.5 text-xs" : "px-4 py-3 text-sm",
      )}>{children}</th>
    ),
    td: ({children}: {children?: React.ReactNode}) => (
      <td className={cn(
        "text-neutral-800 align-top",
        compact ? "px-2 py-1.5 text-xs" : "px-4 py-3 text-sm",
      )}>{linkify(children)}</td>
    ),
    a: ({href, children}: {href?: string; children?: React.ReactNode}) => (
      <ReceiptMarkdownLink href={href}>{children}</ReceiptMarkdownLink>
    ),
    blockquote: ({children}: {children?: React.ReactNode}) => (
      <blockquote className={cn(
        "border-l-4 border-primary-300 text-gray-600 italic",
        compact ? "mb-2 pl-3 text-sm" : "mb-3 pl-4",
      )}>{children}</blockquote>
    ),
    hr: () => <hr className={compact ? "my-2 border-gray-200" : "my-4 border-gray-200"}/>,
  };
};

export function AiMarkdown({children, compact = false, className, orderRefs}: AiMarkdownProps) {
  const components = buildMarkdownComponents(compact, orderRefs);
  const normalized = normalizeAiMarkdown(children);

  return (
    <div className={cn("ai-markdown", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

import {isValidElement, type ReactNode} from "react";
import {orderReceiptUrl} from "@/routes/posr.ts";
import type {AiOrderRef} from "@/lib/ai/order-refs.ts";

const ORDER_RECORD_RE = /\border:[A-Za-z0-9_-]+\b/g;
const HASH_INVOICE_RE = /#(\d+)(?:\/\d+)?/g;
const LABELED_ID_RE = /^(?:invoice|inv|order(?:\s*id)?|auto[_\s-]?id)\s*#?\s*(\d+)$/i;
const receiptLinkClass = "text-primary-700 underline font-medium";

export const ReceiptMarkdownLink = ({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={receiptLinkClass}
  >
    {children}
  </a>
);

const nodeToText = (node: ReactNode): string => {
  if (node == null || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeToText).join("");
  }
  if (isValidElement(node)) {
    return nodeToText((node.props as {children?: ReactNode}).children);
  }
  return "";
};

const isAlreadyLinked = (node: ReactNode): boolean => {
  if (node == null) {
    return false;
  }
  if (Array.isArray(node)) {
    const meaningful = node.filter((child) => !(typeof child === "string" && !child.trim()));
    return meaningful.length === 1 && isAlreadyLinked(meaningful[0]);
  }
  if (isValidElement(node)) {
    return typeof (node.props as {href?: string}).href === "string";
  }
  return false;
};

const hrefForKnownNumber = (n: number, refs: AiOrderRef[]): string | null => {
  const ref = refs.find((item) => item.invoiceNumber === n || item.autoId === n);
  return ref ? orderReceiptUrl({id: ref.orderId}) : null;
};

/** Only identifier-shaped text: order:id, #invoice, or a labeled invoice/order/auto id. Never a bare count. */
export const resolveReceiptHref = (text: string, refs: AiOrderRef[]): string | null => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const byRecordId = refs.find((ref) => ref.orderId === trimmed);
  if (byRecordId) {
    return orderReceiptUrl({id: byRecordId.orderId});
  }

  if (/^order:[A-Za-z0-9_-]+$/.test(trimmed)) {
    return orderReceiptUrl({id: trimmed});
  }

  const hashMatch = trimmed.match(/^#(\d+)(?:\/\d+)?$/);
  if (hashMatch) {
    return hrefForKnownNumber(Number(hashMatch[1]), refs);
  }

  const labeledMatch = trimmed.match(LABELED_ID_RE);
  if (labeledMatch) {
    return hrefForKnownNumber(Number(labeledMatch[1]), refs);
  }

  return null;
};

const linkifyKnownOrderTokens = (text: string, refs: AiOrderRef[]): ReactNode => {
  type Span = {start: number; end: number; href: string; value: string};
  const spans: Span[] = [];

  const orderPattern = new RegExp(ORDER_RECORD_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = orderPattern.exec(text)) !== null) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      href: orderReceiptUrl({id: match[0]}),
      value: match[0],
    });
  }

  const hashPattern = new RegExp(HASH_INVOICE_RE.source, "g");
  while ((match = hashPattern.exec(text)) !== null) {
    const href = hrefForKnownNumber(Number(match[1]), refs);
    if (!href) {
      continue;
    }
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      href,
      value: match[0],
    });
  }

  spans.sort((a, b) => a.start - b.start);
  const used: Span[] = [];
  for (const span of spans) {
    const overlaps = used.some((existing) => span.start < existing.end && span.end > existing.start);
    if (!overlaps) {
      used.push(span);
    }
  }

  if (used.length === 0) {
    return text;
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  used.forEach((span, index) => {
    if (span.start > lastIndex) {
      parts.push(text.slice(lastIndex, span.start));
    }
    parts.push(
      <ReceiptMarkdownLink key={`${span.value}-${span.start}-${index}`} href={span.href}>
        {span.value}
      </ReceiptMarkdownLink>,
    );
    lastIndex = span.end;
  });
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
};

export const linkifyOrderChildren = (children: ReactNode, refs: AiOrderRef[]): ReactNode => {
  if (isAlreadyLinked(children)) {
    return children;
  }

  const text = nodeToText(children);
  const href = resolveReceiptHref(text, refs);
  if (href) {
    return <ReceiptMarkdownLink href={href}>{children}</ReceiptMarkdownLink>;
  }

  if (typeof children === "string" || typeof children === "number") {
    return linkifyKnownOrderTokens(String(children), refs);
  }

  return children;
};

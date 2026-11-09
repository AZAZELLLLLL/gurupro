import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface ChatMarkdownRendererProps {
  content: string;
}

export function ChatMarkdownRenderer({ content }: ChatMarkdownRendererProps) {
  const sanitizedHtml = useMemo(() => {
    if (!content) return "";

    // Configure marked for clean GFM parsing
    marked.setOptions({
      gfm: true,
      breaks: true,
    });

    const rawHtml = marked.parse(content) as string;

    // Sanitize with DOMPurify to prevent XSS
    if (typeof window !== "undefined") {
      return DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ["target", "rel"],
      });
    }

    return rawHtml;
  }, [content]);

  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert text-foreground text-xs sm:text-sm leading-relaxed
        [&>h1]:text-base [&>h1]:sm:text-lg [&>h1]:font-bold [&>h1]:mt-4 [&>h1]:mb-2 [&>h1]:pb-1.5 [&>h1]:border-b [&>h1]:border-border [&>h1]:text-foreground
        [&>h2]:text-sm [&>h2]:sm:text-base [&>h2]:font-bold [&>h2]:mt-3.5 [&>h2]:mb-2 [&>h2]:text-foreground
        [&>h3]:text-xs [&>h3]:sm:text-sm [&>h3]:font-semibold [&>h3]:mt-3 [&>h3]:mb-1 [&>h3]:text-foreground
        [&>p]:my-2 [&>p]:leading-relaxed
        [&>ul]:my-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1
        [&>ol]:my-2 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:space-y-1
        [&>li]:leading-relaxed
        [&>strong]:font-semibold [&>strong]:text-foreground
        [&>blockquote]:border-l-4 [&>blockquote]:border-primary/70 [&>blockquote]:bg-primary/5 [&>blockquote]:py-2 [&>blockquote]:px-3 [&>blockquote]:my-3 [&>blockquote]:rounded-r-xl [&>blockquote]:not-italic
        [&>pre]:rounded-xl [&>pre]:bg-slate-900 [&>pre]:text-slate-100 [&>pre]:p-3.5 [&>pre]:my-3 [&>pre]:overflow-x-auto [&>pre]:border [&>pre]:border-slate-800
        [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&_code]:text-primary
        [&>pre_code]:bg-transparent [&>pre_code]:text-slate-100 [&>pre_code]:p-0
        [&>table]:w-full [&>table]:my-3 [&>table]:border-collapse [&>table]:rounded-xl [&>table]:overflow-hidden [&>table]:border [&>table]:border-border
        [&_th]:bg-muted/70 [&_th]:p-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-border
        [&_td]:p-2.5 [&_td]:border [&_td]:border-border
        [&>hr]:my-4 [&>hr]:border-border/70"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

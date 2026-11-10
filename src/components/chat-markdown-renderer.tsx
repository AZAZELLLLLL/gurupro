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
      className="prose prose-sm max-w-full w-full dark:prose-invert text-foreground text-[13px] sm:text-sm md:text-[14.5px] leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word]
        [&>h1]:text-[15px] [&>h1]:sm:text-base [&>h1]:md:text-lg [&>h1]:font-bold [&>h1]:mt-3.5 [&>h1]:mb-2 [&>h1]:pb-1.5 [&>h1]:border-b [&>h1]:border-border [&>h1]:text-foreground
        [&>h2]:text-[14px] [&>h2]:sm:text-[15px] [&>h2]:md:text-base [&>h2]:font-bold [&>h2]:mt-3 [&>h2]:mb-1.5 [&>h2]:text-foreground
        [&>h3]:text-[13px] [&>h3]:sm:text-sm [&>h3]:font-semibold [&>h3]:mt-2.5 [&>h3]:mb-1 [&>h3]:text-foreground
        [&>p]:my-1.5 [&>p]:leading-relaxed
        [&>ul]:my-1.5 [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:sm:pl-5 [&>ul]:space-y-1
        [&>ol]:my-1.5 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:sm:pl-5 [&>ol]:space-y-1
        [&>li]:leading-relaxed
        [&>strong]:font-semibold [&>strong]:text-foreground
        [&>blockquote]:border-l-3 [&>blockquote]:border-primary/70 [&>blockquote]:bg-primary/5 [&>blockquote]:py-1.5 [&>blockquote]:px-2.5 [&>blockquote]:sm:px-3 [&>blockquote]:my-2.5 [&>blockquote]:rounded-r-xl [&>blockquote]:not-italic [&>blockquote]:text-muted-foreground
        [&>pre]:rounded-xl [&>pre]:bg-slate-900 [&>pre]:text-slate-100 [&>pre]:p-2.5 [&>pre]:sm:p-3.5 [&>pre]:my-2.5 [&>pre]:max-w-full [&>pre]:overflow-x-auto [&>pre]:border [&>pre]:border-slate-800 [&>pre]:text-[11.5px] [&>pre]:sm:text-xs [&>pre]:font-mono
        [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11.5px] [&_code]:sm:text-xs [&_code]:font-mono [&_code]:text-primary [&_code]:break-words
        [&>pre_code]:bg-transparent [&>pre_code]:text-slate-100 [&>pre_code]:p-0
        [&>table]:w-full [&>table]:max-w-full [&>table]:my-2.5 [&>table]:border-collapse [&>table]:rounded-xl [&>table]:overflow-x-auto [&>table]:block [&>table]:sm:table [&>table]:border [&>table]:border-border [&>table]:text-[12px] [&>table]:sm:text-xs
        [&_th]:bg-muted/70 [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-border
        [&_td]:p-2 [&_td]:border [&_td]:border-border
        [&>hr]:my-3.5 [&>hr]:border-border/70"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

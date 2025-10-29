"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import MarkdownLite from "@/components/markdown-lite";
import type { MessageRole } from "@/lib/chat/types";

export default function MessageBubble({ role, content }: { role: MessageRole; content: string }) {
  const isUser = role === "user";
  const render = isUser ? <pre className="whitespace-pre-wrap">{content}</pre>
                        : <MarkdownLite text={content} />;

  return (
    <div className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <Avatar className="h-7 w-7"><AvatarFallback>AI</AvatarFallback></Avatar>}
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed border ${isUser ? "bg-primary text-primary-foreground border-transparent" : "bg-muted"}`}>
        {render}
      </div>
      {isUser && <Avatar className="h-7 w-7"><AvatarFallback>U</AvatarFallback></Avatar>}
    </div>
  );
}

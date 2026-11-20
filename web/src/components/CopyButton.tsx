import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from './ui/button';

interface CopyButtonProps extends Omit<ButtonProps, 'onClick'> {
  text: string;
  label?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label,
  size = 'sm',
  variant = 'outline',
  ...props
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:-1000px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        toast.success('已复制到剪贴板');
        setTimeout(() => setCopied(false), 1600);
      } catch {
        toast.error('复制失败，请手动复制');
      }
      ta.remove();
    }
  };

  return (
    <Button type="button" size={size} variant={variant} onClick={handleCopy} {...props}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {label && <span>{copied ? '已复制' : label}</span>}
    </Button>
  );
};

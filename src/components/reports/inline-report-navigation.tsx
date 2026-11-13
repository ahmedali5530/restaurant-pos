import {useEffect, useRef} from 'react';
import {useNavigate} from 'react-router';
import {isTauriDesktop} from '@/lib/desktop.ts';
import {toInlineReportPath} from '@/lib/inline-report.ts';

/**
 * Desktop has one window. Report forms and report links stay in it.
 * The browser still opens those in a new tab.
 */
export const InlineReportNavigation = () => {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!isTauriDesktop()) return;

    const openInline = (action: string, params: URLSearchParams) => {
      const path = toInlineReportPath(action, params, window.location.origin);
      if (!path) return false;
      navigateRef.current(path);
      return true;
    };

    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if ((form.getAttribute('target') || '').toLowerCase() !== '_blank') return;
      const action = form.getAttribute('action') || '';
      const params = new URLSearchParams();
      new FormData(form).forEach((value, key) => {
        if (typeof value === 'string') params.append(key, value);
      });
      if (!openInline(action, params)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (!anchor) return;
      if ((anchor.getAttribute('target') || '').toLowerCase() !== '_blank') return;
      const href = anchor.getAttribute('href') || '';
      if (!openInline(href, new URLSearchParams())) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const originalOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const raw = url == null ? '' : String(url);
      if (raw && openInline(raw, new URLSearchParams())) {
        return null;
      }
      return originalOpen(url as string | URL | undefined, target, features);
    }) as typeof window.open;

    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('click', onClick, true);
      window.open = originalOpen;
    };
  }, []);

  return null;
};

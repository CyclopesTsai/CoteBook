import { PAGE_TITLE_MAX_LENGTH } from '@cotebook/shared';
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/** The large, auto-growing page title. Enter moves focus into the page content. */
export const TitleField = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    readOnly?: boolean;
    onChange: (title: string) => void;
    onBlur?: () => void;
    onEnter: () => void;
  }
>(function TitleField({ value, readOnly = false, onChange, onBlur, onEnter }, forwardedRef) {
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current!);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="page-title"
      rows={1}
      value={value}
      readOnly={readOnly}
      maxLength={PAGE_TITLE_MAX_LENGTH}
      placeholder={t('page.titlePlaceholder')}
      aria-label={t('page.titlePlaceholder')}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ''))}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
});

import {ChangeEvent, forwardRef, HTMLProps, Ref, useCallback, useEffect, useRef, useState} from "react";
import { cn } from "@/lib/utils.ts";
import {VirtualKeyboard} from "@/components/common/input/virtual.keyboard.tsx";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";

interface InputProps extends HTMLProps<HTMLTextAreaElement>{
  label?: string;
  enableKeyboard?: boolean;
}

export const Textarea = forwardRef((
  props: InputProps, ref: Ref<HTMLTextAreaElement>
) => {
  const {enableKeyboard = true, ...rest} = props;

  const [showKeyboard, setShowKeyboard] = useState(false);
  const [keyboardValue, setKeyboardValue] = useState((props.value as any)?.toString?.() || '');
  const inputElRef = useRef<HTMLTextAreaElement | null>(null);

  const [page] = useAtom(appPage);

  const assignRef = useCallback((node: HTMLTextAreaElement | null) => {
    inputElRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref && typeof (ref as any) === 'object') {
      (ref as any).current = node;
    }
  }, [ref]);

  const handleMouseDownOpen = useCallback((e: any) => {
    if (props.onMouseDown) props.onMouseDown(e);
    if (!(enableKeyboard && page.touch)) return;
    if (e.defaultPrevented) return;
    e.preventDefault();
    setKeyboardValue((props.value as any)?.toString?.() || '');
    setShowKeyboard(true);
  }, [enableKeyboard, page.touch, props.onMouseDown, props.value]);

  const handleKeyboardClose = useCallback(() => {
    setShowKeyboard(false);
    if (inputElRef.current) {
      requestAnimationFrame(() => {
        if (inputElRef.current) inputElRef.current.blur();
      });
    }
  }, []);

  const emitKeyboardChange = useCallback((value: string) => {
    if (!props.onChange) {
      return;
    }

    const syntheticEvent = {
      target: {value},
      currentTarget: {value},
    } as ChangeEvent<HTMLTextAreaElement>;

    props.onChange(syntheticEvent);
  }, [props]);

  // Keep internal keyboardValue in sync with external value when keyboard is not open
  useEffect(() => {
    if (!(enableKeyboard && page.touch)) return;
    if (!showKeyboard) {
      const next = (props.value as any)?.toString?.() || '';
      if (next !== keyboardValue) {
        setKeyboardValue(next);
      }
    }
  }, [props.value, enableKeyboard, page.touch, showKeyboard]);

  return (
    <>
      <textarea
        {...rest}
        className={
          cn(
            'form-control mousetrap',
            props.className && props.className
          )
        }
        ref={assignRef}
        value={enableKeyboard && page.touch ? keyboardValue : rest.value}
        onChange={enableKeyboard && page.touch ? undefined : rest.onChange}
        readOnly={enableKeyboard && page.touch ? true : rest.readOnly}
        onMouseDown={enableKeyboard && page.touch ? handleMouseDownOpen : rest.onMouseDown}
      />
      {enableKeyboard && page.touch && showKeyboard && (
        <VirtualKeyboard
          open={showKeyboard}
          onClose={handleKeyboardClose}
          type={undefined}
          placeholder={props.placeholder}
          value={keyboardValue}
          onChange={(v) => {
            setKeyboardValue(v);
            emitKeyboardChange(v);
          }}
        />
      )}
    </>
  );
});

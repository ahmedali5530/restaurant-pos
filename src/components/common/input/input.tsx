import {
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {NumericFormat} from "react-number-format";
import {cn} from "@/lib/utils.ts";
import {nanoid} from "nanoid";
import {VirtualKeyboard} from "@/components/common/input/virtual.keyboard.tsx";
import {useFormContext} from "react-hook-form";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: "lg"
  selectable?: boolean;
  hasError?: boolean;
  label?: ReactNode;
  error?: any;
  enableKeyboard?: boolean;
  disableDirectInput?: boolean;
  decimalScale?: number;
  allowNegative?: boolean;
}

export const Input = forwardRef((props: InputProps, ref: Ref<any>) => {
  const {
    type,
    selectable,
    inputSize,
    hasError,
    label,
    error,
    enableKeyboard,
    disableDirectInput,
    className,
    value,
    defaultValue,
    onChange,
    onBlur,
    onFocus,
    readOnly,
    placeholder,
    autoFocus,
    disabled,
    name,
    decimalScale,
    allowNegative = false,
    id: providedId,
    ...inputProps
  } = props;
  let formContext: ReturnType<typeof useFormContext> | null = null;
  try {
    formContext = useFormContext();
  } catch (e) {
    formContext = null;
  }
  const registeredValue = formContext && name ? formContext.watch(name) : undefined;
  const resolvedValue = value !== undefined ? value : (!enableKeyboard ? registeredValue : undefined);
  const onClick = useCallback((event: any) => {
    if (selectable !== false) {
      event.currentTarget.select();
    }
  }, [selectable]);

  const [page] = useAtom(appPage);

  // Keyboard functionality
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [keyboardValue, setKeyboardValue] = useState(resolvedValue?.toString() || '');

  const inputElRef = useRef<HTMLInputElement | null>(null);
  const suppressFocusRef = useRef<boolean>(false);

  const assignInputRef = useCallback((node: HTMLInputElement | null) => {
    inputElRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref && typeof (ref as any) === 'object') {
      (ref as any).current = node;
    }
  }, [ref]);

  const handleInputFocus = useCallback(() => {
    if (!enableKeyboard) return;
    if (suppressFocusRef.current) {
      // Single-cycle suppression: consume once, then allow subsequent focuses immediately
      suppressFocusRef.current = false;
      return;
    }
    setKeyboardValue(resolvedValue?.toString() || '');
    setShowKeyboard(true);
  }, [enableKeyboard, resolvedValue]);

  const handleKeyboardClose = useCallback(() => {
    suppressFocusRef.current = true;
    setShowKeyboard(false);
    // Defer blur to the next frame so it doesn't generate extra sync focus churn
    if (inputElRef.current) {
      requestAnimationFrame(() => {
        if (inputElRef.current) inputElRef.current.blur();
      });
    }
  }, []);

  const handleMouseDownOpen = useCallback((e: any) => {
    if (!enableKeyboard) return;
    // prevent the input from gaining focus; we'll manage keyboard explicitly
    e.preventDefault();
    e.stopPropagation();
    setKeyboardValue(resolvedValue?.toString() || '');
    setShowKeyboard(true);
  }, [enableKeyboard, resolvedValue]);

  // Keep internal keyboardValue in sync with external value when keyboard is not open
  useEffect(() => {
    if (!enableKeyboard) return;
    if (!showKeyboard) {
      const next = resolvedValue?.toString() || '';
      if (next !== keyboardValue) {
        setKeyboardValue(next);
      }
    }
  }, [resolvedValue, enableKeyboard, showKeyboard, keyboardValue]);

  const id = useMemo(() => providedId ?? nanoid(), [providedId]);

  const formattedHelp = useMemo(() => {
    return error && <InputError error={error}/>
  }, [error,]);

  if (type === 'number') {
    return (
      <>
        {label && <label htmlFor={id}>{label}</label>}
        <NumericFormat
          {...inputProps}
          name={name}
          defaultValue={defaultValue as any}
          {...(enableKeyboard && page.touch
            ? { value: keyboardValue }
            : resolvedValue !== undefined
              ? { value: resolvedValue as any }
              : {})}
          onChange={enableKeyboard && page.touch ? undefined : onChange}
          autoComplete="off"
          className={
            cn(
              'input',
              inputSize === 'lg' && 'lg',
              className && className,
              hasError && 'error',
            )
          }
          getInputRef={assignInputRef}
          onClick={onClick}
          readOnly={enableKeyboard && page.touch ? true : readOnly}
          disabled={disabled}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onFocus={onFocus}
          onMouseDown={enableKeyboard && page.touch ? handleMouseDownOpen : undefined}
          onBlur={onBlur}
          id={id}
          decimalScale={decimalScale}
          allowNegative={allowNegative}
        />
        {formattedHelp}
        {enableKeyboard && showKeyboard && page.touch && (
          <VirtualKeyboard
            open={showKeyboard}
            onClose={handleKeyboardClose}
            type={type}
            placeholder={placeholder}
            value={keyboardValue}
            onChange={(v) => {
              setKeyboardValue(v);
              if (onChange) {
                onChange({ target: { value: v } } as any);
              }
            }}
          />
        )}
      </>
    );
  } else {
    return (
      <>
        {label && <label htmlFor={id}>{label}</label>}
        <input
          type={type || 'text'}
          onClick={onClick}
          autoComplete="off"
          name={name}
          defaultValue={defaultValue}
          {...inputProps}
          value={enableKeyboard && page.touch ? keyboardValue : resolvedValue}
          onChange={enableKeyboard && page.touch ? undefined : onChange}
          onFocus={onFocus}
          onMouseDown={enableKeyboard && page.touch ? handleMouseDownOpen : undefined}
          readOnly={enableKeyboard && page.touch ? true : readOnly}
          className={
            cn(
              'input',
              inputSize === 'lg' && 'lg',
              className && className,
              hasError && 'error'
            )
          }
          ref={assignInputRef}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          onBlur={onBlur}
          id={id}
        />
        {formattedHelp}
        {enableKeyboard && showKeyboard && page.touch && (
          <VirtualKeyboard
            open={showKeyboard}
            onClose={handleKeyboardClose}
            type={type}
            placeholder={placeholder}
            value={keyboardValue}
            onChange={(v) => {
              setKeyboardValue(v);
              if (onChange) {
                onChange({ target: { value: v } } as any);
              }
            }}
          />
        )}
      </>
    );
  }
});

export const InputError = ({
  error
}: { error?: ReactNode }) => {
  return (
    <div className="text-danger-500 text-sm">{error}</div>
  );
}

import {ReactNode, useCallback, useMemo, useState} from "react";
import {Button} from "@/components/common/input/button.tsx";
import {cn} from "@/lib/utils.ts";
import {useTranslation} from "react-i18next";
import type {DishSearchType} from "@/store/jotai.ts";

const MAX_NUMBER_LENGTH = 12;
const MAX_BOTH_LENGTH = 40;

interface DishSearchKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  searchType: DishSearchType;
}

export const DishSearchKeyboard = ({
  value,
  onChange,
  searchType,
}: DishSearchKeyboardProps) => {
  const {t} = useTranslation('menu');
  const [isCaps, setIsCaps] = useState(false);
  const isNumberOnly = searchType === 'number';
  const maxLength = isNumberOnly ? MAX_NUMBER_LENGTH : MAX_BOTH_LENGTH;

  const letters: Record<string, {normal: string | ReactNode; shift: string | ReactNode}> = useMemo(() => ({
    'a': {normal: 'a', shift: 'A'}, 'b': {normal: 'b', shift: 'B'}, 'c': {normal: 'c', shift: 'C'},
    'd': {normal: 'd', shift: 'D'}, 'e': {normal: 'e', shift: 'E'}, 'f': {normal: 'f', shift: 'F'},
    'g': {normal: 'g', shift: 'G'}, 'h': {normal: 'h', shift: 'H'}, 'i': {normal: 'i', shift: 'I'},
    'j': {normal: 'j', shift: 'J'}, 'k': {normal: 'k', shift: 'K'}, 'l': {normal: 'l', shift: 'L'},
    'm': {normal: 'm', shift: 'M'}, 'n': {normal: 'n', shift: 'N'}, 'o': {normal: 'o', shift: 'O'},
    'p': {normal: 'p', shift: 'P'}, 'q': {normal: 'q', shift: 'Q'}, 'r': {normal: 'r', shift: 'R'},
    's': {normal: 's', shift: 'S'}, 't': {normal: 't', shift: 'T'}, 'u': {normal: 'u', shift: 'U'},
    'v': {normal: 'v', shift: 'V'}, 'w': {normal: 'w', shift: 'W'}, 'x': {normal: 'x', shift: 'X'},
    'y': {normal: 'y', shift: 'Y'}, 'z': {normal: 'z', shift: 'Z'},
    '1': {normal: '1', shift: '1'}, '2': {normal: '2', shift: '2'}, '3': {normal: '3', shift: '3'},
    '4': {normal: '4', shift: '4'}, '5': {normal: '5', shift: '5'}, '6': {normal: '6', shift: '6'},
    '7': {normal: '7', shift: '7'}, '8': {normal: '8', shift: '8'}, '9': {normal: '9', shift: '9'},
    '0': {normal: '0', shift: '0'},
    '-': {normal: '-', shift: '-'},
    '*bs': {normal: '⌫', shift: '⌫'},
    '*caps': {normal: 'caps', shift: 'CAPS'},
    '*space': {normal: 'Space', shift: 'Space'},
    '*clear': {normal: 'C', shift: 'C'},
  }), []);

  const numericLayout = useMemo(() => ([
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*bs', '0', '*clear'],
  ]), []);

  const alphaLayout = useMemo(() => ([
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*bs'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['*caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '*clear'],
    ['*space'],
  ]), []);

  const keyboardLayout = isNumberOnly ? numericLayout : alphaLayout;

  const append = useCallback((next: string) => {
    onChange((value + next).slice(0, maxLength));
  }, [maxLength, onChange, value]);

  const handleKeyPress = useCallback((key: string) => {
    if (key === '*bs') {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === '*caps') {
      setIsCaps(prev => !prev);
      return;
    }
    if (key === '*space') {
      if (isNumberOnly) {
        return;
      }
      append(' ');
      return;
    }
    if (key === '*clear') {
      onChange('');
      return;
    }
    if (isNumberOnly && !/^\d$/.test(key)) {
      return;
    }
    const entry = letters[key];
    const char = entry ? entry[isCaps && !isNumberOnly ? 'shift' : 'normal'] : key;
    append(String(char));
  }, [append, isCaps, isNumberOnly, letters, onChange, value]);

  const placeholder = isNumberOnly
    ? t('search.placeholderNumber')
    : t('search.placeholderBoth');

  return (
    <div className="dishes-search-keyboard flex w-full flex-col gap-2 rounded-xl bg-white p-3">
      <div
        className={cn(
          "flex min-h-[48px] items-center justify-center rounded-xl border-2 border-primary-200 bg-neutral-50 px-4 font-bold text-neutral-800",
          isNumberOnly ? "text-3xl tracking-widest" : "text-2xl tracking-wide"
        )}
        aria-live="polite"
      >
        {value || (
          <span className="text-base font-medium tracking-normal text-neutral-400">
            {placeholder}
          </span>
        )}
      </div>

      <div
        className={cn(
          "flex flex-col gap-2",
          isNumberOnly && "mx-auto w-full max-w-md"
        )}
      >
        {keyboardLayout.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={cn(
              "flex flex-row justify-center gap-1.5",
              isNumberOnly ? "gap-2" : "flex-wrap"
            )}
          >
            {row.map((key) => (
              <Button
                key={`${rowIndex}-${key}`}
                size={isNumberOnly ? "xl" : "lg"}
                flat
                variant="primary"
                active={key === '*caps' && isCaps}
                className={cn(
                  "!normal-case",
                  isNumberOnly
                    ? "min-h-[56px] min-w-0 flex-1"
                    : "min-h-[48px] min-w-[44px]",
                  key === '*space' && "min-w-[min(100%,320px)] flex-1",
                  key === '*caps' && !isNumberOnly && "min-w-[64px]",
                  (key === '*clear' || key === '*bs') && "!bg-danger-500 text-white",
                )}
                onClick={() => handleKeyPress(key)}
              >
                {letters[key] ? letters[key][isCaps && !isNumberOnly ? 'shift' : 'normal'] : key}
              </Button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

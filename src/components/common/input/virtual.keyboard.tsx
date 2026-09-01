import {ReactNode, useCallback, useMemo, useState} from "react";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {cn} from "@/lib/utils.ts";

interface VirtualKeyboardProps {
  open: boolean;
  onClose: () => void;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

export function VirtualKeyboard(props: VirtualKeyboardProps) {
  const {open, onClose, type, placeholder, value, onChange} = props;

  const [isCaps, setIsCaps] = useState(false);

  const letters: {
    [index: string]: { normal: string | ReactNode, shift: string | ReactNode }
  } = useMemo(() => ({
    'a': {normal: 'a', shift: 'A'}, 'b': {normal: 'b', shift: 'B'}, 'c': {normal: 'c', shift: 'C'},
    'd': {normal: 'd', shift: 'D'}, 'e': {normal: 'e', shift: 'E'}, 'f': {normal: 'f', shift: 'F'},
    'g': {normal: 'g', shift: 'G'}, 'h': {normal: 'h', shift: 'H'}, 'i': {normal: 'i', shift: 'I'},
    'j': {normal: 'j', shift: 'J'}, 'k': {normal: 'k', shift: 'K'}, 'l': {normal: 'l', shift: 'L'},
    'm': {normal: 'm', shift: 'M'}, 'n': {normal: 'n', shift: 'N'}, 'o': {normal: 'o', shift: 'O'},
    'p': {normal: 'p', shift: 'P'}, 'q': {normal: 'q', shift: 'Q'}, 'r': {normal: 'r', shift: 'R'},
    's': {normal: 's', shift: 'S'}, 't': {normal: 't', shift: 'T'}, 'u': {normal: 'u', shift: 'U'},
    'v': {normal: 'v', shift: 'V'}, 'w': {normal: 'w', shift: 'W'}, 'x': {normal: 'x', shift: 'X'},
    'y': {normal: 'y', shift: 'Y'}, 'z': {normal: 'z', shift: 'Z'},
    '`': {normal: '`', shift: '~'}, '1': {normal: '1', shift: '!'}, '2': {normal: '2', shift: '@'},
    '3': {normal: '3', shift: '#'}, '4': {normal: '4', shift: '$'}, '5': {normal: '5', shift: '%'},
    '6': {normal: '6', shift: '^'}, '7': {normal: '7', shift: '&'}, '8': {normal: '8', shift: '*'},
    '9': {normal: '9', shift: '('}, '0': {normal: '0', shift: ')'}, '-': {normal: '-', shift: '_'},
    '=': {normal: '=', shift: '+'}, '[': {normal: '[', shift: '{'}, ']': {normal: ']', shift: '}'},
    ';': {normal: ';', shift: ':'}, "'": {normal: "'", shift: '"'}, ',': {normal: ',', shift: '<'},
    '.': {normal: '.', shift: '>'}, '/': {normal: '/', shift: '?'}, "\\": {normal: "\\", shift: '|'},
    '*bs': {normal: '⌫', shift: '⌫'},
    '*caps': {normal: 'caps', shift: 'CAPS'}, '*space': {normal: 'Space', shift: 'Space'},
    '*clear': {normal: 'C', shift: 'C'}
  }), []);

  const numericLayout = useMemo(() => ([
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['.', '0',],
    ['*clear', '*bs']
  ]), []);

  const alphaLayout = useMemo(() => ([
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '*bs'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['*caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
    ['*space', '*clear']
  ]), []);

  const keyboardLayout = type === 'number' ? numericLayout : alphaLayout;

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
      onChange(value + ' ');
      return;
    }
    if (key === '*clear') {
      onChange('');
      return;
    }
    if (key === '.') {
      if (type === 'number' && value.includes('.')) {
        return;
      }
      onChange(value + key);
      return;
    }
    const char = (letters as any)[key] ? (letters as any)[key][isCaps ? 'shift' : 'normal'] : key;
    onChange(value + String(char));
  }, [isCaps, letters, onChange, type, value]);

  const isNumeric = type === 'number';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={isNumeric ? 'sm' : 'lg'}
      shouldCloseOnEsc
      shouldCloseOnOverlayClick
      title={placeholder}
      shouldCenter
      bottomSheet
    >
      <div className="container p-4">
        <div className="mb-4">
          <input
            type={type}
            className="input xl w-full"
            placeholder={placeholder}
            value={value}
            readOnly
          />
        </div>
        <div className="flex gap-y-2 flex-col">
          {keyboardLayout.map((row: string[], rowIndex: number) => (
            <div key={rowIndex} className="flex gap-2 flex-row justify-center">
              {row.map((key, keyIndex) => (
                isNumeric ? (
                  <Button
                    key={`${rowIndex}-${keyIndex}`}
                    className={
                      cn(
                        "btn btn-primary btn-flat xl btn-square",
                        key === '*clear' && '!bg-danger-500 text-white',
                        key === '*bs' && '!bg-danger-500 text-white',
                        key === '*space' && '!w-[250px]'
                      )
                    }
                    onClick={() => handleKeyPress(key)}
                    size="lg"
                  >
                    {(letters as any)[key] ? (letters as any)[key][isCaps ? 'shift' : 'normal'] : key}
                  </Button>
                ) : (
                  <button
                    className={
                      cn(
                        "btn btn-primary btn-flat xl btn-square !normal-case",
                        key === '*clear' && '!bg-danger-500 text-white',
                        key === '*space' && '!w-[250px]',
                        key === '*bs' && '!bg-danger-500 text-white',
                      )
                    }
                    key={`${rowIndex}-${keyIndex}`}
                    onClick={() => handleKeyPress(key)}
                  >
                    {(letters as any)[key] ? (letters as any)[key][isCaps ? 'shift' : 'normal'] : key}
                  </button>
                )
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}



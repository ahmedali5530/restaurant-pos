import React, { InputHTMLAttributes, ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/common/input/button.tsx";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { cn } from "@/lib/utils.ts";

export interface KeyboardProps extends InputHTMLAttributes<HTMLInputElement> {
  type?: 'text' | 'number' | 'email' | 'password';
  layout?: 'default' | 'numeric' | 'alpha';
  caps?: boolean;
  inputClassName?: string;
  keyboardClassName?: string;
  customLayout?: [string[] | number[]];
  enabled?: boolean;
  showControls?: boolean;
  isFirstLetterUppercase?: boolean;
  showNumericRow?: boolean
  showShift?: boolean;
  showSpacebar?: boolean;
  btnClassName?: string;
  onOk?: (value?: string) => void;
  onClose?: () => void;
  onCancel?: () => void;
  onClear?: () => void;
  show?: boolean;
  extraButtons?: [string[] | number[]];
  onchange?: (value: any) => void;
  onkeydown?: (key: any, char: any, value: any) => void;
  hideKeyboard?: boolean;
  triggerWithIcon?: boolean;
  innerRef?: any;

}

export const Keyboard = (props: KeyboardProps) => {

  const letters: {
    [index: string]: { normal: string | ReactNode, shift: string | ReactNode }
  } = {
    'a': { normal: 'a', shift: 'A' },
    'b': { normal: 'b', shift: 'B' },
    'c': { normal: 'c', shift: 'C' },
    'd': { normal: 'd', shift: 'D' },
    'e': { normal: 'e', shift: 'E' },
    'f': { normal: 'f', shift: 'F' },
    'g': { normal: 'g', shift: 'G' },
    'h': { normal: 'h', shift: 'H' },
    'i': { normal: 'i', shift: 'I' },
    'j': { normal: 'j', shift: 'J' },
    'k': { normal: 'k', shift: 'K' },
    'l': { normal: 'l', shift: 'L' },
    'm': { normal: 'm', shift: 'M' },
    'n': { normal: 'n', shift: 'N' },
    'o': { normal: 'o', shift: 'O' },
    'p': { normal: 'p', shift: 'P' },
    'q': { normal: 'q', shift: 'Q' },
    'r': { normal: 'r', shift: 'R' },
    's': { normal: 's', shift: 'S' },
    't': { normal: 't', shift: 'T' },
    'u': { normal: 'u', shift: 'U' },
    'v': { normal: 'v', shift: 'V' },
    'w': { normal: 'w', shift: 'W' },
    'x': { normal: 'x', shift: 'X' },
    'y': { normal: 'y', shift: 'Y' },
    'z': { normal: 'z', shift: 'Z' },
    '`': { normal: '`', shift: '~' },
    '1': { normal: '1', shift: '!' },
    '2': { normal: '2', shift: '@' },
    '3': { normal: '3', shift: '#' },
    '4': { normal: '4', shift: '$' },
    '5': { normal: '5', shift: '%' },
    '6': { normal: '6', shift: '^' },
    '7': { normal: '7', shift: '&' },
    '8': { normal: '8', shift: '*' },
    '9': { normal: '9', shift: '(' },
    '0': { normal: '0', shift: ')' },
    '-': { normal: '-', shift: '_' },
    '=': { normal: '=', shift: '+' },
    '[': { normal: '[', shift: '{' },
    ']': { normal: ']', shift: '}' },
    ';': { normal: ';', shift: ':' },
    "'": { normal: "'", shift: '"' },
    ',': { normal: ',', shift: '<' },
    '.': { normal: '.', shift: '>' },
    '/': { normal: '/', shift: '?' },
    "\\": { normal: "\\", shift: '|' },
    '*bs': { normal: <i className="fa fa-backspace"/>, shift: <i className="fa fa-backspace"/> },
    '*en': { normal: 'Enter', shift: 'Enter' },
    '*sh': { normal: 'caps', shift: 'CAPS' },
    '*c': { normal: 'C', shift: 'C' },
    '*space': { normal: 'Space', shift: 'Space' },
    '*ok': { normal: 'OK', shift: 'OK' },
    '*cancel': { normal: 'Cancel', shift: 'Cancel' }
  };

  const numericTopLayout = ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '*bs', '*c'];
  const alphaLayout = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', "\\"],
    ['*sh', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
    ['*space', '*ok', '*cancel']
  ];

  const defaultLayout = [
    [...numericTopLayout],
    ...alphaLayout
  ];

  const defaultAlphaLayout = [
    ...alphaLayout
  ];

  const defaultNumericLayout = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['0', '.', '*c'],
    ['*ok', '*cancel']
  ];

  const layouts = {
    'default': defaultLayout,
    'numeric': defaultNumericLayout,
    'alpha': defaultAlphaLayout,
  };

  const [isCaps, setCaps] = useState(props.caps);

  const layout: any = useMemo(() => {
    if( props.type === 'number' ) {
      return layouts["numeric"];
    }

    return layouts[props.layout || 'default'];
  }, [props.layout, props.type]);

  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const [value, setValue] = useState('');

  useEffect(() => {
    if( typeof props.show !== 'undefined' ) {
      setShow(props.show);
    }
  }, [props.show]);

  useEffect(() => {
    if( props.value !== undefined ) {
      setValue(props.value.toString());
    }
  }, [props.value, props.type]);

  useEffect(() => {
    if( props.onchange ) {
      props.onchange(value);
    }
  }, [value, props.onchange]);

  const isActionBtn = (key: string) => {
    return key.indexOf('*') !== -1;
  };

  const [isInvalid, setInvalid] = useState(false);


  const hasDecimal = (key: string) => {
    return key.indexOf('.') !== -1;
  };

  const onBtnPress = (key: string | number, formattedLetter: string | ReactNode) => {
    setInvalid(false);

    key = key.toString();

    if( !isActionBtn(key) ) {
      if( key === '.' && !hasDecimal(value) ) {
        //for decimal
        setValue(prev => prev + formattedLetter);
      } else if( key !== '.' ) {
        //for other values
        setValue(prev => prev + formattedLetter);
      }

      if( props.onkeydown ) {
        props.onkeydown(key, formattedLetter, value);
      }
    } else if( key === '*bs' ) {
      setValue(prevState => prevState.substring(0, prevState.length - 1));
    } else if( key === '*sh' ) {
      setCaps(!isCaps);
    } else if( key === '*c' ) {
      setValue('');
      if( props.onClear ) {
        props.onClear();
      }
    } else if( key === '*space' ) {
      setValue(prevState => prevState + ' ');
    } else if( key === '*ok' ) {
      if( props.required === true && value.trim().length === 0 ) {
        setInvalid(true);
      } else if( props.required === true && value.trim().length !== 0 ) {
        setShow(false);
      }

      if( props.required !== true ) {
        setShow(false);
      }

      if( props.onOk ) {
        props.onOk(value);
      }
    } else if( key === '*cancel' ) {
      setValue('');

      if( props.required === true ) {
        setInvalid(true);
      } else {
        setShow(false);
      }

      if( props.onCancel ) {
        props.onCancel();
      }
    }
  };

  const buttonClasses: { [name: string]: string } = {
    '*ok': 'bg-success-500 text-white',
    '*cancel': 'bg-danger-500 text-white px-5',
    '*space': 'w-[250px]'
  };

  const buttonContainerClasses: { [name: string]: string } = {};

  return (
    <>
      <div className="form-group relative">
        <label htmlFor="keyboard-input">{props.placeholder}</label>
        <input
          id="keyboard-input"
          // type={props.type}
          className={cn(
            'form-control',
            !props.hideKeyboard && 'keyboard-input',
            props.inputClassName
          )}
          placeholder={props.placeholder}
          onFocus={() => {
            if( props.triggerWithIcon ) {
              return false;
            }

            if( !props.hideKeyboard ) {
              setShow(true);
            }
          }}
          required={props.required}
          value={value}
          onChange={(event) => {
            if( props.onchange ) {
              props.onchange(event.target.value);
            }
          }}
          ref={props?.innerRef}
        />
        {props.triggerWithIcon && (
          <Button
            type="button"
            className="keyboard-input-button absolute right-0 top-[24px] h-[40px] w-[40px] border rounded-lg border-primary-500 bg-transparent"
            onClick={() => {
              if( !props.hideKeyboard ) {
                setShow(true)
              }
            }}
          ></Button>
        )}

      </div>

      <Modal
        open={show}
        onClose={handleClose}
        size={'md'}
        bottomSheet={true}
      >
        <div className={cn(
          'container',
          props.keyboardClassName
        )}>
          <div className="mb-12">
            <input
              type={props.type}
              className={cn(
                'form-control',
                isInvalid ? 'is-invalid' : ''
              )}
              placeholder={props.placeholder}
              value={value}
              onChange={() => {
              }}
            />
          </div>
          <div className="flex gap-y-4 flex-col">
            {layout.map((row: string[], key: number) => (
              <div key={key} className="flex gap-4 flex-row justify-center align-center">
                {row.map((item, index) => (
                  <div key={index + key} className={cn(
                    '',
                    buttonContainerClasses[item] && buttonContainerClasses[item]
                  )}>
                    <Button
                      className={cn(
                        'btn-keyboard',
                        props.btnClassName,
                        buttonClasses[item] && buttonClasses[item]
                      )}
                      onClick={() => onBtnPress(item, letters[item as string][isCaps ? 'shift' : 'normal'])}
                      disabled={props.enabled === false}
                      size="lg"
                    >{letters[item as string][isCaps ? 'shift' : 'normal']}</Button>
                  </div>
                ))}
              </div>
            ))}
            {props?.extraButtons?.map((row, index) => (
              <div className="flex gap-4 flex-row justify-center align-center" key={index}>
                {row.map((item, key) => (
                  <div className={cn(
                    'px-2',
                    buttonContainerClasses[item] && buttonContainerClasses[item]
                  )} key={index + key}>
                    <Button
                      className={cn(
                        'btn-keyboard',
                        props.btnClassName,
                        buttonClasses[item] && buttonClasses[item]
                      )}
                      onClick={() => onBtnPress(item, item)}
                      disabled={props.enabled === false}
                      size="lg"
                    >{item}</Button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        {/*</Offcanvas.Body>*/}
      </Modal>
    </>
  );
};

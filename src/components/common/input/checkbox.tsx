import {HTMLProps, useEffect, useId, useRef} from "react";
import { cn } from "@/lib/utils.ts";

interface InputProps extends HTMLProps<HTMLInputElement>{
  indeterminate?: boolean;
  label?: string;
}

export const Checkbox = (props: InputProps) => {
  const ref = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const {indeterminate, id: propsId, label, ...rest} = props;
  const id = propsId ?? generatedId;

  useEffect(() => {
    if(ref.current !== null){
      ref.current.indeterminate = false;
      if(typeof indeterminate === "boolean") {
        ref.current.indeterminate = indeterminate;
      }
    }
  }, [indeterminate, props.checked]);

  return (
    <div className="inline-flex items-center gap-3">
      <input
        {...rest}
        id={id}
        ref={ref}
        type="checkbox"
        className={
          cn(
            'checkbox mousetrap',
            props.className && props.className
          )
        }
      />
      {label && <label htmlFor={id} className="font-bold cursor-pointer">{label}</label>}
    </div>
  );
};

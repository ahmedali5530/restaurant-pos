import {HTMLProps, useEffect, useRef} from "react";
import _ from "lodash";
import { cn } from "@/lib/utils.ts";
import {nanoid} from "nanoid";

interface InputProps extends HTMLProps<HTMLInputElement>{

}

export const Radio = (props: InputProps) => {
  const ref = useRef<HTMLInputElement>(null);
  const {...rest} = props;

  const id = nanoid();

  return (
    <div className="inline-flex items-center gap-3">
      <input
        {...rest}
        id={id}
        ref={ref}
        type="radio"
        className={
          cn(
            'radio mousetrap',
            props.className && props.className
          )
        }
      />
      {props.label && <label htmlFor={id} className="font-bold cursor-pointer">{props.label}</label>}
    </div>
  );
};
